const express = require("express")
const router = express.Router()
const db = require("../db")
const promiseDb = db.promise()

function problem(message, status = 400) {
    const error = new Error(message)
    error.status = status
    return error
}

function positiveId(value, label = "Product") {
    const id = Number(value)
    if (!Number.isSafeInteger(id) || id <= 0) throw problem(`${label} is invalid.`)
    return id
}

function wholeNumber(value, label) {
    const number = Number(value)
    if (!Number.isSafeInteger(number) || number < 0) {
        throw problem(`${label} must be a non-negative whole number.`)
    }
    return number
}

function priceValue(value) {
    const text = String(value ?? "").trim()
    if (!/^\d+(\.\d{1,2})?$/.test(text)) {
        throw problem("Price must be a non-negative amount with up to two decimals.")
    }
    const price = Number(text)
    if (!Number.isFinite(price) || price > 99999999.99) {
        throw problem("Price is outside the allowed range.")
    }
    return price.toFixed(2)
}

function inventoryStatus(stock, alertLevel) {
    if (stock === 0) return "Out of Stock"
    if (stock <= alertLevel) return "Low Stock"
    return "In Stock"
}

function productPayload(body = {}) {
    const name = String(body.name || "").trim()
    const category = String(body.category || "").trim()

    if (!name || name.length > 150) {
        throw problem("Product name is required and must not exceed 150 characters.")
    }
    if (!category || category.length > 100) {
        throw problem("Category is required and must not exceed 100 characters.")
    }

    const stock = wholeNumber(body.stock, "Stock")
    const alertLevel = wholeNumber(body.alertLevel, "Reorder level")
    const price = priceValue(body.price)

    return {
        name,
        category,
        stock,
        alertLevel,
        price,
        status: inventoryStatus(stock, alertLevel),
    }
}

router.get("/movements", async (req, res) => {
    try {
        const [rows] = await promiseDb.query(`
            SELECT m.*, i.name AS item_name
            FROM inventory_movements m
            INNER JOIN inventory i ON i.id = m.item_id
            ORDER BY m.recorded_at DESC, m.movement_id DESC
        `)
        res.json(rows)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// Return every product, including low-stock and zero-stock items.
router.get("/", async (req, res) => {
    try {
        const [rows] = await promiseDb.query(`
            SELECT
                id,
                name,
                category,
                stock,
                alertLevel,
                price,
                CASE
                    WHEN stock = 0 THEN 'Out of Stock'
                    WHEN stock <= alertLevel THEN 'Low Stock'
                    ELSE 'In Stock'
                END AS status
            FROM inventory
            ORDER BY name, category, id
        `)
        res.json(rows)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

router.post("/", async (req, res) => {
    try {
        const product = productPayload(req.body)
        const [result] = await promiseDb.query(
            `INSERT INTO inventory
             (name, category, stock, alertLevel, price, status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                product.name,
                product.category,
                product.stock,
                product.alertLevel,
                product.price,
                product.status,
            ],
        )

        res.status(201).json({
            message: "Product added successfully.",
            id: result.insertId,
            status: product.status,
        })
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message })
    }
})

router.put("/:id", async (req, res) => {
    try {
        const id = positiveId(req.params.id)
        const product = productPayload(req.body)
        const [result] = await promiseDb.query(
            `UPDATE inventory
             SET name = ?, category = ?, stock = ?, alertLevel = ?, price = ?, status = ?
             WHERE id = ?`,
            [
                product.name,
                product.category,
                product.stock,
                product.alertLevel,
                product.price,
                product.status,
                id,
            ],
        )

        if (!result.affectedRows) throw problem("Product not found.", 404)
        res.json({ message: "Product updated successfully.", status: product.status })
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message })
    }
})

router.post("/:id/adjust", async (req, res) => {
    let connection
    let inTransaction = false

    try {
        const itemId = positiveId(req.params.id)
        const quantityChange = Number(req.body?.quantity_change)
        const reason = String(req.body?.reason || "Inventory adjustment").trim()
        const offlineId = req.body?.offline_id ? String(req.body.offline_id) : null

        if (!Number.isSafeInteger(quantityChange) || quantityChange === 0) {
            throw problem("Quantity change must be a non-zero whole number.")
        }
        if (!reason || reason.length > 255) {
            throw problem("Adjustment reason is required and must not exceed 255 characters.")
        }
        if (offlineId && offlineId.length > 64) {
            throw problem("The offline adjustment identifier is too long.")
        }

        connection = await promiseDb.getConnection()

        if (offlineId) {
            const [duplicate] = await connection.query(
                "SELECT movement_id FROM inventory_movements WHERE offline_id = ? LIMIT 1",
                [offlineId],
            )
            if (duplicate.length) {
                return res.json({
                    message: "Offline inventory adjustment was already synchronized.",
                    id: duplicate[0].movement_id,
                    duplicate: true,
                })
            }
        }

        await connection.beginTransaction()
        inTransaction = true

        const [products] = await connection.query(
            "SELECT stock, alertLevel FROM inventory WHERE id = ? FOR UPDATE",
            [itemId],
        )
        if (!products.length) throw problem("Inventory item not found.", 404)

        const newStock = Number(products[0].stock) + quantityChange
        if (newStock < 0) {
            throw problem("Adjustment would make inventory stock negative.", 409)
        }

        const status = inventoryStatus(newStock, Number(products[0].alertLevel))
        await connection.query(
            "UPDATE inventory SET stock = ?, status = ? WHERE id = ?",
            [newStock, status, itemId],
        )
        const [movement] = await connection.query(
            `INSERT INTO inventory_movements
             (item_id, quantity_change, reason, offline_id)
             VALUES (?, ?, ?, ?)`,
            [itemId, quantityChange, reason, offlineId],
        )

        await connection.commit()
        inTransaction = false
        res.status(201).json({
            message: offlineId
                ? "Offline inventory adjustment synchronized."
                : "Inventory adjusted successfully.",
            id: movement.insertId,
            stock: newStock,
            status,
        })
    } catch (error) {
        if (connection && inTransaction) {
            await connection.rollback().catch(() => {})
        }

        if (error.code === "ER_DUP_ENTRY" && req.body?.offline_id) {
            const [duplicate] = await promiseDb.query(
                "SELECT movement_id FROM inventory_movements WHERE offline_id = ? LIMIT 1",
                [String(req.body.offline_id)],
            )
            if (duplicate.length) {
                return res.json({
                    message: "Offline inventory adjustment was already synchronized.",
                    id: duplicate[0].movement_id,
                    duplicate: true,
                })
            }
        }

        res.status(error.status || (error.code === "ER_DUP_ENTRY" ? 409 : 500)).json({
            error: error.message,
        })
    } finally {
        connection?.release()
    }
})

router.delete("/:id", async (req, res) => {
    try {
        const id = positiveId(req.params.id)
        const [result] = await promiseDb.query("DELETE FROM inventory WHERE id = ?", [id])
        if (!result.affectedRows) throw problem("Product not found.", 404)
        res.json({ message: "Product deleted successfully." })
    } catch (error) {
        if (error.code === "ER_ROW_IS_REFERENCED_2") {
            return res.status(409).json({
                error: "This product has transaction or movement history and cannot be deleted. Set its stock to zero instead.",
            })
        }
        res.status(error.status || 500).json({ error: error.message })
    }
})

module.exports = router

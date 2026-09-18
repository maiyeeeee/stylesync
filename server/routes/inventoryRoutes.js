const express = require("express")
const router = express.Router()
const db = require("../db")
const promiseDb = db.promise()

router.get("/movements", async (req, res) => {
    try {
        const [rows] = await promiseDb.query(
            `SELECT m.*, i.name AS item_name
       FROM inventory_movements m
       INNER JOIN inventory i ON i.id = m.item_id
       ORDER BY m.recorded_at DESC`,
        )
        res.json(rows)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// GET all products
router.get("/", (req, res) => {
    const sql = "SELECT * FROM inventory"

    db.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message })
        }

        res.json(results)
    })
})

// ADD product
router.post("/", (req, res) => {
    const { name, category, stock, alertLevel, price } = req.body

    const status = Number(stock) <= Number(alertLevel) ? "Low Stock" : "In Stock"

    const sql = `
    INSERT INTO inventory (name, category, stock, alertLevel, price, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `

    db.query(sql, [name, category, stock, alertLevel, price || 0, status], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message })
        }

        res.json({
            message: "Product added successfully",
            id: result.insertId,
        })
    })
})

// EDIT product
router.put("/:id", (req, res) => {
    const { id } = req.params
    const { name, category, stock, alertLevel, price } = req.body

    const status = Number(stock) <= Number(alertLevel) ? "Low Stock" : "In Stock"

    const sql = `
    UPDATE inventory
    SET name = ?, category = ?, stock = ?, alertLevel = ?, price = ?, status = ?
    WHERE id = ?
  `

    db.query(sql, [name, category, stock, alertLevel, price || 0, status, id], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message })
        }

        res.json({
            message: "Product updated successfully",
        })
    })
})

router.post("/:id/adjust", async (req, res) => {
    const connection = await promiseDb.getConnection()
    try {
        const itemId = Number(req.params.id)
        const quantityChange = Number(req.body.quantity_change)
        const reason = String(req.body.reason || "Inventory adjustment").trim()
        const offlineId = req.body.offline_id ? String(req.body.offline_id) : null

        if (!Number.isInteger(quantityChange) || quantityChange === 0) {
            return res.status(400).json({ error: "Quantity change must be a non-zero integer" })
        }

        if (offlineId) {
            const [duplicate] = await connection.query(
                "SELECT movement_id FROM inventory_movements WHERE offline_id = ? LIMIT 1",
                [offlineId],
            )
            if (duplicate.length) {
                return res.json({
                    message: "Offline inventory adjustment was already synchronized",
                    id: duplicate[0].movement_id,
                    duplicate: true,
                })
            }
        }

        await connection.beginTransaction()
        const [products] = await connection.query(
            "SELECT stock, alertLevel FROM inventory WHERE id = ? FOR UPDATE",
            [itemId],
        )
        if (!products.length) {
            const error = new Error("Inventory item not found")
            error.status = 404
            throw error
        }

        const newStock = Number(products[0].stock) + quantityChange
        if (newStock < 0) {
            const error = new Error("Adjustment would make inventory stock negative")
            error.status = 409
            throw error
        }

        const status = newStock <= Number(products[0].alertLevel) ? "Low Stock" : "In Stock"
        await connection.query("UPDATE inventory SET stock = ?, status = ? WHERE id = ?", [
            newStock,
            status,
            itemId,
        ])
        const [movement] = await connection.query(
            `INSERT INTO inventory_movements
       (item_id, quantity_change, reason, offline_id)
       VALUES (?, ?, ?, ?)`,
            [itemId, quantityChange, reason, offlineId],
        )
        await connection.commit()
        res.status(201).json({
            message: offlineId
                ? "Offline inventory adjustment synchronized"
                : "Inventory adjusted successfully",
            id: movement.insertId,
            stock: newStock,
            status,
        })
    } catch (error) {
        await connection.rollback()
        if (error.code === "ER_DUP_ENTRY" && req.body?.offline_id) {
            const [duplicate] = await promiseDb.query(
                "SELECT movement_id FROM inventory_movements WHERE offline_id = ? LIMIT 1",
                [String(req.body.offline_id)],
            )
            if (duplicate.length) {
                return res.json({
                    message: "Offline inventory adjustment was already synchronized",
                    id: duplicate[0].movement_id,
                    duplicate: true,
                })
            }
        }
        res.status(error.status || 500).json({ error: error.message })
    } finally {
        connection.release()
    }
})

// DELETE product
router.delete("/:id", (req, res) => {
    const { id } = req.params

    const sql = "DELETE FROM inventory WHERE id = ?"

    db.query(sql, [id], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message })
        }

        res.json({
            message: "Product deleted successfully",
        })
    })
})

module.exports = router

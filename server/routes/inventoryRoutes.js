const express = require("express");
const router = express.Router();
const db = require("../db");
const promiseDb = db.promise();
// ====================================
// HELPERS
// ====================================
function problem(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}
function positiveId(value, label = "Product") {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw problem(`${label} is invalid.`);
  }
  return id;
}
function wholeNumber(value, label) {
  const number = Number(value);
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === "" ||
    !Number.isSafeInteger(number) ||
    number < 0
  ) {
    throw problem(
      `${label} must be a non-negative whole number.`
    );
  }
  return number;
}
function priceValue(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw problem(
      "Price must be a non-negative amount with up to two decimals."
    );
  }
  const price = Number(text);
  if (!Number.isFinite(price) || price > 99999999.99) {
    throw problem("Price is outside the allowed range.");
  }
  return price.toFixed(2);
}
function inventoryStatus(stock, alertLevel) {
  if (stock === 0) return "Out of Stock";
  if (stock <= alertLevel) return "Low Stock";
  return "In Stock";
}
function productPayload(body = {}) {
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim();
  if (!name || name.length > 150) {
    throw problem(
      "Product name is required and must not exceed 150 characters."
    );
  }
  if (!category || category.length > 100) {
    throw problem(
      "Category is required and must not exceed 100 characters."
    );
  }
  const stock = wholeNumber(body.stock, "Stock");
  const alertLevel = wholeNumber(
    body.alertLevel,
    "Reorder level"
  );
  const price = priceValue(body.price);
  return {
    name,
    category,
    stock,
    alertLevel,
    price,
    status: inventoryStatus(stock, alertLevel),
  };
}
// ====================================
// DATA QUALITY: DUPLICATE PREVENTION
// ====================================
async function checkDuplicateProduct(
  name,
  excludeId = 0,
  database = promiseDb
) {
  const [rows] = await database.query(
    `
    SELECT id
    FROM inventory
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
      AND id <> ?
    LIMIT 1
    `,
    [name, excludeId]
  );
  if (rows.length > 0) {
    throw problem(
      "This inventory product already exists. Use Stock In to add more quantity.",
      409
    );
  }
}
function sendInventoryError(res, error) {
  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      error:
        "This inventory product already exists.",
    });
  }
  console.error("Inventory operation failed:", error);
  return res.status(error.status || 500).json({
    error:
      error.status && error.status < 500
        ? error.message
        : "Unable to complete the inventory operation.",
  });
}
/* ====================================
   INVENTORY CATEGORY CRUD
   ==================================== */
function categoryName(value) {
  const name = String(value ?? "").trim();
  if (!name || name.length > 100) {
    throw problem(
      "Category name is required and must not exceed 100 characters."
    );
  }
  return name;
}
// GET /inventory/categories
router.get("/categories", async (req, res) => {
  try {
    const [rows] = await promiseDb.query(`
      SELECT
        c.category_id,
        c.name,
        COUNT(i.id) AS product_count
      FROM inventory_categories c
      LEFT JOIN inventory i
        ON TRIM(i.category) = c.name
      GROUP BY c.category_id, c.name
      ORDER BY c.name
    `);
    res.json(rows);
  } catch (error) {
    sendInventoryError(res, error);
  }
});
// POST /inventory/categories
router.post("/categories", async (req, res) => {
  try {
    const name = categoryName(req.body?.name);
    const [result] = await promiseDb.query(
      `INSERT INTO inventory_categories (name)
       VALUES (?)`,
      [name]
    );
    res.status(201).json({
      message: "Category added successfully.",
      category_id: result.insertId,
      name,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "This category already exists.",
      });
    }
    sendInventoryError(res, error);
  }
});
// PUT /inventory/categories/:id
router.put("/categories/:id", async (req, res) => {
  let connection;
  let inTransaction = false;
  try {
    const id = positiveId(req.params.id, "Category");
    const name = categoryName(req.body?.name);
    connection = await promiseDb.getConnection();
    await connection.beginTransaction();
    inTransaction = true;
    const [existing] = await connection.query(
      `SELECT name
       FROM inventory_categories
       WHERE category_id = ?
       FOR UPDATE`,
      [id]
    );
    if (!existing.length) {
      throw problem("Category not found.", 404);
    }
    const oldName = existing[0].name;
    await connection.query(
      `UPDATE inventory_categories
       SET name = ?
       WHERE category_id = ?`,
      [name, id]
    );
    // Keep existing inventory.category text
    // compatible with the new category table.
    await connection.query(
      `UPDATE inventory
       SET category = ?
       WHERE TRIM(category) = ?`,
      [name, oldName]
    );
    await connection.commit();
    inTransaction = false;
    res.json({
      message: "Category updated successfully.",
      category_id: id,
      name,
    });
  } catch (error) {
    if (connection && inTransaction) {
      await connection.rollback().catch(() => {});
    }
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "This category name already exists.",
      });
    }
    sendInventoryError(res, error);
  } finally {
    connection?.release();
  }
});
// DELETE /inventory/categories/:id
router.delete("/categories/:id", async (req, res) => {
  let connection;
  let inTransaction = false;
  try {
    const id = positiveId(req.params.id, "Category");
    connection = await promiseDb.getConnection();
    await connection.beginTransaction();
    inTransaction = true;
    const [categories] = await connection.query(
      `SELECT name
       FROM inventory_categories
       WHERE category_id = ?
       FOR UPDATE`,
      [id]
    );
    if (!categories.length) {
      throw problem("Category not found.", 404);
    }
    const [usage] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM inventory
       WHERE TRIM(category) = ?`,
      [categories[0].name]
    );
    if (Number(usage[0].total) > 0) {
      throw problem(
        "This category is used by products. Reassign those products before deleting it.",
        409
      );
    }
    await connection.query(
      `DELETE FROM inventory_categories
       WHERE category_id = ?`,
      [id]
    );
    await connection.commit();
    inTransaction = false;
    res.json({
      message: "Category deleted successfully.",
    });
  } catch (error) {
    if (connection && inTransaction) {
      await connection.rollback().catch(() => {});
    }
    sendInventoryError(res, error);
  } finally {
    connection?.release();
  }
});
// ====================================
// GET INVENTORY MOVEMENT HISTORY
// ====================================
router.get("/movements", async (req, res) => {
  try {
    const [rows] = await promiseDb.query(`
      SELECT
        m.*,
        i.name AS item_name,
        u.username AS performed_by_name
      FROM inventory_movements m
      INNER JOIN inventory i
        ON i.id = m.item_id
      LEFT JOIN users u ON u.user_id = m.performed_by
      ORDER BY
        m.recorded_at DESC,
        m.movement_id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(
      "Unable to load inventory movements:",
      error
    );
    res.status(500).json({
      error: "Unable to load inventory movement history.",
    });
  }
});
// ====================================
// GET ALL INVENTORY PRODUCTS
// ====================================
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
    `);
    res.json(rows);
  } catch (error) {
    console.error(
      "Unable to load inventory:",
      error
    );
    res.status(500).json({
      error: "Unable to load inventory products.",
    });
  }
});
// ====================================
// ADD INVENTORY PRODUCT
// DUPLICATE CHECK INCLUDED
// ====================================
router.post("/", async (req, res) => {
  let connection;
  let inTransaction = false;
  try {
    const product = productPayload(req.body);
    connection = await promiseDb.getConnection();
    await connection.beginTransaction();
    inTransaction = true;
    // DATA QUALITY:
    // Prevent duplicate product names.
    await checkDuplicateProduct(
      product.name,
      0,
      connection
    );
    const [result] = await connection.query(
      `
      INSERT INTO inventory
      (
        name,
        category,
        stock,
        alertLevel,
        price,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        product.name,
        product.category,
        product.stock,
        product.alertLevel,
        product.price,
        product.status,
      ]
    );
    // Record initial stock in movement history.
    if (product.stock > 0) {
      await connection.query(
        `
        INSERT INTO inventory_movements
        (
          item_id,
          quantity_change,
          reason,
          offline_id,
            performed_by
        )
        VALUES (?, ?, ?, NULL, ?)
        `,
        [
          result.insertId,
          product.stock,
          "Stock In: Initial inventory quantity",
          req.user?.user_id || null,
        ]
      );
    }
    await connection.commit();
    inTransaction = false;
    res.status(201).json({
      message: "Product added successfully.",
      id: result.insertId,
      status: product.status,
    });
  } catch (error) {
    if (connection && inTransaction) {
      await connection.rollback().catch(() => {});
    }
    return sendInventoryError(res, error);
  } finally {
    connection?.release();
  }
});
// ====================================
// EDIT INVENTORY PRODUCT
// DUPLICATE CHECK INCLUDED
// ====================================
router.put("/:id", async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    const product = productPayload(req.body);
    // DATA QUALITY:
    // Ignore this product's own ID.
    await checkDuplicateProduct(
      product.name,
      id
    );
    // IMPORTANT:
    // Do not update stock here.
    // Stock changes must use /:id/adjust
    // so every change appears in history.
    const [result] = await promiseDb.query(
      `
      UPDATE inventory
      SET
        name = ?,
        category = ?,
        alertLevel = ?,
        price = ?,
        status = CASE
          WHEN stock = 0 THEN 'Out of Stock'
          WHEN stock <= ? THEN 'Low Stock'
          ELSE 'In Stock'
        END
      WHERE id = ?
      `,
      [
        product.name,
        product.category,
        product.alertLevel,
        product.price,
        product.alertLevel,
        id,
      ]
    );
    if (!result.affectedRows) {
      throw problem(
        "Product not found.",
        404
      );
    }
    res.json({
      message: "Product updated successfully.",
    });
  } catch (error) {
    return sendInventoryError(res, error);
  }
});
// ====================================
// STOCK IN / STOCK OUT / DAMAGED
// ====================================
router.post("/:id/adjust", async (req, res) => {
  let connection;
  let inTransaction = false;
  try {
    const itemId = positiveId(req.params.id);
    const quantityChange = Number(
      req.body?.quantity_change
    );
    const reason = String(
      req.body?.reason || "Inventory adjustment"
    ).trim();
    const offlineId = req.body?.offline_id
      ? String(req.body.offline_id)
      : null;
    if (
      !Number.isSafeInteger(quantityChange) ||
      quantityChange === 0
    ) {
      throw problem(
        "Quantity change must be a non-zero whole number."
      );
    }
    if (!reason || reason.length > 255) {
      throw problem(
        "Adjustment reason is required and must not exceed 255 characters."
      );
    }
    // Audited manual adjustments; POS sales still record Stock Out.
    const allowed = quantityChange > 0
      ? ["Stock In:", "Adjustment:"]
      : ["Damaged:", "Return to Supplier:", "Adjustment:"];
    if (!allowed.some((prefix) => reason.startsWith(prefix))) {
      throw problem("Invalid movement type for the stock change.");
    }
    if (offlineId && offlineId.length > 64) {
      throw problem(
        "The offline adjustment identifier is too long."
      );
    }
    connection = await promiseDb.getConnection();
    // Preserve existing offline synchronization behavior.
    if (offlineId) {
      const [duplicate] = await connection.query(
        `
        SELECT movement_id
        FROM inventory_movements
        WHERE offline_id = ?
        LIMIT 1
        `,
        [offlineId]
      );
      if (duplicate.length) {
        return res.json({
          message:
            "Offline inventory adjustment was already synchronized.",
          id: duplicate[0].movement_id,
          duplicate: true,
        });
      }
    }
    await connection.beginTransaction();
    inTransaction = true;
    // Lock product while adjusting stock.
    const [products] = await connection.query(
      `
      SELECT stock, alertLevel
      FROM inventory
      WHERE id = ?
      FOR UPDATE
      `,
      [itemId]
    );
    if (!products.length) {
      throw problem(
        "Inventory item not found.",
        404
      );
    }
    const newStock =
      Number(products[0].stock) +
      quantityChange;
    if (
      !Number.isSafeInteger(newStock) ||
      newStock < 0
    ) {
      throw problem(
        "Adjustment would make inventory stock invalid or negative.",
        409
      );
    }
    const status = inventoryStatus(
      newStock,
      Number(products[0].alertLevel)
    );
    await connection.query(
      `
      UPDATE inventory
      SET stock = ?, status = ?
      WHERE id = ?
      `,
      [newStock, status, itemId]
    );
    const [movement] = await connection.query(
      `
      INSERT INTO inventory_movements
      (
        item_id,
        quantity_change,
        reason,
        offline_id,
          performed_by
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        itemId,
        quantityChange,
        reason,
        offlineId,
        req.user?.user_id || null,
      ]
    );
    await connection.commit();
    inTransaction = false;
    res.status(201).json({
      message: offlineId
        ? "Offline inventory adjustment synchronized."
        : "Inventory adjusted successfully.",
      id: movement.insertId,
      stock: newStock,
      status,
    });
  } catch (error) {
    if (connection && inTransaction) {
      await connection.rollback().catch(() => {});
    }
    if (
      error.code === "ER_DUP_ENTRY" &&
      req.body?.offline_id
    ) {
      try {
        const [duplicate] = await promiseDb.query(
          `
          SELECT movement_id
          FROM inventory_movements
          WHERE offline_id = ?
          LIMIT 1
          `,
          [String(req.body.offline_id)]
        );
        if (duplicate.length) {
          return res.json({
            message:
              "Offline inventory adjustment was already synchronized.",
            id: duplicate[0].movement_id,
            duplicate: true,
          });
        }
      } catch (lookupError) {
        console.error(
          "Offline adjustment lookup failed:",
          lookupError
        );
      }
    }
    return sendInventoryError(res, error);
  } finally {
    connection?.release();
  }
});
// ====================================
// DELETE INVENTORY PRODUCT
// ====================================
router.delete("/:id", async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    const [result] = await promiseDb.query(
      `
      DELETE FROM inventory
      WHERE id = ?
      `,
      [id]
    );
    if (!result.affectedRows) {
      throw problem(
        "Product not found.",
        404
      );
    }
    res.json({
      message: "Product deleted successfully.",
    });
  } catch (error) {
    if (
      error.code === "ER_ROW_IS_REFERENCED_2"
    ) {
      return res.status(409).json({
        error:
          "This product has transaction or movement history and cannot be deleted. Set its stock to zero instead.",
      });
    }
    return sendInventoryError(res, error);
  }
});
module.exports = router;

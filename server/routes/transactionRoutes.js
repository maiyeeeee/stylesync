const express = require("express")
const router = express.Router()
const db = require("../db")

const promiseDb = db.promise()

// Keep the existing session and CSRF middleware in server.js.
router.use((req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "Please sign in again." })
    }

    if (!["owner", "admin"].includes(req.user.role)) {
        return res.status(403).json({ error: "Administrator access is required." })
    }

    next()
})

function problem(message, status = 400) {
    const error = new Error(message)
    error.status = status
    return error
}

// Work in centavos to avoid floating-point subtraction errors.
function cents(value, label, allowZero = false) {
    const text = String(value ?? "").trim()

    if (!/^\d+(\.\d{1,2})?$/.test(text)) {
        throw problem(`${label} must be a valid amount with up to two decimals.`)
    }

    const [whole, fraction = ""] = text.split(".")
    const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))

    if (!Number.isSafeInteger(result) || result > 9999999999 || result < (allowZero ? 0 : 1)) {
        throw problem(`${label} is outside the allowed range.`)
    }

    return result
}

function decimal(value) {
    return (value / 100).toFixed(2)
}

function positiveId(value, label) {
    const result = Number(value)

    if (!Number.isSafeInteger(result) || result <= 0) {
        throw problem(`${label} is invalid.`)
    }

    return result
}

const transactionSelect = `
  SELECT t.*,
         COALESCE(da.amount_applied, 0) AS deposit_applied,
         t.amount - COALESCE(da.amount_applied, 0) AS balance_collected,
         CASE WHEN da.application_id IS NOT NULL
              THEN d.payment_method ELSE NULL END AS deposit_payment_method
  FROM transactions t
  LEFT JOIN booking_deposit_applications da
    ON da.transaction_id = t.transaction_id
  LEFT JOIN booking_deposits d
    ON d.deposit_id = da.deposit_id
`

router.get("/", async (req, res) => {
    try {
        const [rows] = await promiseDb.query(`
      ${transactionSelect}
      ORDER BY t.transaction_date DESC, t.transaction_id DESC
    `)

        res.json(rows)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// Only eligible, not-yet-checked-out appointments appear here.
// No booking access tokens or receiving-account details are exposed.
router.get("/checkout-appointments", async (req, res) => {
    try {
        const [rows] = await promiseDb.query(`
      SELECT
        a.id,
        a.customer_name,
        a.contact_number,
        a.service,
        a.service_id,
        DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
        TIME_FORMAT(a.appointment_time, '%H:%i') AS appointment_time,
        a.status,
        COALESCE(d.service_total, s.price) AS service_total,
        d.payment_status,
        CASE WHEN d.payment_status = 'Verified'
             THEN d.verified_amount ELSE 0 END AS verified_deposit
      FROM appointments a
      LEFT JOIN services s ON s.service_id = a.service_id
      LEFT JOIN booking_deposits d ON d.appointment_id = a.id
      WHERE a.status IN ('Approved', 'Completed')
        AND NOT EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.appointment_id = a.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM booking_deposit_applications da
          WHERE da.deposit_id = d.deposit_id
        )
      ORDER BY a.appointment_date DESC, a.appointment_time DESC
    `)

        res.json(rows)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

router.post("/", async (req, res) => {
    let connection
    let inTransaction = false

    try {
        const body = req.body || {}
        const appointmentId =
            body.appointment_id == null || body.appointment_id === ""
                ? null
                : positiveId(body.appointment_id, "Appointment")

        const saleType = body.sale_type || "Service"
        if (!["Service", "Product"].includes(saleType)) {
            throw problem("Select Service or Product.")
        }

        const payment = String(body.payment || "")
        if (!["Cash", "GCash"].includes(payment)) {
            throw problem("Select Cash or GCash.")
        }

        const status = body.status || "Paid"
        if (!["Paid", "Pending"].includes(status)) {
            throw problem("Invalid payment status.")
        }

        if (appointmentId && (saleType !== "Service" || status !== "Paid")) {
            throw problem("Appointment checkout must be a paid service transaction.")
        }

        const quantity = Number(body.quantity ?? 1)
        if (!Number.isSafeInteger(quantity) || quantity < 1) {
            throw problem("Quantity must be a positive whole number.")
        }

        if (appointmentId && quantity !== 1) {
            throw problem("Check out one appointment at a time.")
        }

        const total = cents(body.amount, "Final sale total")
        const offlineId = body.offline_id ? String(body.offline_id) : null

        if (offlineId && offlineId.length > 64) {
            throw problem("The transaction identifier is too long.")
        }

        let customer = String(body.customer || "").trim()
        let service = String(body.service || "").trim()
        let depositAmount = 0
        let depositId = null
        let itemId = null

        connection = await promiseDb.getConnection()
        await connection.beginTransaction()
        inTransaction = true

        // Also supports the existing Emergency Mode synchronization.
        if (offlineId) {
            const [duplicates] = await connection.query(
                "SELECT transaction_id FROM transactions WHERE offline_id = ?",
                [offlineId],
            )

            if (duplicates.length) {
                await connection.rollback()
                inTransaction = false
                return res.json({
                    message: "Transaction already saved.",
                    id: duplicates[0].transaction_id,
                    duplicate: true,
                })
            }
        }

        if (appointmentId) {
            // Serialize checkout attempts for the same appointment.
            const [appointments] = await connection.query(
                "SELECT * FROM appointments WHERE id = ? FOR UPDATE",
                [appointmentId],
            )

            if (!appointments.length) {
                throw problem("Appointment not found.", 404)
            }

            const appointment = appointments[0]

            if (!["Approved", "Completed"].includes(appointment.status)) {
                throw problem("Only approved or completed appointments can be checked out.", 409)
            }

            const [existing] = await connection.query(
                "SELECT transaction_id FROM transactions WHERE appointment_id = ? FOR UPDATE",
                [appointmentId],
            )

            if (existing.length) {
                throw problem(
                    "This appointment already has a transaction. Refresh the history.",
                    409,
                )
            }

            customer = appointment.customer_name
            service = appointment.service

            const [deposits] = await connection.query(
                "SELECT * FROM booking_deposits WHERE appointment_id = ? FOR UPDATE",
                [appointmentId],
            )

            if (deposits.length) {
                const deposit = deposits[0]

                if (
                    deposit.payment_status === "Awaiting Verification" ||
                    deposit.payment_status === "Awaiting Payment"
                ) {
                    throw problem("Resolve this booking's payment status before checkout.", 409)
                }

                const [applications] = await connection.query(
                    "SELECT application_id FROM booking_deposit_applications WHERE deposit_id = ? FOR UPDATE",
                    [deposit.deposit_id],
                )

                if (applications.length) {
                    throw problem("This deposit has already been applied.", 409)
                }

                if (deposit.payment_status === "Verified") {
                    depositAmount = cents(deposit.verified_amount, "Verified deposit")
                    depositId = deposit.deposit_id
                }
            }

            // Reject a stale preview instead of silently changing the amount due.
            const expectedDeposit = cents(body.expected_deposit_amount, "Displayed deposit", true)

            if (expectedDeposit !== depositAmount) {
                throw problem("The deposit changed. Refresh and select the appointment again.", 409)
            }

            if (depositAmount > total) {
                throw problem(
                    "The verified deposit exceeds the final total. Resolve the excess payment before checkout.",
                    409,
                )
            }
        } else if (saleType === "Product") {
            itemId = positiveId(body.item_id, "Product")

            const [products] = await connection.query(
                "SELECT name, stock, alertLevel FROM inventory WHERE id = ? ? FOR UPDATE",
                [itemId],
            )

            if (!products.length) throw problem("Product not found.", 404)

            const product = products[0]
            if (Number(product.stock) < quantity) {
                throw problem("Not enough stock available.", 409)
            }

            service = product.name
            const newStock = Number(product.stock) - quantity
            const stockStatus = newStock <= Number(product.alertLevel) ? "Low Stock" : "In Stock"

            await connection.query("UPDATE inventory SET stock = ?, status = ? WHERE id = ?", [
                newStock,
                stockStatus,
                itemId,
            ])
        }

        if (!customer || customer.length > 100 || !service || service.length > 150) {
            throw problem("Enter a valid customer and item/service name.")
        }

        const [result] = await connection.query(
            `INSERT INTO transactions
       (appointment_id, customer, service, amount, payment, status,
        sale_type, item_id, quantity, offline_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                appointmentId,
                customer,
                service,
                decimal(total),
                payment,
                status,
                saleType,
                itemId,
                quantity,
                offlineId,
            ],
        )

        if (depositId) {
            const userId = positiveId(req.user.user_id, "Signed-in user")

            await connection.query(
                `INSERT INTO booking_deposit_applications
         (deposit_id, transaction_id, amount_applied, applied_by)
         VALUES (?, ?, ?, ?)`,
                [depositId, result.insertId, decimal(depositAmount), userId],
            )
        }

        await connection.commit()
        inTransaction = false

        res.status(201).json({
            message: "Transaction saved successfully.",
            id: result.insertId,
            deposit_applied: decimal(depositAmount),
            balance_collected: decimal(total - depositAmount),
        })
    } catch (error) {
        if (connection && inTransaction) {
            await connection.rollback().catch(() => {})
            inTransaction = false
        }

        if (error.code === "ER_DUP_ENTRY" && req.body?.offline_id && connection) {
            try {
                const [duplicates] = await connection.query(
                    "SELECT transaction_id FROM transactions WHERE offline_id = ?",
                    [String(req.body.offline_id)],
                )

                if (duplicates.length) {
                    return res.json({
                        message: "Transaction already saved.",
                        id: duplicates[0].transaction_id,
                        duplicate: true,
                    })
                }
            } catch {
                // Fall through to the error response.
            }
        }

        res.status(error.status || (error.code === "ER_DUP_ENTRY" ? 409 : 500)).json({
            error:
                error.code === "ER_DUP_ENTRY"
                    ? "This payment or transaction has already been recorded. Refresh the history."
                    : error.message,
        })
    } finally {
        connection?.release()
    }
})

module.exports = router

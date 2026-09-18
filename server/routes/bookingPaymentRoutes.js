const crypto = require("crypto")
const db = require("../db")
const { resolveService, reserveAvailableStaff } = require("../lib/availability")
const pool = db.promise()
const MINUTES = 15
function fail(message, status = 400) {
    return Object.assign(new Error(message), { status })
}
function amount(value) {
    const text = String(value ?? "").trim()
    if (!/^\d+(\.\d{1,2})?$/.test(text))
        throw fail("Enter an amount with at most two decimal places.")
    const [whole, fraction = ""] = text.split(".")
    const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
    if (!Number.isSafeInteger(n) || n < 1 || n > 9999999999) throw fail("Invalid payment amount.")
    return n
}
function tokenHash(req) {
    const token = req.get("X-Booking-Token") || ""
    if (!/^[a-f0-9]{64}$/.test(token))
        throw fail(
            "The private booking key is missing. Reopen this booking in its original browser tab.",
            401,
        )
    return crypto.createHash("sha256").update(token).digest("hex")
}
async function tx(fn) {
    const conn = await pool.getConnection()
    try {
        await conn.beginTransaction()
        const result = await fn(conn)
        await conn.commit()
        return result
    } catch (err) {
        await conn.rollback().catch(() => {})
        throw err
    } finally {
        conn.release()
    }
}
const wrap = (fn) => async (req, res) => {
    try {
        await fn(req, res)
    } catch (err) {
        if (!err.status) console.error("Booking payment:", err)
        res.status(err.status || 500).json({
            error: err.status ? err.message : "Unable to complete this request. Please try again.",
        })
    }
}
async function lockDeposit(conn, id) {
    const [links] = await conn.query(
        "SELECT appointment_id FROM booking_deposits WHERE deposit_id = ?",
        [id],
    )
    if (!links.length) throw fail("Reservation not found.", 404)
    // Checkout locks appointment first too: use the same order.
    const [appointments] = await conn.query("SELECT * FROM appointments WHERE id = ? FOR UPDATE", [
        links[0].appointment_id,
    ])
    const [deposits] = await conn.query(
        "SELECT *, expires_at <= UTC_TIMESTAMP() AS expired FROM booking_deposits WHERE deposit_id = ? FOR UPDATE",
        [id],
    )
    if (!appointments.length || !deposits.length) throw fail("Reservation not found.", 404)
    return { appointment: appointments[0], deposit: deposits[0] }
}
async function expireLocked(conn, deposit) {
    if (deposit.payment_status !== "Awaiting Payment" || !Number(deposit.expired)) return false
    await conn.query(
        "UPDATE booking_deposits SET payment_status = 'Expired' WHERE deposit_id = ?",
        [deposit.deposit_id],
    )
    await conn.query(
        "UPDATE appointments SET status = 'Cancelled' WHERE id = ? AND status = 'Awaiting Payment'",
        [deposit.appointment_id],
    )
    deposit.payment_status = "Expired"
    return true
}
async function expireReservations() {
    const [rows] = await pool.query(
        "SELECT deposit_id FROM booking_deposits WHERE payment_status = 'Awaiting Payment' AND expires_at <= UTC_TIMESTAMP()",
    )
    for (const row of rows)
        await tx(async (conn) => {
            const { deposit } = await lockDeposit(conn, row.deposit_id)
            await expireLocked(conn, deposit)
        })
}
async function publicReservation(hash) {
    const [rows] = await pool.query(
        `SELECT d.deposit_id, d.appointment_id,
    d.service_total, d.required_amount, d.payment_status, d.receiving_name,
    d.receiving_number, d.qr_snapshot, d.submitted_reference,
    DATE_FORMAT(d.expires_at, '%Y-%m-%dT%H:%i:%sZ') AS expires_at,
    a.service, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
    TIME_FORMAT(a.appointment_time, '%H:%i') AS start_time,
    TIME_FORMAT(a.appointment_end_time, '%H:%i') AS end_time, a.status AS appointment_status
    FROM booking_deposits d JOIN appointments a ON a.id = d.appointment_id
    WHERE d.access_token_hash = ?`,
        [hash],
    )
    if (!rows.length) throw fail("Reservation not found.", 404)
    return { ...rows[0], server_now: new Date().toISOString() }
}
function validateQR(data) {
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(data || ""))
    if (!match) throw fail("Upload a PNG or JPG QR image.")
    const buffer = Buffer.from(match[2], "base64")
    if (buffer.length > 1024 * 1024 || buffer.length < 8)
        throw fail("QR image must be no larger than 1 MB.")
    const valid =
        match[1] === "png"
            ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
    if (!valid) throw fail("Invalid image file.")
    return data
}
module.exports = function installBookingPayments(api, { requireAdmin, requireOwner }) {
    // This module is installed AFTER the existing session, authentication and CSRF checks.
    let sweeping = false
    const sweep = async () => {
        if (sweeping) return
        sweeping = true
        try {
            await expireReservations()
        } catch (err) {
            console.error("Reservation expiry:", err.message)
        } finally {
            sweeping = false
        }
    }
    const timer = setInterval(sweep, 30000)
    timer.unref()
    sweep()

    api.get(
        "/booking-payments/reservation",
        wrap(async (req, res) => {
            const hash = tokenHash(req)
            const [rows] = await pool.query(
                "SELECT deposit_id FROM booking_deposits WHERE access_token_hash = ?",
                [hash],
            )
            if (!rows.length) throw fail("Reservation not found.", 404)
            await tx(async (conn) => {
                const { deposit } = await lockDeposit(conn, rows[0].deposit_id)
                await expireLocked(conn, deposit)
            })
            res.json(await publicReservation(hash))
        }),
    )

    api.post(
        "/booking-payments/reserve",
        wrap(async (req, res) => {
            const hash = tokenHash(req)
            const [existing] = await pool.query(
                "SELECT deposit_id FROM booking_deposits WHERE access_token_hash = ?",
                [hash],
            )
            if (existing.length) {
                await expireReservations()
                return res.json(await publicReservation(hash))
            }
            const b = req.body || {}
            const name = String(b.customer_name || "").trim()
            const phone = String(b.contact_number || "").trim()
            const email = String(b.email || "").trim()
            if (!name || name.length > 100 || !/^09\d{9}$/.test(phone) || email.length > 100)
                throw fail("Enter a valid name and 11-digit mobile number.")
            if (
                !/^\d{4}-\d{2}-\d{2}$/.test(b.appointment_date || "") ||
                !/^\d{2}:\d{2}$/.test(b.appointment_time || "")
            )
                throw fail("Choose a valid date and time.")
            const start = new Date(`${b.appointment_date}T${b.appointment_time}:00+08:00`).getTime()
            if (!Number.isFinite(start) || start <= Date.now() + MINUTES * 60000)
                throw fail("Choose a slot more than 15 minutes from now.")
            await expireReservations()
            try {
                await tx(async (conn) => {
                    const [settings] = await conn.query(
                        "SELECT * FROM booking_payment_settings WHERE id = 1 FOR SHARE",
                    )
                    const setting = settings[0]
                    if (!setting || !setting.enabled || !setting.qr_data)
                        throw fail(
                            "Online payment reservations are currently unavailable. Please contact the salon.",
                            409,
                        )
                    const selected = await resolveService(conn, { service_id: b.service_id })
                    const [prices] = await conn.query(
                        "SELECT price FROM services WHERE service_id = ?",
                        [selected.service_id],
                    )
                    const total = amount(prices[0]?.price)
                    const down = Math.round(total / 5)
                    if (down < 1)
                        throw fail("This service price cannot be used for online deposits.")
                    const reservation = await reserveAvailableStaff(conn, {
                        serviceId: selected.service_id,
                        appointmentDate: b.appointment_date,
                        startTime: b.appointment_time,
                        durationMinutes: Number(selected.duration_minutes),
                    })
                    if (!reservation.staff) {
                        const [retried] = await conn.query(
                            "SELECT deposit_id FROM booking_deposits WHERE access_token_hash = ? FOR UPDATE",
                            [hash],
                        )
                        if (retried.length) return
                        throw fail("That slot is no longer available. Choose another time.", 409)
                    }
                    const [result] = await conn.query(
                        `INSERT INTO appointments
          (customer_name, contact_number, email, service_id, service, appointment_date,
           appointment_time, appointment_end_time, staff_id, notes, status, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Awaiting Payment', 'Online')`,
                        [
                            name,
                            phone,
                            email,
                            selected.service_id,
                            selected.service,
                            b.appointment_date,
                            reservation.startTime,
                            reservation.endTime,
                            reservation.staff.staff_id,
                            String(b.notes || "").slice(0, 4000),
                        ],
                    )
                    await conn.query(
                        `INSERT INTO booking_deposits
          (appointment_id, access_token_hash, service_total, required_amount, receiving_name,
           receiving_number, qr_snapshot, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))`,
                        [
                            result.insertId,
                            hash,
                            (total / 100).toFixed(2),
                            (down / 100).toFixed(2),
                            setting.receiving_name,
                            setting.receiving_number,
                            setting.qr_data,
                        ],
                    )
                    const [customers] = await conn.query(
                        "SELECT customer_id FROM customers WHERE contact_number = ? LIMIT 1",
                        [phone],
                    )
                    if (!customers.length)
                        await conn.query(
                            `INSERT INTO customers
          (customer_name, contact_number, email, gender, customer_type) VALUES (?, ?, ?, ?, ?)`,
                            [
                                name,
                                phone,
                                email,
                                ["Female", "Male", "Prefer not to say"].includes(b.gender)
                                    ? b.gender
                                    : "Prefer not to say",
                                ["Regular", "Student", "Senior Citizen", "PWD"].includes(
                                    b.customer_type,
                                )
                                    ? b.customer_type
                                    : "Regular",
                            ],
                        )
                })
            } catch (err) {
                if (err.code !== "ER_DUP_ENTRY") throw err
                const [duplicate] = await pool.query(
                    "SELECT deposit_id FROM booking_deposits WHERE access_token_hash = ?",
                    [hash],
                )
                if (!duplicate.length) throw err
            }
            res.status(201).json(await publicReservation(hash))
        }),
    )

    api.post(
        "/booking-payments/submit",
        wrap(async (req, res) => {
            const hash = tokenHash(req)
            const reference = String(req.body?.reference || "").trim()
            if (!/^[A-Za-z0-9-]{6,100}$/.test(reference))
                throw fail("Enter the reference number from your completed payment.")
            const paid = amount(req.body?.amount)
            const [rows] = await pool.query(
                "SELECT deposit_id FROM booking_deposits WHERE access_token_hash = ?",
                [hash],
            )
            if (!rows.length) throw fail("Reservation not found.", 404)
            const expired = await tx(async (conn) => {
                const { deposit } = await lockDeposit(conn, rows[0].deposit_id)
                if (await expireLocked(conn, deposit)) return true
                if (
                    deposit.payment_status === "Awaiting Verification" &&
                    deposit.submitted_reference === reference
                )
                    return false
                if (deposit.payment_status !== "Awaiting Payment")
                    throw fail("This reservation no longer accepts payment submissions.", 409)
                if (paid !== amount(deposit.required_amount))
                    throw fail(
                        "Submit the exact requested deposit amount. Contact the salon if you paid a different amount.",
                    )
                await conn.query(
                    `UPDATE booking_deposits SET submitted_reference = ?, submitted_amount = ?,
        submitted_at = UTC_TIMESTAMP(), payment_status = 'Awaiting Verification' WHERE deposit_id = ?`,
                    [reference, (paid / 100).toFixed(2), deposit.deposit_id],
                )
                await conn.query(
                    "UPDATE appointments SET status = 'Pending Validation' WHERE id = ?",
                    [deposit.appointment_id],
                )
                return false
            })
            if (expired)
                throw fail(
                    "The 15-minute window expired. If you already transferred money, contact the salon; do not pay again.",
                    409,
                )
            res.json(await publicReservation(hash))
        }),
    )

    api.get(
        "/booking-payments/settings",
        requireOwner,
        wrap(async (req, res) => {
            const [rows] = await pool.query("SELECT * FROM booking_payment_settings WHERE id = 1")
            if (!rows.length) throw fail("Run payment-setup.js first.", 409)
            res.json(rows[0])
        }),
    )
    api.put(
        "/booking-payments/settings",
        requireOwner,
        wrap(async (req, res) => {
            const b = req.body || {}
            const name = String(b.receiving_name || "").trim()
            const phone = String(b.receiving_number || "").trim()
            if (!name || name.length > 150 || !/^09\d{9}$/.test(phone))
                throw fail("Enter a name and valid GCash number.")
            const qr = validateQR(b.qr_data)
            const [result] = await pool.query(
                `UPDATE booking_payment_settings SET receiving_name = ?,
      receiving_number = ?, qr_data = ?, enabled = ?, version = version + 1, updated_by = ?
      WHERE id = 1 AND version = ?`,
                [name, phone, qr, b.enabled ? 1 : 0, req.user.user_id, Number(b.version)],
            )
            if (!result.affectedRows)
                throw fail("Settings changed in another tab. Reload before editing.", 409)
            res.json({ message: "Saved. New reservations will use these details." })
        }),
    )

    api.get(
        "/booking-payments/review",
        requireAdmin,
        wrap(async (req, res) => {
            await expireReservations()
            const [rows] =
                await pool.query(`SELECT d.deposit_id, d.appointment_id, d.required_amount,
      d.submitted_amount, d.submitted_reference, d.payment_status, d.receiving_name,
      d.receiving_number, d.review_note, a.customer_name, a.contact_number, a.service,
      DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date
      FROM booking_deposits d JOIN appointments a ON a.id = d.appointment_id
      WHERE d.payment_status IN ('Awaiting Verification', 'Verified', 'Rejected')
      ORDER BY d.submitted_at DESC, d.deposit_id DESC`)
            res.json(rows)
        }),
    )
    api.post(
        "/booking-payments/review/:id",
        requireAdmin,
        wrap(async (req, res) => {
            const action = req.body?.action
            if (!["verify", "reject"].includes(action)) throw fail("Invalid review action.")
            const note = String(req.body?.note || "")
                .trim()
                .slice(0, 500)
            if (action === "reject" && !note)
                throw fail("Enter a reason for rejecting the payment.")
            try {
                await tx(async (conn) => {
                    const { appointment, deposit } = await lockDeposit(conn, Number(req.params.id))
                    if (deposit.payment_status !== "Awaiting Verification")
                        throw fail("This payment has already been reviewed.", 409)
                    if (appointment.status !== "Pending Validation")
                        throw fail(
                            "Appointment status changed. Review the appointment before processing payment.",
                            409,
                        )
                    if (action === "verify") {
                        if (req.body.confirm_received !== true)
                            throw fail("Confirm receipt in the receiving GCash account first.")
                        const verified = amount(req.body.amount)
                        if (verified !== amount(deposit.required_amount))
                            throw fail(
                                "The received amount must match the requested deposit. Resolve discrepancies before verification.",
                            )
                        const reference = String(req.body.reference || "").trim()
                        if (!/^[A-Za-z0-9-]{6,100}$/.test(reference))
                            throw fail("Enter the actual received payment reference.")
                        await conn.query(
                            `UPDATE booking_deposits SET payment_status = 'Verified', verified_amount = ?,
            verified_reference = ?, verified_by = ?, verified_at = UTC_TIMESTAMP(), review_note = ? WHERE deposit_id = ?`,
                            [
                                (verified / 100).toFixed(2),
                                reference,
                                req.user.user_id,
                                note,
                                deposit.deposit_id,
                            ],
                        )
                        await conn.query(
                            "UPDATE appointments SET status = 'Pending' WHERE id = ?",
                            [deposit.appointment_id],
                        )
                    } else {
                        await conn.query(
                            "UPDATE booking_deposits SET payment_status = 'Rejected', verified_by = ?, verified_at = UTC_TIMESTAMP(), review_note = ? WHERE deposit_id = ?",
                            [req.user.user_id, note, deposit.deposit_id],
                        )
                        await conn.query(
                            "UPDATE appointments SET status = 'Cancelled' WHERE id = ?",
                            [deposit.appointment_id],
                        )
                    }
                })
            } catch (err) {
                if (err.code === "ER_DUP_ENTRY")
                    throw fail(
                        "This received payment reference has already been verified for another booking.",
                        409,
                    )
                throw err
            }
            res.json({
                message:
                    action === "verify"
                        ? "Payment verified. Booking is now pending appointment approval."
                        : "Payment rejected and slot released.",
            })
        }),
    )

    // Old anonymous form submissions must not bypass the new payment flow.
    api.post("/appointments", (req, res, next) => {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "offline_id")) return next()
        res.status(409).json({ error: "Please refresh the booking page and use Reserve and pay." })
    })
    api.get("/appointments/availability", async (req, res, next) => {
        try {
            await expireReservations()
            next()
        } catch (err) {
            next(err)
        }
    })
    // Keep unpaid holds out of the ordinary owner/staff appointment list.
    api.get(
        "/appointments",
        requireAdmin,
        wrap(async (req, res) => {
            await expireReservations()
            const [rows] =
                await pool.query(`SELECT a.*, s.name AS staff_name, s.role AS staff_role, sv.duration_minutes
      FROM appointments a LEFT JOIN staff s ON s.staff_id = a.staff_id
      LEFT JOIN services sv ON sv.service_id = a.service_id
      LEFT JOIN booking_deposits d ON d.appointment_id = a.id
      WHERE d.deposit_id IS NULL OR d.payment_status IN ('Awaiting Verification', 'Verified')
      ORDER BY a.appointment_date DESC, a.appointment_time DESC`)
            res.json(rows)
        }),
    )
    api.put("/appointments/:id/status", requireAdmin, async (req, res, next) => {
        try {
            const [rows] = await pool.query(
                "SELECT payment_status FROM booking_deposits WHERE appointment_id = ?",
                [req.params.id],
            )
            if (rows.length && rows[0].payment_status !== "Verified") {
                return res
                    .status(409)
                    .json({
                        error: "Review this deposit on Payment review first. Unverified bookings cannot be approved.",
                    })
            }
            next()
        } catch (err) {
            next(err)
        }
    })
}
// Pure validation helpers exposed only for local tests.
module.exports._test = { amount, validateQR, expireLocked }

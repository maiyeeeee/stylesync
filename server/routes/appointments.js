const express = require("express")
const router = express.Router()
const db = require("../db")
const { getAvailableStaff, reserveAvailableStaff, resolveService } = require("../lib/availability")

const promiseDb = db.promise()

router.get("/", async (req, res) => {
    try {
        const [rows] = await promiseDb.query(
            `SELECT a.*, s.name AS staff_name, s.role AS staff_role,
              sv.duration_minutes
       FROM appointments a
       LEFT JOIN staff s ON s.staff_id = a.staff_id
       LEFT JOIN services sv ON sv.service_id = a.service_id
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
        )
        res.json(rows)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

router.get("/availability", async (req, res) => {
    try {
        const service = await resolveService(promiseDb, req.query)
        const result = await getAvailableStaff(promiseDb, {
            serviceId: service.service_id,
            appointmentDate: req.query.appointment_date,
            startTime: req.query.appointment_time,
            durationMinutes: Number(service.duration_minutes),
            preferredStaffId: req.query.staff_id,
        })

        res.json({
            service_id: service.service_id,
            service: service.service,
            duration_minutes: Number(service.duration_minutes),
            start_time: result.startTime,
            end_time: result.endTime,
            available_count: result.available.length,
            available_staff: result.available,
        })
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message })
    }
})

router.post("/", async (req, res) => {
    const connection = await promiseDb.getConnection()
    try {
        const {
            customer_name,
            contact_number,
            email,
            gender,
            customer_type,
            service_id,
            service,
            appointment_date,
            appointment_time,
            notes,
            staff_id,
            offline_id,
        } = req.body || {}

        if (!customer_name || !contact_number || !appointment_date || !appointment_time) {
            return res.status(400).json({
                error: "Customer, contact number, appointment date, and time are required",
            })
        }

        if (offline_id) {
            const [duplicate] = await connection.query(
                "SELECT id, status, staff_id FROM appointments WHERE offline_id = ? LIMIT 1",
                [String(offline_id)],
            )
            if (duplicate.length) {
                return res.json({
                    message: "Offline appointment was already synchronized",
                    id: duplicate[0].id,
                    status: duplicate[0].status,
                    duplicate: true,
                })
            }
        }

        await connection.beginTransaction()
        const selectedService = await resolveService(connection, { service_id, service })
        const reservation = await reserveAvailableStaff(connection, {
            serviceId: selectedService.service_id,
            appointmentDate: appointment_date,
            startTime: appointment_time,
            durationMinutes: Number(selectedService.duration_minutes),
            preferredStaffId: staff_id,
        })

        if (!reservation.staff) {
            const error = new Error(
                offline_id
                    ? "No qualified staff is available for this offline appointment. It needs manual review."
                    : "No qualified staff is available for the complete service duration. Choose another schedule.",
            )
            error.status = 409
            throw error
        }

        const [appointmentResult] = await connection.query(
            `INSERT INTO appointments
       (customer_name, contact_number, email, service_id, service,
        appointment_date, appointment_time, appointment_end_time,
        staff_id, notes, status, offline_id, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`,
            [
                String(customer_name).trim(),
                String(contact_number).trim(),
                String(email || "").trim(),
                selectedService.service_id,
                selectedService.service,
                appointment_date,
                reservation.startTime,
                reservation.endTime,
                reservation.staff.staff_id,
                String(notes || "").trim(),
                offline_id ? String(offline_id) : null,
                offline_id ? "Synced" : "Online",
            ],
        )

        const [customers] = await connection.query(
            "SELECT customer_id FROM customers WHERE contact_number = ? LIMIT 1",
            [String(contact_number).trim()],
        )

        if (!customers.length) {
            await connection.query(
                `INSERT INTO customers
         (customer_name, contact_number, email, gender, customer_type)
         VALUES (?, ?, ?, ?, ?)`,
                [
                    String(customer_name).trim(),
                    String(contact_number).trim(),
                    String(email || "").trim(),
                    String(gender || "Prefer not to say"),
                    String(customer_type || "Regular"),
                ],
            )
        }

        await connection.commit()
        res.status(201).json({
            message: offline_id
                ? "Offline appointment synchronized and validated"
                : "Appointment saved and staff time reserved",
            id: appointmentResult.insertId,
            status: "Pending",
            staff: reservation.staff,
            start_time: reservation.startTime,
            end_time: reservation.endTime,
        })
    } catch (error) {
        await connection.rollback()
        if (error.code === "ER_DUP_ENTRY" && req.body?.offline_id) {
            const [duplicate] = await promiseDb.query(
                "SELECT id, status FROM appointments WHERE offline_id = ? LIMIT 1",
                [String(req.body.offline_id)],
            )
            if (duplicate.length) {
                return res.json({
                    message: "Offline appointment was already synchronized",
                    id: duplicate[0].id,
                    status: duplicate[0].status,
                    duplicate: true,
                })
            }
        }
        res.status(error.status || 500).json({ error: error.message })
    } finally {
        connection.release()
    }
})

router.put("/:id/status", async (req, res) => {
    const connection = await promiseDb.getConnection()
    try {
        const appointmentId = Number(req.params.id)
        const status = String(req.body.status || "")
        const allowedStatuses = ["Pending", "Approved", "Declined", "Cancelled", "Completed"]

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ error: "Invalid appointment status" })
        }

        await connection.beginTransaction()
        const [rows] = await connection.query(
            `SELECT a.*, COALESCE(s.duration_minutes, 60) AS duration_minutes
       FROM appointments a
       LEFT JOIN services s ON s.service_id = a.service_id
       WHERE a.id = ? FOR UPDATE`,
            [appointmentId],
        )

        if (!rows.length) {
            const error = new Error("Appointment not found")
            error.status = 404
            throw error
        }

        const appointment = rows[0]
        let assignedStaffId = appointment.staff_id
        let endTime = appointment.appointment_end_time

        if (status === "Approved") {
            const reservation = await reserveAvailableStaff(connection, {
                serviceId: appointment.service_id,
                appointmentDate: appointment.appointment_date,
                startTime: appointment.appointment_time,
                durationMinutes: Number(appointment.duration_minutes),
                preferredStaffId: appointment.staff_id,
                excludeAppointmentId: appointmentId,
            })

            if (!reservation.staff) {
                const error = new Error(
                    "Approval blocked: assigned staff is no longer available for the full interval",
                )
                error.status = 409
                throw error
            }
            assignedStaffId = reservation.staff.staff_id
            endTime = reservation.endTime
        }

        await connection.query(
            `UPDATE appointments
       SET status = ?, staff_id = ?, appointment_end_time = ?
       WHERE id = ?`,
            [status, assignedStaffId, endTime, appointmentId],
        )
        await connection.commit()
        res.json({
            message: "Appointment status updated successfully",
            id: appointmentId,
            status,
            staff_id: assignedStaffId,
        })
    } catch (error) {
        await connection.rollback()
        res.status(error.status || 500).json({ error: error.message })
    } finally {
        connection.release()
    }
})

router.put("/:id/assign", async (req, res) => {
    const connection = await promiseDb.getConnection()
    try {
        const appointmentId = Number(req.params.id)
        const staffId = Number(req.body.staff_id)
        await connection.beginTransaction()
        const [rows] = await connection.query(
            `SELECT a.*, COALESCE(s.duration_minutes, 60) AS duration_minutes
       FROM appointments a
       LEFT JOIN services s ON s.service_id = a.service_id
       WHERE a.id = ? FOR UPDATE`,
            [appointmentId],
        )
        if (!rows.length) {
            const error = new Error("Appointment not found")
            error.status = 404
            throw error
        }

        const appointment = rows[0]
        const reservation = await reserveAvailableStaff(connection, {
            serviceId: appointment.service_id,
            appointmentDate: appointment.appointment_date,
            startTime: appointment.appointment_time,
            durationMinutes: Number(appointment.duration_minutes),
            preferredStaffId: staffId,
            excludeAppointmentId: appointmentId,
        })

        if (!reservation.staff) {
            const error = new Error("Selected staff member is unavailable or unqualified")
            error.status = 409
            throw error
        }

        await connection.query(
            "UPDATE appointments SET staff_id = ?, appointment_end_time = ? WHERE id = ?",
            [reservation.staff.staff_id, reservation.endTime, appointmentId],
        )
        await connection.commit()
        res.json({ message: "Staff assignment updated", staff: reservation.staff })
    } catch (error) {
        await connection.rollback()
        res.status(error.status || 500).json({ error: error.message })
    } finally {
        connection.release()
    }
})

router.delete("/:id", async (req, res) => {
    try {
        const [result] = await promiseDb.query("DELETE FROM appointments WHERE id = ?", [
            Number(req.params.id),
        ])
        res.json({
            message: "Appointment deleted successfully",
            affectedRows: result.affectedRows,
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

module.exports = router

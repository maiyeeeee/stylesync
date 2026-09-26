const express = require("express")
const router = express.Router()
const db = require("../db")

const promiseDb = db.promise()

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

async function hydrateStaff() {
    const [staffRows] = await promiseDb.query(
        "SELECT * FROM staff ORDER BY active_status DESC, name",
    )

    const [serviceRows] = await promiseDb.query(
        `SELECT
            ss.staff_id,
            s.service_id,
            s.service
         FROM staff_services ss
         INNER JOIN services s
            ON s.service_id = ss.service_id
         ORDER BY s.service`,
    )

    const [scheduleRows] = await promiseDb.query(
        `SELECT *
         FROM staff_schedule
         ORDER BY day_of_week, shift_start`,
    )

    const [unavailabilityRows] = await promiseDb.query(
        `SELECT *
         FROM staff_unavailability
         WHERE end_at >= NOW()
         ORDER BY start_at`,
    )

    return staffRows.map((staff) => ({
        ...staff,

        services: serviceRows.filter(
            (row) => row.staff_id === staff.staff_id,
        ),

        service_ids: serviceRows
            .filter((row) => row.staff_id === staff.staff_id)
            .map((row) => row.service_id),

        schedules: scheduleRows.filter(
            (row) => row.staff_id === staff.staff_id,
        ),

        unavailability: unavailabilityRows.filter(
            (row) => row.staff_id === staff.staff_id,
        ),
    }))
}

function validateStaffBody(body) {
    const name = String(body.name || "").trim()
    const role = String(body.role || "").trim()

    const serviceIds = Array.isArray(body.service_ids)
        ? [
              ...new Set(
                  body.service_ids
                      .map(Number)
                      .filter(
                          (id) =>
                              Number.isSafeInteger(id) &&
                              id > 0,
                      ),
              ),
          ]
        : []

    const schedules = Array.isArray(body.schedules)
        ? body.schedules
        : []

    if (!name || !role) {
        const error = new Error(
            "Staff name and role are required",
        )
        error.status = 400
        throw error
    }

    if (!serviceIds.length) {
        const error = new Error(
            "Select at least one qualified service",
        )
        error.status = 400
        throw error
    }

    const cleanSchedules = schedules.map((schedule) => {
        const day = Number(schedule.day_of_week)

        const shiftStart = String(
            schedule.shift_start || "",
        ).slice(0, 5)

        const shiftEnd = String(
            schedule.shift_end || "",
        ).slice(0, 5)

        const breakStart = String(
            schedule.break_start || "",
        ).slice(0, 5)

        const breakEnd = String(
            schedule.break_end || "",
        ).slice(0, 5)

        if (
            !Number.isInteger(day) ||
            day < 0 ||
            day > 6 ||
            !timePattern.test(shiftStart) ||
            !timePattern.test(shiftEnd) ||
            shiftEnd <= shiftStart
        ) {
            const error = new Error(
                "Each selected working day needs a valid shift",
            )
            error.status = 400
            throw error
        }

        const hasBreakStart = Boolean(breakStart)
        const hasBreakEnd = Boolean(breakEnd)

        if (hasBreakStart !== hasBreakEnd) {
            const error = new Error(
                "Enter both the break start and break end, or leave both blank",
            )
            error.status = 400
            throw error
        }

        if (
            hasBreakStart &&
            (
                !timePattern.test(breakStart) ||
                !timePattern.test(breakEnd) ||
                breakEnd <= breakStart ||
                breakStart <= shiftStart ||
                breakEnd >= shiftEnd
            )
        ) {
            const error = new Error(
                "The regular break must be completely inside the staff shift",
            )
            error.status = 400
            throw error
        }

        return {
            day_of_week: day,
            shift_start: shiftStart,
            shift_end: shiftEnd,
            break_start: hasBreakStart
                ? breakStart
                : null,
            break_end: hasBreakEnd
                ? breakEnd
                : null,
        }
    })

    if (!cleanSchedules.length) {
        const error = new Error(
            "Select at least one working day",
        )
        error.status = 400
        throw error
    }

    const overlappingShifts = cleanSchedules.some(
        (first, index) =>
            cleanSchedules.some(
                (second, otherIndex) =>
                    otherIndex > index &&
                    first.day_of_week ===
                        second.day_of_week &&
                    first.shift_start <
                        second.shift_end &&
                    second.shift_start <
                        first.shift_end,
            ),
    )

    if (overlappingShifts) {
        const error = new Error(
            "Staff shifts on the same day must not overlap",
        )
        error.status = 400
        throw error
    }

    return {
        name,
        role,

        active_status:
            body.active_status === "Inactive"
                ? "Inactive"
                : "Active",

        daily_status:
            body.daily_status === "Unavailable"
                ? "Unavailable"
                : "Available",

        serviceIds,
        schedules: cleanSchedules,
    }
}

async function replaceQualificationsAndSchedule(
    connection,
    staffId,
    serviceIds,
    schedules,
) {
    await connection.query(
        "DELETE FROM staff_services WHERE staff_id = ?",
        [staffId],
    )

    await connection.query(
        "DELETE FROM staff_schedule WHERE staff_id = ?",
        [staffId],
    )

    for (const serviceId of serviceIds) {
        await connection.query(
            `INSERT INTO staff_services
                (staff_id, service_id)
             VALUES (?, ?)`,
            [staffId, serviceId],
        )
    }

    for (const schedule of schedules) {
        await connection.query(
            `INSERT INTO staff_schedule
                (
                    staff_id,
                    day_of_week,
                    shift_start,
                    shift_end,
                    break_start,
                    break_end,
                    active
                )
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [
                staffId,
                schedule.day_of_week,
                schedule.shift_start,
                schedule.shift_end,
                schedule.break_start,
                schedule.break_end,
            ],
        )
    }
}

router.get("/", async (req, res) => {
    try {
        res.json(await hydrateStaff())
    } catch (error) {
        res.status(500).json({
            error: error.message,
        })
    }
})

router.post("/", async (req, res) => {
    const connection = await promiseDb.getConnection()

    try {
        const values = validateStaffBody(
            req.body || {},
        )

        await connection.beginTransaction()

        const [result] = await connection.query(
            `INSERT INTO staff
                (
                    name,
                    role,
                    active_status,
                    daily_status
                )
             VALUES (?, ?, ?, ?)`,
            [
                values.name,
                values.role,
                values.active_status,
                values.daily_status,
            ],
        )

        await replaceQualificationsAndSchedule(
            connection,
            result.insertId,
            values.serviceIds,
            values.schedules,
        )

        await connection.commit()

        res.status(201).json({
            message: "Staff member created successfully",
            staff_id: result.insertId,
        })
    } catch (error) {
        await connection.rollback()

        res.status(error.status || 500).json({
            error: error.message,
        })
    } finally {
        connection.release()
    }
})

router.put("/:id", async (req, res) => {
    const connection = await promiseDb.getConnection()

    try {
        const staffId = Number(req.params.id)

        if (
            !Number.isSafeInteger(staffId) ||
            staffId <= 0
        ) {
            return res.status(400).json({
                error: "Staff member is invalid",
            })
        }

        const values = validateStaffBody(
            req.body || {},
        )

        await connection.beginTransaction()

        const [result] = await connection.query(
            `UPDATE staff
             SET
                name = ?,
                role = ?,
                active_status = ?,
                daily_status = ?
             WHERE staff_id = ?`,
            [
                values.name,
                values.role,
                values.active_status,
                values.daily_status,
                staffId,
            ],
        )

        if (!result.affectedRows) {
            const error = new Error(
                "Staff member not found",
            )
            error.status = 404
            throw error
        }

        await replaceQualificationsAndSchedule(
            connection,
            staffId,
            values.serviceIds,
            values.schedules,
        )

        await connection.commit()

        res.json({
            message: "Staff member updated successfully",
        })
    } catch (error) {
        await connection.rollback()

        res.status(error.status || 500).json({
            error: error.message,
        })
    } finally {
        connection.release()
    }
})

router.patch("/:id/daily-status", async (req, res) => {
    try {
        const dailyStatus =
            req.body.daily_status === "Unavailable"
                ? "Unavailable"
                : "Available"

        const [result] = await promiseDb.query(
            `UPDATE staff
             SET daily_status = ?
             WHERE staff_id = ?`,
            [
                dailyStatus,
                Number(req.params.id),
            ],
        )

        if (!result.affectedRows) {
            return res.status(404).json({
                error: "Staff not found",
            })
        }

        res.json({
            message: "Daily availability updated",
            daily_status: dailyStatus,
        })
    } catch (error) {
        res.status(500).json({
            error: error.message,
        })
    }
})

router.post("/:id/unavailability", async (req, res) => {
    try {
        const { start_at, end_at, reason } =
            req.body || {}

        if (
            !start_at ||
            !end_at ||
            end_at <= start_at
        ) {
            return res.status(400).json({
                error:
                    "A valid unavailable period is required",
            })
        }

        const [result] = await promiseDb.query(
            `INSERT INTO staff_unavailability
                (
                    staff_id,
                    start_at,
                    end_at,
                    reason
                )
             VALUES (?, ?, ?, ?)`,
            [
                Number(req.params.id),
                start_at,
                end_at,
                String(
                    reason || "Unavailable",
                ).trim(),
            ],
        )

        res.status(201).json({
            message: "Unavailability recorded",
            unavailability_id:
                result.insertId,
        })
    } catch (error) {
        res.status(500).json({
            error: error.message,
        })
    }
})

router.delete(
    "/unavailability/:id",
    async (req, res) => {
        try {
            const [result] =
                await promiseDb.query(
                    `DELETE FROM staff_unavailability
                     WHERE unavailability_id = ?`,
                    [Number(req.params.id)],
                )

            if (!result.affectedRows) {
                return res.status(404).json({
                    error:
                        "Unavailability record not found",
                })
            }

            res.json({
                message:
                    "Unavailability removed",
            })
        } catch (error) {
            res.status(500).json({
                error: error.message,
            })
        }
    },
)

router.delete("/:id", async (req, res) => {
    try {
        const [result] = await promiseDb.query(
            `UPDATE staff
             SET
                active_status = 'Inactive',
                daily_status = 'Unavailable'
             WHERE staff_id = ?`,
            [Number(req.params.id)],
        )

        if (!result.affectedRows) {
            return res.status(404).json({
                error: "Staff not found",
            })
        }

        res.json({
            message: "Staff member deactivated",
        })
    } catch (error) {
        res.status(500).json({
            error: error.message,
        })
    }
})

module.exports = router

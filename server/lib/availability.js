const { addMinutes, isValidDate, normalizeTime } = require("./time")

async function resolveService(connection, { service_id, service }) {
    const params = []
    let where = ""

    if (service_id) {
        where = "service_id = ?"
        params.push(Number(service_id))
    } else if (service) {
        where = "service = ?"
        params.push(String(service))
    } else {
        const error = new Error("A valid service is required")
        error.status = 400
        throw error
    }

    const [rows] = await connection.query(
        `SELECT
       service_id,
       service,
       price,
       status,
       COALESCE(
         NULLIF(duration_minutes, 0),
         60
       ) AS duration_minutes
     FROM services
     WHERE ${where}
     LIMIT 1`,
        params,
    )

    if (!rows.length || rows[0].status !== "Available") {
        const error = new Error("Service is unavailable or does not exist")
        error.status = 404
        throw error
    }

    return rows[0]
}

async function listQualifiedScheduledStaff(
    connection,
    { serviceId, appointmentDate, startTime, endTime, preferredStaffId },
) {
    const params = [serviceId, appointmentDate, startTime, endTime]

    let staffFilter = ""

    if (preferredStaffId) {
        staffFilter = "AND s.staff_id = ?"
        params.push(Number(preferredStaffId))
    }

    const [rows] = await connection.query(
        `SELECT DISTINCT
       s.staff_id,
       s.name,
       s.role
     FROM staff s
     INNER JOIN staff_services ss
       ON ss.staff_id = s.staff_id
     INNER JOIN staff_schedule sch
       ON sch.staff_id = s.staff_id
     WHERE ss.service_id = ?
       AND sch.day_of_week = DAYOFWEEK(?) - 1
       AND sch.active = 1
       AND sch.shift_start <= ?
       AND sch.shift_end >= ?
       AND s.active_status = 'Active'
       AND s.daily_status = 'Available'
       ${staffFilter}
     ORDER BY s.name, s.staff_id`,
        params,
    )

    return rows
}

async function staffHasConflict(
    connection,
    { staffId, appointmentDate, startTime, endTime, excludeAppointmentId, lockRows = false },
) {
    const requestedStart = `${appointmentDate} ${startTime}:00`

    const requestedEnd = `${appointmentDate} ${endTime}:00`

    const [unavailable] = await connection.query(
        `SELECT unavailability_id
     FROM staff_unavailability
     WHERE staff_id = ?
       AND start_at < ?
       AND end_at > ?
     LIMIT 1${lockRows ? " FOR UPDATE" : ""}`,
        [staffId, requestedEnd, requestedStart],
    )

    if (unavailable.length) return true

    const params = [staffId, appointmentDate, endTime, startTime]

    let exclude = ""

    if (excludeAppointmentId) {
        exclude = "AND a.id <> ?"
        params.push(Number(excludeAppointmentId))
    }

    /*
     * Existing appointments without a deposit record retain
     * their original scheduling behavior.
     *
     * A deposit booking blocks the slot while:
     * - its payment window is still open;
     * - its submitted payment awaits verification; or
     * - its payment has been verified.
     *
     * Expired or rejected deposit bookings do not block a slot.
     * UTC_TIMESTAMP() makes expiry independent of the
     * customer's device clock.
     */
    const [appointments] = await connection.query(
        `SELECT a.id
     FROM appointments a
     LEFT JOIN booking_deposits bd
       ON bd.appointment_id = a.id
     WHERE a.staff_id = ?
       AND a.appointment_date = ?
       AND a.status NOT IN (
         'Declined',
         'Cancelled',
         'Rejected'
       )
       AND a.appointment_time < ?
       AND COALESCE(
         a.appointment_end_time,
         ADDTIME(a.appointment_time, '01:00:00')
       ) > ?
       AND (
         bd.deposit_id IS NULL
         OR bd.payment_status IN (
           'Awaiting Verification',
           'Verified'
         )
         OR (
           bd.payment_status = 'Awaiting Payment'
           AND bd.expires_at > UTC_TIMESTAMP()
         )
       )
       ${exclude}
     LIMIT 1${lockRows ? " FOR UPDATE" : ""}`,
        params,
    )

    return appointments.length > 0
}

async function getAvailableStaff(
    connection,
    {
        serviceId,
        appointmentDate,
        startTime,
        durationMinutes,
        preferredStaffId,
        excludeAppointmentId,
    },
) {
    if (!isValidDate(appointmentDate)) {
        const error = new Error("Appointment date must use YYYY-MM-DD format")
        error.status = 400
        throw error
    }

    const duration = Number(durationMinutes)

    if (!Number.isInteger(duration) || duration <= 0) {
        const error = new Error("The service duration is invalid")
        error.status = 400
        throw error
    }

    const normalizedStart = normalizeTime(startTime)

    const endTime = addMinutes(normalizedStart, duration)

    const candidates = await listQualifiedScheduledStaff(connection, {
        serviceId,
        appointmentDate,
        startTime: normalizedStart,
        endTime,
        preferredStaffId,
    })

    const available = []

    for (const candidate of candidates) {
        const conflict = await staffHasConflict(connection, {
            staffId: candidate.staff_id,
            appointmentDate,
            startTime: normalizedStart,
            endTime,
            excludeAppointmentId,
        })

        if (!conflict) {
            available.push(candidate)
        }
    }

    return {
        available,
        endTime,
        startTime: normalizedStart,
    }
}

async function reserveAvailableStaff(connection, options) {
    const availability = await getAvailableStaff(connection, options)

    for (const candidate of availability.available) {
        await connection.query(
            `SELECT staff_id
       FROM staff
       WHERE staff_id = ?
       FOR UPDATE`,
            [candidate.staff_id],
        )

        const conflict = await staffHasConflict(connection, {
            staffId: candidate.staff_id,
            appointmentDate: options.appointmentDate,
            startTime: availability.startTime,
            endTime: availability.endTime,
            excludeAppointmentId: options.excludeAppointmentId,
            lockRows: true,
        })

        if (!conflict) {
            return {
                staff: candidate,
                endTime: availability.endTime,
                startTime: availability.startTime,
            }
        }
    }

    return {
        staff: null,
        endTime: availability.endTime,
        startTime: availability.startTime,
    }
}

module.exports = {
    getAvailableStaff,
    reserveAvailableStaff,
    resolveService,
}

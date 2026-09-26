const {
    addMinutes,
    isValidDate,
    normalizeTime,
} = require("./time")

async function resolveService(
    connection,
    { service_id, service },
) {
    const params = []
    let where = ""

    if (service_id) {
        where = "service_id = ?"
        params.push(Number(service_id))
    } else if (service) {
        where = "service = ?"
        params.push(String(service))
    } else {
        const error = new Error(
            "A valid service is required",
        )

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

    if (
        !rows.length ||
        rows[0].status !== "Available"
    ) {
        const error = new Error(
            "Service is unavailable or does not exist",
        )

        error.status = 404
        throw error
    }

    return rows[0]
}

async function getDailyLimitStatus(
    connection,
    {
        serviceId,
        appointmentDate,
        excludeAppointmentId,
    },
) {
    const [limitRows] = await connection.query(
        `SELECT client_limit
         FROM service_daily_limits
         WHERE service_id = ?
           AND day_of_week = DAYOFWEEK(?) - 1
         LIMIT 1`,
        [
            serviceId,
            appointmentDate,
        ],
    )

    // Services without an owner-set limit continue
    // using the existing staff-based availability.
    if (!limitRows.length) {
        return {
            configured: false,
            limit: null,
            booked: 0,
            remaining: null,
            reached: false,
        }
    }

    const params = [
        serviceId,
        appointmentDate,
    ]

    let exclude = ""

    if (excludeAppointmentId) {
        exclude = "AND a.id <> ?"

        params.push(
            Number(excludeAppointmentId),
        )
    }

    const [countRows] = await connection.query(
        `SELECT COUNT(*) AS booked
         FROM appointments a
         LEFT JOIN booking_deposits bd
            ON bd.appointment_id = a.id
         WHERE a.service_id = ?
           AND a.appointment_date = ?
           AND a.status NOT IN (
                'Declined',
                'Cancelled',
                'Rejected'
           )
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
           ${exclude}`,
        params,
    )

    const limit = Number(
        limitRows[0].client_limit,
    )

    const booked = Number(
        countRows[0]?.booked || 0,
    )

    return {
        configured: true,
        limit,
        booked,

        remaining: Math.max(
            0,
            limit - booked,
        ),

        reached: booked >= limit,
    }
}

async function listQualifiedScheduledStaff(
    connection,
    {
        serviceId,
        appointmentDate,
        startTime,
        endTime,
        preferredStaffId,
    },
) {
    /*
     * Parameter order:
     * 1. Service ID
     * 2. Appointment date
     * 3. Appointment start for shift start check
     * 4. Appointment end for shift end check
     * 5. Appointment start for break overlap check
     * 6. Appointment end for break overlap check
     */
    const params = [
        serviceId,
        appointmentDate,
        startTime,
        endTime,
        startTime,
        endTime,
    ]

    let staffFilter = ""

    if (preferredStaffId) {
        staffFilter = "AND s.staff_id = ?"

        params.push(
            Number(preferredStaffId),
        )
    }

    const [rows] = await connection.query(
        `SELECT DISTINCT
            s.staff_id,
            s.name,
            s.role,
            sch.shift_start,
            sch.shift_end,
            sch.break_start,
            sch.break_end
         FROM staff s
         INNER JOIN staff_services ss
            ON ss.staff_id = s.staff_id
         INNER JOIN staff_schedule sch
            ON sch.staff_id = s.staff_id
         WHERE ss.service_id = ?
           AND sch.day_of_week = DAYOFWEEK(?) - 1
           AND sch.active = 1

           -- The complete service must fit inside the shift.
           AND sch.shift_start <= ?
           AND sch.shift_end >= ?

           -- The appointment must not overlap the regular break.
           AND NOT (
                sch.break_start IS NOT NULL
                AND sch.break_end IS NOT NULL
                AND ? < sch.break_end
                AND ? > sch.break_start
           )

           AND s.active_status = 'Active'
           AND s.daily_status = 'Available'

           ${staffFilter}

         ORDER BY
            s.name,
            s.staff_id`,
        params,
    )

    return rows
}

async function staffHasConflict(
    connection,
    {
        staffId,
        appointmentDate,
        startTime,
        endTime,
        excludeAppointmentId,
        lockRows = false,
    },
) {
    const requestedStart =
        `${appointmentDate} ${startTime}:00`

    const requestedEnd =
        `${appointmentDate} ${endTime}:00`

    /*
     * This handles one-time leave, temporary breaks,
     * training, and other date-specific unavailable periods.
     */
    const [unavailable] = await connection.query(
        `SELECT unavailability_id
         FROM staff_unavailability
         WHERE staff_id = ?
           AND start_at < ?
           AND end_at > ?
         LIMIT 1
         ${lockRows ? "FOR UPDATE" : ""}`,
        [
            staffId,
            requestedEnd,
            requestedStart,
        ],
    )

    if (unavailable.length) {
        return true
    }

    const params = [
        staffId,
        appointmentDate,
        endTime,
        startTime,
    ]

    let exclude = ""

    if (excludeAppointmentId) {
        exclude = "AND a.id <> ?"

        params.push(
            Number(excludeAppointmentId),
        )
    }

    /*
     * A booking blocks the staff member while:
     * - it has no deposit requirement;
     * - payment is awaiting verification;
     * - payment is verified; or
     * - its payment window is still open.
     *
     * Declined, cancelled, rejected, and expired
     * unpaid bookings do not block the staff member.
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
                ADDTIME(
                    a.appointment_time,
                    '01:00:00'
                )
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
         LIMIT 1
         ${lockRows ? "FOR UPDATE" : ""}`,
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
        const error = new Error(
            "Appointment date must use YYYY-MM-DD format",
        )

        error.status = 400
        throw error
    }

    const duration = Number(
        durationMinutes,
    )

    if (
        !Number.isInteger(duration) ||
        duration <= 0
    ) {
        const error = new Error(
            "The service duration is invalid",
        )

        error.status = 400
        throw error
    }

    const normalizedStart =
        normalizeTime(startTime)

    const endTime = addMinutes(
        normalizedStart,
        duration,
    )

    const dailyLimit =
        await getDailyLimitStatus(
            connection,
            {
                serviceId,
                appointmentDate,
                excludeAppointmentId,
            },
        )

    if (dailyLimit.reached) {
        return {
            available: [],
            endTime,
            startTime: normalizedStart,
            dailyLimit,
        }
    }

    const candidates =
        await listQualifiedScheduledStaff(
            connection,
            {
                serviceId,
                appointmentDate,
                startTime: normalizedStart,
                endTime,
                preferredStaffId,
            },
        )

    const available = []

    for (const candidate of candidates) {
        const conflict =
            await staffHasConflict(
                connection,
                {
                    staffId:
                        candidate.staff_id,

                    appointmentDate,

                    startTime:
                        normalizedStart,

                    endTime,

                    excludeAppointmentId,
                },
            )

        if (!conflict) {
            available.push(candidate)
        }
    }

    return {
        available,
        endTime,
        startTime: normalizedStart,
        dailyLimit,
    }
}

async function reserveAvailableStaff(
    connection,
    options,
) {
    /*
     * Lock the service before checking its daily limit.
     * This prevents two simultaneous bookings from both
     * passing the same remaining-capacity check.
     */
    await connection.query(
        `SELECT service_id
         FROM services
         WHERE service_id = ?
         FOR UPDATE`,
        [
            Number(options.serviceId),
        ],
    )

    const availability =
        await getAvailableStaff(
            connection,
            options,
        )

    for (
        const candidate
        of availability.available
    ) {
        await connection.query(
            `SELECT staff_id
             FROM staff
             WHERE staff_id = ?
             FOR UPDATE`,
            [
                candidate.staff_id,
            ],
        )

        const conflict =
            await staffHasConflict(
                connection,
                {
                    staffId:
                        candidate.staff_id,

                    appointmentDate:
                        options.appointmentDate,

                    startTime:
                        availability.startTime,

                    endTime:
                        availability.endTime,

                    excludeAppointmentId:
                        options.excludeAppointmentId,

                    lockRows: true,
                },
            )

        if (!conflict) {
            return {
                staff: candidate,

                endTime:
                    availability.endTime,

                startTime:
                    availability.startTime,

                dailyLimit:
                    availability.dailyLimit,
            }
        }
    }

    return {
        staff: null,

        endTime:
            availability.endTime,

        startTime:
            availability.startTime,

        dailyLimit:
            availability.dailyLimit,
    }
}

module.exports = {
    getAvailableStaff,
    getDailyLimitStatus,
    reserveAvailableStaff,
    resolveService,
}

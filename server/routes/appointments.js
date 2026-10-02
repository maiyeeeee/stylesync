const express = require("express")
const nodemailer = require("nodemailer")

const router = express.Router()
const db = require("../db")

const {
    getAvailableStaff,
    reserveAvailableStaff,
    resolveService,
} = require("../lib/availability")

const promiseDb = db.promise()

function getMailTransport() {
    const port = Number(
        process.env.SMTP_PORT || 587,
    )

    if (
        !process.env.SMTP_HOST ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASS ||
        !process.env.MAIL_FROM
    ) {
        return null
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        requireTLS: port === 587,

        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },

        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
    })
}

function validEmail(value) {
    const email = String(
        value || "",
    ).trim()

    return (
        email.length > 0 &&
        email.length <= 100 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email,
        )
    )
}

function formatDateForEmail(value) {
    if (!value) return ""

    let text

    if (
        value instanceof Date &&
        !Number.isNaN(
            value.getTime(),
        )
    ) {
        text =
            new Intl.DateTimeFormat(
                "en-CA",
                {
                    timeZone:
                        "Asia/Manila",

                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                },
            ).format(value)
    } else {
        text = String(value).slice(
            0,
            10,
        )
    }

    const date = new Date(
        `${text}T00:00:00+08:00`,
    )

    if (
        Number.isNaN(
            date.getTime(),
        )
    ) {
        return text
    }

    return date.toLocaleDateString(
        "en-PH",
        {
            timeZone:
                "Asia/Manila",

            month: "long",
            day: "numeric",
            year: "numeric",
        },
    )
}

function formatTimeForEmail(value) {
    if (!value) return ""

    return String(value).slice(
        0,
        5,
    )
}

async function sendAppointmentStatusEmail({
    appointment,
    status,
    declineReason,
    suggestedDate,
    suggestedTime,
}) {
    const recipient = String(
        appointment?.email || "",
    ).trim()

    if (!validEmail(recipient)) {
        return {
            sent: false,
            reason:
                "No valid customer email.",
        }
    }

    if (
        ![
            "Approved",
            "Declined",
        ].includes(status)
    ) {
        return {
            sent: false,
            reason:
                "No email required for this status.",
        }
    }

    const transport =
        getMailTransport()

    if (!transport) {
        console.error(
            "Appointment email skipped: mail configuration unavailable.",
        )

        return {
            sent: false,
            reason:
                "Mail configuration unavailable.",
        }
    }

    const customerName =
        String(
            appointment.customer_name ||
                "Customer",
        ).trim()

    const service =
        String(
            appointment.service ||
                "Salon service",
        ).trim()

    const appointmentDate =
        formatDateForEmail(
            appointment.appointment_date,
        )

    const appointmentTime =
        formatTimeForEmail(
            appointment.appointment_time,
        )

    let subject
    let text

    if (status === "Approved") {
        subject =
            "Your Dahling’s Escape appointment is approved"

        text = [
            `Hi ${customerName},`,
            "",
            "Your appointment request has been approved.",
            "",
            `Service: ${service}`,
            `Date: ${appointmentDate}`,
            `Time: ${appointmentTime}`,
            "",
            "Your down payment has been verified and your appointment is confirmed.",
            "",
            "Please arrive on time for your scheduled appointment.",
            "",
            "If you have questions or need assistance, please contact Dahling’s Escape Salon & Spa.",
            "",
            "Thank you,",
            "Dahling’s Escape Salon & Spa",
        ].join("\n")
    } else {
        const suggestedDateText =
            formatDateForEmail(
                suggestedDate,
            )

        const suggestedTimeText =
            formatTimeForEmail(
                suggestedTime,
            )

        const lines = [
            `Hi ${customerName},`,
            "",
            "We’re sorry, but your requested appointment schedule could not be approved.",
            "",
            `Service: ${service}`,
            `Requested date: ${appointmentDate}`,
            `Requested time: ${appointmentTime}`,
            "",
            `Reason: ${
                declineReason ||
                "The requested schedule is unavailable."
            }`,
        ]

        if (
            suggestedDateText &&
            suggestedTimeText
        ) {
            lines.push(
                "",
                `Suggested alternative: ${suggestedDateText} at ${suggestedTimeText}`,
            )
        }

        lines.push(
            "",
            "You may return to the StyleSync booking page to choose another schedule.",
            "",
            "If you need assistance, please contact Dahling’s Escape Salon & Spa.",
            "",
            "Thank you,",
            "Dahling’s Escape Salon & Spa",
        )

        text = lines.join("\n")
    }

    try {
        await transport.sendMail({
            from:
                process.env.MAIL_FROM,

            to: recipient,

            subject,

            text,
        })

        return {
            sent: true,
        }
    } catch (error) {
        console.error(
            "Appointment email failed:",
            error.code ||
                error.name ||
                "MAIL_FAILED",
        )

        return {
            sent: false,
            reason:
                "Email delivery failed.",
        }
    }
}

router.get(
    "/",
    async (req, res) => {
        try {
            const [rows] =
                await promiseDb.query(
                    `SELECT
                        a.*,
                        s.name AS staff_name,
                        s.role AS staff_role,
                        sv.duration_minutes

                     FROM appointments a

                     LEFT JOIN staff s
                        ON s.staff_id =
                           a.staff_id

                     LEFT JOIN services sv
                        ON sv.service_id =
                           a.service_id

                     ORDER BY
                        a.appointment_date DESC,
                        a.appointment_time DESC`,
                )

            res.json(rows)
        } catch (error) {
            res.status(500).json({
                error:
                    error.message,
            })
        }
    },
)

router.get(
    "/availability",
    async (req, res) => {
        try {
            const service =
                await resolveService(
                    promiseDb,
                    req.query,
                )

            const result =
                await getAvailableStaff(
                    promiseDb,
                    {
                        serviceId:
                            service.service_id,

                        appointmentDate:
                            req.query
                                .appointment_date,

                        startTime:
                            req.query
                                .appointment_time,

                        durationMinutes:
                            Number(
                                service.duration_minutes,
                            ),

                        preferredStaffId:
                            req.query
                                .staff_id,
                    },
                )

            const qualifiedStaffCount =
                result.available.length

            const dailyLimitConfigured =
                Boolean(
                    result.dailyLimit
                        ?.configured,
                )

            const dailyRemaining =
                dailyLimitConfigured
                    ? Number(
                          result.dailyLimit
                              .remaining,
                      )
                    : null

            const effectiveAvailableCount =
                dailyLimitConfigured
                    ? Math.min(
                          qualifiedStaffCount,
                          dailyRemaining,
                      )
                    : qualifiedStaffCount

            res.json({
                service_id:
                    service.service_id,

                service:
                    service.service,

                duration_minutes:
                    Number(
                        service.duration_minutes,
                    ),

                start_time:
                    result.startTime,

                end_time:
                    result.endTime,

                available_count:
                    effectiveAvailableCount,

                qualified_staff_count:
                    qualifiedStaffCount,

                available_staff:
                    result.available,

                daily_limit_configured:
                    dailyLimitConfigured,

                daily_client_limit:
                    dailyLimitConfigured
                        ? Number(
                              result
                                  .dailyLimit
                                  .limit,
                          )
                        : null,

                daily_booked:
                    dailyLimitConfigured
                        ? Number(
                              result
                                  .dailyLimit
                                  .booked,
                          )
                        : null,

                daily_remaining:
                    dailyRemaining,
            })
        } catch (error) {
            res.status(
                error.status || 500,
            ).json({
                error:
                    error.message,
            })
        }
    },
)

router.post(
    "/",
    async (req, res) => {
        const connection =
            await promiseDb.getConnection()

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

            if (
                !customer_name ||
                !contact_number ||
                !appointment_date ||
                !appointment_time
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            "Customer, contact number, appointment date, and time are required",
                    })
            }

            if (offline_id) {
                const [duplicate] =
                    await connection.query(
                        `SELECT
                            id,
                            status,
                            staff_id

                         FROM appointments

                         WHERE offline_id = ?

                         LIMIT 1`,
                        [
                            String(
                                offline_id,
                            ),
                        ],
                    )

                if (
                    duplicate.length
                ) {
                    return res.json({
                        message:
                            "Offline appointment was already synchronized",

                        id:
                            duplicate[0]
                                .id,

                        status:
                            duplicate[0]
                                .status,

                        duplicate:
                            true,
                    })
                }
            }

            await connection.beginTransaction()

            const selectedService =
                await resolveService(
                    connection,
                    {
                        service_id,
                        service,
                    },
                )

            const reservation =
                await reserveAvailableStaff(
                    connection,
                    {
                        serviceId:
                            selectedService.service_id,

                        appointmentDate:
                            appointment_date,

                        startTime:
                            appointment_time,

                        durationMinutes:
                            Number(
                                selectedService.duration_minutes,
                            ),

                        preferredStaffId:
                            staff_id,
                    },
                )

            if (
                !reservation.staff
            ) {
                const error =
                    new Error(
                        offline_id
                            ? "No qualified staff is available for this offline appointment. It needs manual review."
                            : "No qualified staff is available for the complete service duration. Choose another schedule.",
                    )

                error.status = 409
                throw error
            }

            const [
                appointmentResult,
            ] =
                await connection.query(
                    `INSERT INTO appointments
                    (
                        customer_name,
                        contact_number,
                        email,
                        service_id,
                        service,
                        appointment_date,
                        appointment_time,
                        appointment_end_time,
                        staff_id,
                        notes,
                        status,
                        offline_id,
                        sync_status
                    )

                    VALUES
                    (
                        ?, ?, ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        'Pending',
                        ?, ?
                    )`,
                    [
                        String(
                            customer_name,
                        ).trim(),

                        String(
                            contact_number,
                        ).trim(),

                        String(
                            email || "",
                        ).trim(),

                        selectedService.service_id,

                        selectedService.service,

                        appointment_date,

                        reservation.startTime,

                        reservation.endTime,

                        reservation.staff
                            .staff_id,

                        String(
                            notes || "",
                        ).trim(),

                        offline_id
                            ? String(
                                  offline_id,
                              )
                            : null,

                        offline_id
                            ? "Synced"
                            : "Online",
                    ],
                )

            const [customers] =
                await connection.query(
                    `SELECT customer_id

                     FROM customers

                     WHERE contact_number = ?

                     LIMIT 1`,
                    [
                        String(
                            contact_number,
                        ).trim(),
                    ],
                )

            if (
                !customers.length
            ) {
                await connection.query(
                    `INSERT INTO customers
                    (
                        customer_name,
                        contact_number,
                        email,
                        gender,
                        customer_type
                    )

                    VALUES (?, ?, ?, ?, ?)`,
                    [
                        String(
                            customer_name,
                        ).trim(),

                        String(
                            contact_number,
                        ).trim(),

                        String(
                            email || "",
                        ).trim(),

                        String(
                            gender ||
                                "Prefer not to say",
                        ),

                        String(
                            customer_type ||
                                "Regular",
                        ),
                    ],
                )
            }

            await connection.commit()

            res.status(201).json({
                message:
                    offline_id
                        ? "Offline appointment synchronized and validated"
                        : "Appointment saved and staff time reserved",

                id:
                    appointmentResult.insertId,

                status:
                    "Pending",

                staff:
                    reservation.staff,

                start_time:
                    reservation.startTime,

                end_time:
                    reservation.endTime,
            })
        } catch (error) {
            await connection
                .rollback()
                .catch(() => {})

            if (
                error.code ===
                    "ER_DUP_ENTRY" &&
                req.body?.offline_id
            ) {
                const [duplicate] =
                    await promiseDb.query(
                        `SELECT
                            id,
                            status

                         FROM appointments

                         WHERE offline_id = ?

                         LIMIT 1`,
                        [
                            String(
                                req.body
                                    .offline_id,
                            ),
                        ],
                    )

                if (
                    duplicate.length
                ) {
                    return res.json({
                        message:
                            "Offline appointment was already synchronized",

                        id:
                            duplicate[0]
                                .id,

                        status:
                            duplicate[0]
                                .status,

                        duplicate:
                            true,
                    })
                }
            }

            res.status(
                error.status || 500,
            ).json({
                error:
                    error.message,
            })
        } finally {
            connection.release()
        }
    },
)

router.put(
    "/:id/status",
    async (req, res) => {
        const connection =
            await promiseDb.getConnection()

        let committed = false

        try {
            const appointmentId =
                Number(
                    req.params.id,
                )

            if (
                !Number.isSafeInteger(
                    appointmentId,
                ) ||
                appointmentId <= 0
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            "Invalid appointment.",
                    })
            }

            const status =
                String(
                    req.body?.status ||
                        "",
                ).trim()

            const requestedDeclineReason =
                String(
                    req.body
                        ?.decline_reason ||
                        "",
                ).trim()

            const requestedSuggestedDate =
                String(
                    req.body
                        ?.suggested_date ||
                        "",
                ).trim()

            const requestedSuggestedTime =
                String(
                    req.body
                        ?.suggested_time ||
                        "",
                ).trim()

            const allowedStatuses = [
                "Pending",
                "Approved",
                "Declined",
                "Cancelled",
                "Completed",
            ]

            if (
                !allowedStatuses.includes(
                    status,
                )
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            "Invalid appointment status",
                    })
            }

            await connection.beginTransaction()

            const [rows] =
                await connection.query(
                    `SELECT
                        a.*,

                        COALESCE(
                            sv.duration_minutes,
                            60
                        ) AS duration_minutes

                     FROM appointments a

                     LEFT JOIN services sv
                        ON sv.service_id =
                           a.service_id

                     WHERE a.id = ?

                     FOR UPDATE`,
                    [
                        appointmentId,
                    ],
                )

            if (!rows.length) {
                const error =
                    new Error(
                        "Appointment not found",
                    )

                error.status = 404
                throw error
            }

            const appointment =
                rows[0]

            let assignedStaffId =
                appointment.staff_id

            let endTime =
                appointment.appointment_end_time

            let declineReason =
                null

            let suggestedDate =
                null

            let suggestedTime =
                null

            if (
                status ===
                "Approved"
            ) {
                const reservation =
                    await reserveAvailableStaff(
                        connection,
                        {
                            serviceId:
                                appointment.service_id,

                            appointmentDate:
                                appointment.appointment_date,

                            startTime:
                                appointment.appointment_time,

                            durationMinutes:
                                Number(
                                    appointment.duration_minutes,
                                ),

                            preferredStaffId:
                                appointment.staff_id,

                            excludeAppointmentId:
                                appointmentId,
                        },
                    )

                if (
                    !reservation.staff
                ) {
                    const error =
                        new Error(
                            "Approval blocked: assigned staff is no longer available for the full interval",
                        )

                    error.status = 409
                    throw error
                }

                assignedStaffId =
                    reservation.staff
                        .staff_id

                endTime =
                    reservation.endTime
            }

            if (
                status ===
                "Declined"
            ) {
                if (
                    !requestedDeclineReason
                ) {
                    const error =
                        new Error(
                            "Enter a reason for declining this appointment",
                        )

                    error.status = 400
                    throw error
                }

                if (
                    !/^\d{4}-\d{2}-\d{2}$/.test(
                        requestedSuggestedDate,
                    )
                ) {
                    const error =
                        new Error(
                            "Select a valid suggested alternative date",
                        )

                    error.status = 400
                    throw error
                }

                if (
                    !/^\d{2}:\d{2}(:\d{2})?$/.test(
                        requestedSuggestedTime,
                    )
                ) {
                    const error =
                        new Error(
                            "Select a valid suggested alternative time",
                        )

                    error.status = 400
                    throw error
                }

                const alternativeMoment =
                    new Date(
                        `${requestedSuggestedDate}T${requestedSuggestedTime.slice(
                            0,
                            5,
                        )}:00+08:00`,
                    )

                if (
                    Number.isNaN(
                        alternativeMoment.getTime(),
                    ) ||
                    alternativeMoment <=
                        new Date()
                ) {
                    const error =
                        new Error(
                            "The suggested alternative schedule must be in the future",
                        )

                    error.status = 400
                    throw error
                }

                const alternative =
                    await getAvailableStaff(
                        connection,
                        {
                            serviceId:
                                appointment.service_id,

                            appointmentDate:
                                requestedSuggestedDate,

                            startTime:
                                requestedSuggestedTime,

                            durationMinutes:
                                Number(
                                    appointment.duration_minutes,
                                ),

                            excludeAppointmentId:
                                appointmentId,
                        },
                    )

                if (
                    !alternative
                        .available
                        .length
                ) {
                    const error =
                        new Error(
                            "No qualified staff is available for the suggested alternative schedule",
                        )

                    error.status = 409
                    throw error
                }

                declineReason =
                    requestedDeclineReason.slice(
                        0,
                        500,
                    )

                suggestedDate =
                    requestedSuggestedDate

                suggestedTime =
                    alternative.startTime
            }

            await connection.query(
                `UPDATE appointments
                 SET
                    status = ?,
                    staff_id = ?,
                    appointment_end_time = ?,
                    decline_reason = ?,
                    suggested_date = ?,
                    suggested_time = ?

                 WHERE id = ?`,
                [
                    status,
                    assignedStaffId,
                    endTime,
                    declineReason,
                    suggestedDate,
                    suggestedTime,
                    appointmentId,
                ],
            )

            await connection.commit()

            committed = true

            let emailResult = {
                sent: false,
            }

            if (
                status ===
                    "Approved" ||
                status ===
                    "Declined"
            ) {
                emailResult =
                    await sendAppointmentStatusEmail(
                        {
                            appointment,

                            status,

                            declineReason,

                            suggestedDate,

                            suggestedTime,
                        },
                    )
            }

            return res.json({
                message:
                    status ===
                    "Approved"
                        ? emailResult.sent
                            ? "Appointment approved and customer email sent."
                            : "Appointment approved. Email could not be delivered."
                        : status ===
                            "Declined"
                          ? emailResult.sent
                              ? "Appointment declined and customer email sent."
                              : "Appointment declined. Email could not be delivered."
                          : "Appointment status updated successfully",

                id:
                    appointmentId,

                status,

                staff_id:
                    assignedStaffId,

                decline_reason:
                    declineReason,

                suggested_date:
                    suggestedDate,

                suggested_time:
                    suggestedTime,

                email_sent:
                    emailResult.sent,
            })
        } catch (error) {
            if (!committed) {
                await connection
                    .rollback()
                    .catch(
                        () => {},
                    )
            }

            return res
                .status(
                    error.status ||
                        500,
                )
                .json({
                    error:
                        error.message,
                })
        } finally {
            connection.release()
        }
    },
)

router.put(
    "/:id/assign",
    async (req, res) => {
        const connection =
            await promiseDb.getConnection()

        try {
            const appointmentId =
                Number(
                    req.params.id,
                )

            const staffId =
                Number(
                    req.body.staff_id,
                )

            await connection.beginTransaction()

            const [rows] =
                await connection.query(
                    `SELECT
                        a.*,

                        COALESCE(
                            s.duration_minutes,
                            60
                        ) AS duration_minutes

                     FROM appointments a

                     LEFT JOIN services s
                        ON s.service_id =
                           a.service_id

                     WHERE a.id = ?

                     FOR UPDATE`,
                    [
                        appointmentId,
                    ],
                )

            if (!rows.length) {
                const error =
                    new Error(
                        "Appointment not found",
                    )

                error.status = 404
                throw error
            }

            const appointment =
                rows[0]

            const reservation =
                await reserveAvailableStaff(
                    connection,
                    {
                        serviceId:
                            appointment.service_id,

                        appointmentDate:
                            appointment.appointment_date,

                        startTime:
                            appointment.appointment_time,

                        durationMinutes:
                            Number(
                                appointment.duration_minutes,
                            ),

                        preferredStaffId:
                            staffId,

                        excludeAppointmentId:
                            appointmentId,
                    },
                )

            if (
                !reservation.staff
            ) {
                const error =
                    new Error(
                        "Selected staff member is unavailable or unqualified",
                    )

                error.status = 409
                throw error
            }

            await connection.query(
                `UPDATE appointments
                 SET
                    staff_id = ?,
                    appointment_end_time = ?

                 WHERE id = ?`,
                [
                    reservation.staff
                        .staff_id,

                    reservation.endTime,

                    appointmentId,
                ],
            )

            await connection.commit()

            res.json({
                message:
                    "Staff assignment updated",

                staff:
                    reservation.staff,
            })
        } catch (error) {
            await connection
                .rollback()
                .catch(() => {})

            res.status(
                error.status || 500,
            ).json({
                error:
                    error.message,
            })
        } finally {
            connection.release()
        }
    },
)

module.exports = router

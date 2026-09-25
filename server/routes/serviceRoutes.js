const express = require("express")
const router = express.Router()
const db = require("../db")
const multer = require("multer")
const path = require("path")
const fs = require("fs")

const promiseDb = db.promise()
const uploadDir = "uploads/services"

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {
        recursive: true,
    })
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir)
    },

    filename: (req, file, cb) => {
        const uniqueName =
            `${Date.now()}-${Math.round(Math.random() * 1e9)}`

        const extension =
            path
                .extname(file.originalname)
                .toLowerCase()

        cb(null, uniqueName + extension)
    },
})

const upload = multer({
    storage,

    limits: {
        fileSize: 2 * 1024 * 1024,
    },

    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
        ]

        if (
            allowedTypes.includes(
                file.mimetype,
            )
        ) {
            return cb(null, true)
        }

        cb(
            new Error(
                "Service photo must be a JPG, PNG, or WebP image.",
            ),
        )
    },
})

const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
]

function problem(message, status = 400) {
    const error = new Error(message)
    error.status = status
    return error
}

function positiveId(value) {
    const id = Number(value)

    if (
        !Number.isSafeInteger(id) ||
        id <= 0
    ) {
        throw problem(
            "Service is invalid.",
        )
    }

    return id
}

function servicePayload(body = {}) {
    const service =
        String(body.service || "").trim()

    const category =
        String(body.category || "").trim()

    const durationMinutes = Number(
        body.duration_minutes ||
            body.duration,
    )

    const priceText =
        String(body.price ?? "").trim()

    const status =
        body.status === "Unavailable"
            ? "Unavailable"
            : "Available"

    if (
        !service ||
        service.length > 150
    ) {
        throw problem(
            "Service name is required and must not exceed 150 characters.",
        )
    }

    if (category.length > 100) {
        throw problem(
            "Category must not exceed 100 characters.",
        )
    }

    if (
        !/^\d+(\.\d{1,2})?$/.test(
            priceText,
        )
    ) {
        throw problem(
            "Price must be a non-negative amount with up to two decimals.",
        )
    }

    const price = Number(priceText)

    if (
        !Number.isFinite(price) ||
        price > 99999999.99
    ) {
        throw problem(
            "Price is outside the allowed range.",
        )
    }

    if (
        !Number.isInteger(
            durationMinutes,
        ) ||
        durationMinutes < 1 ||
        durationMinutes > 480
    ) {
        throw problem(
            "Service duration must be between 1 and 480 minutes.",
        )
    }

    return {
        service,
        category,
        price: price.toFixed(2),
        durationMinutes,
        status,
    }
}

function removeUploadedFile(file) {
    if (!file?.path) return

    fs.unlink(file.path, () => {})
}

function requireOwner(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error:
                "Please sign in again.",
        })
    }

    if (req.user.role !== "owner") {
        return res.status(403).json({
            error:
                "Only the owner can change service client limits.",
        })
    }

    next()
}

function clientLimitsPayload(body = {}) {
    if (
        !Array.isArray(body.limits) ||
        body.limits.length !== 7
    ) {
        throw problem(
            "Enter one client limit for every day from Sunday to Saturday.",
        )
    }

    const seen = new Set()

    const limits =
        body.limits.map((item) => {
            const dayNumber = Number(
                item?.day_number,
            )

            const clientLimit = Number(
                item?.client_limit,
            )

            if (
                !Number.isInteger(
                    dayNumber,
                ) ||
                dayNumber < 0 ||
                dayNumber > 6
            ) {
                throw problem(
                    "A weekday in the client limits is invalid.",
                )
            }

            if (seen.has(dayNumber)) {
                throw problem(
                    "Each weekday must appear only once.",
                )
            }

            if (
                !Number.isInteger(
                    clientLimit,
                ) ||
                clientLimit < 0 ||
                clientLimit > 100
            ) {
                throw problem(
                    "Each daily client limit must be a whole number from 0 to 100.",
                )
            }

            seen.add(dayNumber)

            return {
                dayNumber,
                clientLimit,
            }
        })

    if (seen.size !== 7) {
        throw problem(
            "Enter one client limit for every day from Sunday to Saturday.",
        )
    }

    return limits
}

// Get services, staff schedules,
// calculated capacity, and owner limits.
router.get("/", async (req, res) => {
    try {
        const [
            [services],
            [capacityRows],
            [specialistRows],
            [limitRows],
        ] = await Promise.all([
            promiseDb.query(`
                SELECT *
                FROM services
                ORDER BY
                    service,
                    service_id
            `),

            promiseDb.query(`
                SELECT
                    sv.service_id,
                    sch.day_of_week,

                    COUNT(
                        DISTINCT s.staff_id
                    ) AS scheduled_staff,

                    COALESCE(
                        SUM(
                            FLOOR(
                                TIME_TO_SEC(
                                    TIMEDIFF(
                                        sch.shift_end,
                                        sch.shift_start
                                    )
                                ) /
                                (
                                    60 *
                                    COALESCE(
                                        NULLIF(
                                            sv.duration_minutes,
                                            0
                                        ),
                                        60
                                    )
                                )
                            )
                        ),
                        0
                    ) AS client_capacity

                FROM services sv

                INNER JOIN staff_services ss
                    ON ss.service_id =
                        sv.service_id

                INNER JOIN staff s
                    ON s.staff_id =
                        ss.staff_id

                INNER JOIN staff_schedule sch
                    ON sch.staff_id =
                        s.staff_id

                WHERE
                    s.active_status =
                        'Active'

                    AND s.daily_status =
                        'Available'

                    AND sch.active = 1

                    AND sch.shift_end >
                        sch.shift_start

                GROUP BY
                    sv.service_id,
                    sch.day_of_week

                ORDER BY
                    sv.service_id,
                    sch.day_of_week
            `),

            promiseDb.query(`
                SELECT
                    sv.service_id,

                    COUNT(
                        DISTINCT s.staff_id
                    ) AS qualified_staff_count,

                    GROUP_CONCAT(
                        DISTINCT s.name
                        ORDER BY s.name
                        SEPARATOR ', '
                    ) AS qualified_staff_names

                FROM services sv

                LEFT JOIN staff_services ss
                    ON ss.service_id =
                        sv.service_id

                LEFT JOIN staff s
                    ON s.staff_id =
                        ss.staff_id

                    AND s.active_status =
                        'Active'

                GROUP BY sv.service_id
            `),

            promiseDb.query(`
                SELECT
                    service_id,
                    day_of_week,
                    client_limit

                FROM service_daily_limits

                ORDER BY
                    service_id,
                    day_of_week
            `),
        ])

        const capacityMap =
            new Map()

        for (const row of capacityRows) {
            const id = String(
                row.service_id,
            )

            if (!capacityMap.has(id)) {
                capacityMap.set(
                    id,
                    new Map(),
                )
            }

            capacityMap
                .get(id)
                .set(
                    Number(
                        row.day_of_week,
                    ),
                    {
                        scheduled_staff:
                            Number(
                                row.scheduled_staff ||
                                    0,
                            ),

                        client_capacity:
                            Number(
                                row.client_capacity ||
                                    0,
                            ),
                    },
                )
        }

        const specialistMap =
            new Map(
                specialistRows.map(
                    (row) => [
                        String(
                            row.service_id,
                        ),
                        row,
                    ],
                ),
            )

        const limitMap =
            new Map()

        for (const row of limitRows) {
            const id = String(
                row.service_id,
            )

            if (!limitMap.has(id)) {
                limitMap.set(
                    id,
                    new Map(),
                )
            }

            limitMap
                .get(id)
                .set(
                    Number(
                        row.day_of_week,
                    ),

                    Number(
                        row.client_limit,
                    ),
                )
        }

        const response =
            services.map((service) => {
                const id = String(
                    service.service_id,
                )

                const perDay =
                    capacityMap.get(id) ||
                    new Map()

                const configuredLimits =
                    limitMap.get(id) ||
                    new Map()

                const specialists =
                    specialistMap.get(id)

                const capacityByDay =
                    dayNames.map(
                        (
                            day,
                            dayNumber,
                        ) => {
                            const scheduleCapacity =
                                perDay.get(
                                    dayNumber,
                                )
                                    ?.client_capacity ||
                                0

                            const hasOwnerLimit =
                                configuredLimits.has(
                                    dayNumber,
                                )

                            const ownerLimit =
                                hasOwnerLimit
                                    ? configuredLimits.get(
                                          dayNumber,
                                      )
                                    : null

                            return {
                                day,

                                day_number:
                                    dayNumber,

                                scheduled_staff:
                                    perDay.get(
                                        dayNumber,
                                    )
                                        ?.scheduled_staff ||
                                    0,

                                schedule_capacity:
                                    Number(
                                        scheduleCapacity,
                                    ),

                                owner_limit:
                                    ownerLimit,

                                effective_capacity:
                                    hasOwnerLimit
                                        ? Math.min(
                                              Number(
                                                  ownerLimit,
                                              ),

                                              Number(
                                                  scheduleCapacity,
                                              ),
                                          )
                                        : Number(
                                              scheduleCapacity,
                                          ),

                                client_capacity:
                                    Number(
                                        scheduleCapacity,
                                    ),
                            }
                        },
                    )

                return {
                    ...service,

                    duration_minutes:
                        Number(
                            service.duration_minutes ||
                                60,
                        ),

                    qualified_staff_count:
                        Number(
                            specialists
                                ?.qualified_staff_count ||
                                0,
                        ),

                    qualified_staff_names:
                        specialists
                            ?.qualified_staff_names ||
                        "",

                    maximum_daily_clients:
                        Math.max(
                            0,

                            ...capacityByDay.map(
                                (day) =>
                                    day.client_capacity,
                            ),
                        ),

                    capacity_by_day:
                        capacityByDay,
                }
            })

        res.json(response)
    } catch (error) {
        console.error(
            "Unable to load services:",
            error,
        )

        res.status(500).json({
            error:
                "Unable to load services and client limits.",
        })
    }
})

// Owner-only daily limits.
router.put(
    "/:id/client-limits",
    requireOwner,
    async (req, res) => {
        const connection =
            await promiseDb.getConnection()

        try {
            const id = positiveId(
                req.params.id,
            )

            const limits =
                clientLimitsPayload(
                    req.body,
                )

            await connection
                .beginTransaction()

            const [services] =
                await connection.query(
                    `SELECT service_id

                     FROM services

                     WHERE service_id = ?

                     FOR UPDATE`,
                    [id],
                )

            if (!services.length) {
                throw problem(
                    "Service not found.",
                    404,
                )
            }

            for (
                const limit of limits
            ) {
                await connection.query(
                    `INSERT INTO service_daily_limits
                     (
                         service_id,
                         day_of_week,
                         client_limit,
                         updated_by
                     )

                     VALUES (?, ?, ?, ?)

                     ON DUPLICATE KEY UPDATE
                         client_limit =
                             VALUES(
                                 client_limit
                             ),

                         updated_by =
                             VALUES(
                                 updated_by
                             ),

                         updated_at =
                             CURRENT_TIMESTAMP`,
                    [
                        id,
                        limit.dayNumber,
                        limit.clientLimit,
                        req.user.user_id,
                    ],
                )
            }

            await connection.commit()

            res.json({
                message:
                    "Daily client limits updated successfully.",
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

// Add a service.
router.post(
    "/",
    upload.single("image"),
    async (req, res) => {
        try {
            const values =
                servicePayload(
                    req.body,
                )

            const imageUrl =
                req.file
                    ? `/uploads/services/${req.file.filename}`
                    : ""

            const [result] =
                await promiseDb.query(
                    `INSERT INTO services
                     (
                         service,
                         category,
                         price,
                         duration,
                         duration_minutes,
                         status,
                         image_url
                     )

                     VALUES (
                         ?,
                         ?,
                         ?,
                         ?,
                         ?,
                         ?,
                         ?
                     )`,
                    [
                        values.service,
                        values.category,
                        values.price,

                        `${values.durationMinutes} mins`,

                        values.durationMinutes,
                        values.status,
                        imageUrl,
                    ],
                )

            res.status(201).json({
                message:
                    "Service added successfully.",

                id: result.insertId,

                image_url:
                    imageUrl,
            })
        } catch (error) {
            removeUploadedFile(
                req.file,
            )

            res.status(
                error.status || 500,
            ).json({
                error:
                    error.message,
            })
        }
    },
)

// Edit a service.
router.put(
    "/:id",
    upload.single("image"),
    async (req, res) => {
        try {
            const id = positiveId(
                req.params.id,
            )

            const values =
                servicePayload(
                    req.body,
                )

            const oldImageUrl =
                String(
                    req.body
                        .old_image_url ||
                        "",
                )

            const imageUrl =
                req.file
                    ? `/uploads/services/${req.file.filename}`
                    : oldImageUrl

            const [result] =
                await promiseDb.query(
                    `UPDATE services

                     SET
                         service = ?,
                         category = ?,
                         price = ?,
                         duration = ?,
                         duration_minutes = ?,
                         status = ?,
                         image_url = ?

                     WHERE service_id = ?`,
                    [
                        values.service,
                        values.category,
                        values.price,

                        `${values.durationMinutes} mins`,

                        values.durationMinutes,
                        values.status,
                        imageUrl,
                        id,
                    ],
                )

            if (
                !result.affectedRows
            ) {
                throw problem(
                    "Service not found.",
                    404,
                )
            }

            res.json({
                message:
                    "Service updated successfully.",

                image_url:
                    imageUrl,
            })
        } catch (error) {
            removeUploadedFile(
                req.file,
            )

            res.status(
                error.status || 500,
            ).json({
                error:
                    error.message,
            })
        }
    },
)

// Delete a service.
router.delete(
    "/:id",
    async (req, res) => {
        try {
            const id = positiveId(
                req.params.id,
            )

            const [result] =
                await promiseDb.query(
                    `DELETE FROM services

                     WHERE service_id = ?`,
                    [id],
                )

            if (
                !result.affectedRows
            ) {
                throw problem(
                    "Service not found.",
                    404,
                )
            }

            res.json({
                message:
                    "Service deleted successfully.",
            })
        } catch (error) {
            if (
                error.code ===
                "ER_ROW_IS_REFERENCED_2"
            ) {
                return res
                    .status(409)
                    .json({
                        error:
                            "This service has appointment or staff-assignment history and cannot be deleted. Mark it Unavailable instead.",
                    })
            }

            res.status(
                error.status || 500,
            ).json({
                error:
                    error.message,
            })
        }
    },
)

// Upload error handler.
router.use(
    (error, req, res, next) => {
        if (
            error instanceof
            multer.MulterError
        ) {
            return res
                .status(400)
                .json({
                    error:
                        error.code ===
                        "LIMIT_FILE_SIZE"
                            ? "Service photo must not exceed 2 MB."
                            : "Unable to upload the service photo.",
                })
        }

        if (
            error?.message?.startsWith(
                "Service photo",
            )
        ) {
            return res
                .status(400)
                .json({
                    error:
                        error.message,
                })
        }

        next(error)
    },
)

module.exports = router

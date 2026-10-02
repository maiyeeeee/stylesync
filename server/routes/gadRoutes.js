const express = require("express")
const router = express.Router()
const database = require("../db").promise()

// Use recorded information only. Never infer gender.
const genderExpression = `
    CASE
        WHEN c.customer_id IS NULL
            OR TRIM(COALESCE(c.gender, '')) = ''
            THEN 'Not recorded'

        WHEN LOWER(TRIM(c.gender)) = 'female'
            THEN 'Female'

        WHEN LOWER(TRIM(c.gender)) = 'male'
            THEN 'Male'

        WHEN LOWER(TRIM(c.gender)) = 'prefer not to say'
            THEN 'Prefer not to say'

        ELSE 'Other recorded value'
    END
`

const customerTypeExpression = `
    COALESCE(
        NULLIF(TRIM(c.customer_type), ''),
        'Not recorded'
    )
`

const serviceExpression = `
    COALESCE(
        NULLIF(TRIM(s.service), ''),
        NULLIF(TRIM(a.service), ''),
        'Unspecified Service'
    )
`

/*
 * TiDB-friendly customer lookup.
 *
 * Instead of using a correlated subquery for every appointment,
 * create one lookup table containing the most recent customer
 * record for each normalized 10-digit contact number.
 */
const customerJoin = `
    LEFT JOIN (
        SELECT
            customer.customer_id,
            customer.contact_number,
            customer.gender,
            customer.customer_type,
            latest.phone_key
        FROM customers customer

        INNER JOIN (
            SELECT
                RIGHT(
                    REGEXP_REPLACE(
                        COALESCE(contact_number, ''),
                        '[^0-9]',
                        ''
                    ),
                    10
                ) AS phone_key,

                MAX(customer_id) AS latest_customer_id

            FROM customers

            WHERE LENGTH(
                REGEXP_REPLACE(
                    COALESCE(contact_number, ''),
                    '[^0-9]',
                    ''
                )
            ) >= 10

            GROUP BY
                RIGHT(
                    REGEXP_REPLACE(
                        COALESCE(contact_number, ''),
                        '[^0-9]',
                        ''
                    ),
                    10
                )
        ) latest
            ON latest.latest_customer_id =
                customer.customer_id
    ) c
        ON LENGTH(
            REGEXP_REPLACE(
                COALESCE(a.contact_number, ''),
                '[^0-9]',
                ''
            )
        ) >= 10

        AND c.phone_key = RIGHT(
            REGEXP_REPLACE(
                COALESCE(a.contact_number, ''),
                '[^0-9]',
                ''
            ),
            10
        )
`

const serviceJoin = `
    LEFT JOIN services s
        ON s.service_id = a.service_id
`

const preferencesSql = `
    SELECT
        ${genderExpression} AS gender,
        ${customerTypeExpression} AS customer_type,
        ${serviceExpression} AS service,
        COUNT(DISTINCT a.id) AS total_bookings

    FROM appointments a

    ${customerJoin}

    ${serviceJoin}

    GROUP BY
        ${genderExpression},
        ${customerTypeExpression},
        ${serviceExpression}

    ORDER BY
        total_bookings DESC,
        service ASC,
        gender ASC,
        customer_type ASC
`

const genderSummarySql = `
    SELECT
        CASE
            WHEN TRIM(COALESCE(gender, '')) = ''
                THEN 'Not recorded'

            WHEN LOWER(TRIM(gender)) = 'female'
                THEN 'Female'

            WHEN LOWER(TRIM(gender)) = 'male'
                THEN 'Male'

            WHEN LOWER(TRIM(gender)) = 'prefer not to say'
                THEN 'Prefer not to say'

            ELSE 'Other recorded value'
        END AS gender,

        COUNT(DISTINCT customer_id) AS total

    FROM customers

    GROUP BY
        CASE
            WHEN TRIM(COALESCE(gender, '')) = ''
                THEN 'Not recorded'

            WHEN LOWER(TRIM(gender)) = 'female'
                THEN 'Female'

            WHEN LOWER(TRIM(gender)) = 'male'
                THEN 'Male'

            WHEN LOWER(TRIM(gender)) = 'prefer not to say'
                THEN 'Prefer not to say'

            ELSE 'Other recorded value'
        END

    ORDER BY gender ASC
`

const serviceTrendsSql = `
    SELECT
        ${customerTypeExpression} AS customer_type,
        ${serviceExpression} AS service,
        COUNT(DISTINCT a.id) AS total_bookings

    FROM appointments a

    ${customerJoin}

    ${serviceJoin}

    GROUP BY
        ${customerTypeExpression},
        ${serviceExpression}

    ORDER BY
        total_bookings DESC,
        service ASC
`

function sendQuery(sql, countField) {
    return async (req, res) => {
        try {
            const [rows] =
                await database.query(sql)

            res.json(
                rows.map((row) => ({
                    ...row,

                    [countField]:
                        Number(
                            row[countField],
                        ) || 0,
                })),
            )
        } catch (error) {
            /*
             * Keep credentials/data private,
             * but print enough SQL information
             * to diagnose TiDB compatibility.
             */
            console.error(
                "GAD data load failed:",
                {
                    code:
                        error.code ||
                        null,

                    errno:
                        error.errno ||
                        null,

                    sqlState:
                        error.sqlState ||
                        null,

                    sqlMessage:
                        error.sqlMessage ||
                        error.message ||
                        null,
                },
            )

            res.status(500).json({
                error:
                    "Unable to load GAD analytics. Please try again.",
            })
        }
    }
}

router.get("/", (req, res) => {
    res.json({
        message:
            "GAD analytics available.",
    })
})

router.get(
    "/customer-preferences",
    sendQuery(
        preferencesSql,
        "total_bookings",
    ),
)

router.get(
    "/gender-summary",
    sendQuery(
        genderSummarySql,
        "total",
    ),
)

/*
 * Preserve these existing endpoints because
 * AdminGAD currently requests all five.
 */
router.get(
    "/marketing-insights",
    sendQuery(
        preferencesSql,
        "total_bookings",
    ),
)

router.get(
    "/recommendations",
    sendQuery(
        preferencesSql,
        "total_bookings",
    ),
)

router.get(
    "/service-trends",
    sendQuery(
        serviceTrendsSql,
        "total_bookings",
    ),
)

module.exports = router

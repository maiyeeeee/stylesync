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

// Avoid matching blank or incomplete phone numbers.
// Use the latest matching profile to prevent duplicated bookings.
const customerJoin = `
  LEFT JOIN customers c
    ON c.customer_id = (
      SELECT MAX(c2.customer_id)
      FROM customers c2
      WHERE LENGTH(
        REGEXP_REPLACE(
          COALESCE(a.contact_number, ''),
          '[^0-9]',
          ''
        )
      ) >= 10
      AND LENGTH(
        REGEXP_REPLACE(
          COALESCE(c2.contact_number, ''),
          '[^0-9]',
          ''
        )
      ) >= 10
      AND RIGHT(
        REGEXP_REPLACE(c2.contact_number, '[^0-9]', ''),
        10
      ) = RIGHT(
        REGEXP_REPLACE(a.contact_number, '[^0-9]', ''),
        10
      )
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

function sendQuery(sql, countField) {
  return async (req, res) => {
    try {
      const [rows] = await database.query(sql)

      res.json(
        rows.map((row) => ({
          ...row,
          [countField]: Number(row[countField]),
        }))
      )
    } catch (error) {
      console.error(
        "GAD data load failed:",
        error.code || error.name
      )

      res.status(500).json({
        error: "Unable to load GAD analytics. Please try again.",
      })
    }
  }
}

router.get("/", (req, res) => {
  res.json({ message: "GAD analytics available." })
})

router.get(
  "/customer-preferences",
  sendQuery(preferencesSql, "total_bookings")
)

router.get(
  "/gender-summary",
  sendQuery(
    `
    SELECT
      ${genderExpression} AS gender,
      COUNT(DISTINCT c.customer_id) AS total
    FROM customers c
    GROUP BY ${genderExpression}
    ORDER BY gender ASC
    `,
    "total"
  )
)

// Preserve existing endpoints for compatibility.
router.get(
  "/marketing-insights",
  sendQuery(preferencesSql, "total_bookings")
)

router.get(
  "/recommendations",
  sendQuery(preferencesSql, "total_bookings")
)

router.get(
  "/service-trends",
  sendQuery(
    `
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
    ORDER BY total_bookings DESC, service ASC
    `,
    "total_bookings"
  )
)

module.exports = router
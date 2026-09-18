const express = require("express")
const router = express.Router()
const database = require("../db").promise()

router.get("/", async (req, res) => {
    let connection
    let originalTimezone

    try {
        connection = await database.getConnection()

        const [[timezone]] = await connection.query("SELECT @@session.time_zone AS timezone")

        originalTimezone = timezone.timezone

        await connection.query("SET time_zone = '+08:00'")

        const [lowStockItems] = await connection.query(`
      SELECT id, name, stock, alertLevel
      FROM inventory
      WHERE stock <= alertLevel
      ORDER BY stock ASC, name ASC
    `)

        const eligibleAppointments = `
      a.appointment_date >=
        DATE_SUB(CURDATE(), INTERVAL 29 DAY)
      AND a.appointment_date <= CURDATE()
      AND a.status IN (
        'Pending',
        'Pending Validation',
        'Approved',
        'Completed'
      )
      AND (
        NOT EXISTS (
          SELECT 1
          FROM booking_deposits bd
          WHERE bd.appointment_id = a.id
        )
        OR EXISTS (
          SELECT 1
          FROM booking_deposits bd
          WHERE bd.appointment_id = a.id
            AND bd.payment_status IN (
              'Awaiting Verification',
              'Verified'
            )
        )
      )
    `

        const [serviceRows] = await connection.query(`
      SELECT a.service, COUNT(*) AS total
      FROM appointments a
      WHERE ${eligibleAppointments}
      GROUP BY a.service
      ORDER BY total DESC, a.service ASC
    `)

        const [dayRows] = await connection.query(`
      SELECT
        DAYOFWEEK(a.appointment_date) AS dayNumber,
        COUNT(*) AS total
      FROM appointments a
      WHERE ${eligibleAppointments}
      GROUP BY DAYOFWEEK(a.appointment_date)
      ORDER BY total DESC, dayNumber ASC
    `)

        const recommendations = lowStockItems.map((item) => ({
            title: `Restock ${item.name}`,
            description:
                `Current stock: ${item.stock}. ` +
                `Reorder level: ${item.alertLevel}. ` +
                "Stock is at or below the configured level. " +
                "Review usage and arrange replenishment.",
            priority: "High",
            rule: "Current stock ≤ reorder level",
            path: "/admin/inventory",
        }))

        if (serviceRows.length) {
            const maximum = Number(serviceRows[0].total)

            const leaders = serviceRows.filter((item) => Number(item.total) === maximum)

            recommendations.push({
                title: "Review supplies for leading services",
                description:
                    `${leaders.map((item) => item.service).join(", ")} ` +
                    `recorded ${maximum} appointment request(s) each ` +
                    "in the last 30 days, including today. " +
                    "Check that the necessary supplies are available. " +
                    "Cancelled and declined requests are excluded.",
                priority: "Medium",
                rule: "Highest recorded service request count",
                path: "/admin/services",
            })
        }

        const dayNames = [
            "",
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
        ]

        let peakDays = "N/A"

        if (dayRows.length) {
            const maximum = Number(dayRows[0].total)

            const leaders = dayRows.filter((item) => Number(item.total) === maximum)

            peakDays = leaders.map((item) => dayNames[Number(item.dayNumber)]).join(", ")

            recommendations.push({
                title: "Review staffing on historically busy days",
                description:
                    `${peakDays} recorded the highest appointment ` +
                    `count in the last 30 days: ${maximum} each. ` +
                    "Review staff allocation against existing bookings. " +
                    "These are recorded totals, not predictions.",
                priority: "Medium",
                rule: "Highest recorded appointment count by weekday",
                path: "/admin/staff",
            })
        }

        res.json({
            criticalAlerts: lowStockItems.length,
            businessSuggestions: recommendations.filter((item) => item.priority !== "High").length,
            peakDays,
            recommendations,
            period: "Last 30 days, including today",
        })
    } catch (error) {
        console.error("Recommendations load failed:", error.code || error.name)

        res.status(500).json({
            error: "Unable to load recommendations. Please try again.",
        })
    } finally {
        if (connection) {
            try {
                if (originalTimezone !== undefined) {
                    await connection.query("SET time_zone = ?", [originalTimezone])
                }

                connection.release()
            } catch {
                connection.destroy()
            }
        }
    }
})

module.exports = router

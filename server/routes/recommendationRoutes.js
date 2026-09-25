const express = require("express")
const router = express.Router()
const database = require("../db").promise()

router.get("/", async (req, res) => {
    let connection
    let originalTimezone

    try {
        connection = await database.getConnection()

        const [[timezone]] = await connection.query(
            "SELECT @@session.time_zone AS timezone",
        )
        originalTimezone = timezone.timezone
        await connection.query("SET time_zone = '+08:00'")

        const [[periodRow]] = await connection.query(`
            SELECT
                DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 29 DAY), '%Y-%m-%d') AS startDate,
                DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS endDate
        `)

        const [lowStockItems] = await connection.query(`
            SELECT
                id,
                name,
                category,
                stock,
                alertLevel,
                CASE WHEN stock = 0 THEN 'Out of Stock' ELSE 'Low Stock' END AS stockStatus,
                GREATEST((alertLevel + 1) - stock, 1) AS minimumRestock
            FROM inventory
            WHERE stock <= alertLevel
            ORDER BY stock ASC, name ASC
        `)

        const eligibleAppointments = `
            a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
            AND a.appointment_date <= CURDATE()
            AND a.status IN ('Pending', 'Pending Validation', 'Approved', 'Completed')
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
                      AND bd.payment_status IN ('Awaiting Verification', 'Verified')
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

        const [[appointmentTotals]] = await connection.query(`
            SELECT COUNT(*) AS total
            FROM appointments a
            WHERE ${eligibleAppointments}
        `)

        const period = `${periodRow.startDate} to ${periodRow.endDate}`
        const appointmentsReviewed = Number(appointmentTotals.total || 0)
        const recommendations = lowStockItems.map((item) => {
            const stock = Number(item.stock)
            const alertLevel = Number(item.alertLevel)
            const minimumRestock = Number(item.minimumRestock)
            const outOfStock = stock === 0

            return {
                ruleId: outOfStock ? "INV-OUT-001" : "INV-LOW-001",
                category: "Inventory",
                title: outOfStock ? `${item.name} is out of stock` : `Restock ${item.name}`,
                description: `${item.name} triggered an inventory restocking rule.`,
                priority: outOfStock ? "High" : "Medium",
                rule: outOfStock
                    ? "IF current stock = 0, THEN flag the product as out of stock."
                    : "IF current stock ≤ the configured reorder level, THEN recommend restocking.",
                evidence:
                    `${item.name}: current stock = ${stock} unit(s); ` +
                    `reorder level = ${alertLevel} unit(s); ` +
                    `status = ${item.stockStatus}.`,
                action:
                    `Restock at least ${minimumRestock} unit(s) to reach ` +
                    `${alertLevel + 1} unit(s), which is above the current reorder level.`,
                dataPeriod: "Current inventory balance",
                path: "/admin/inventory",
            }
        })

        if (serviceRows.length) {
            const maximum = Number(serviceRows[0].total)
            const leaders = serviceRows.filter((item) => Number(item.total) === maximum)
            const names = leaders.map((item) => item.service).join(", ")

            recommendations.push({
                ruleId: "SVC-DEMAND-001",
                category: "Service demand",
                title: "Review supplies for the most requested service",
                description: `${names} recorded the highest eligible appointment count.`,
                priority: "Medium",
                rule:
                    "IF a service has the highest eligible appointment count in the last 30 days, THEN recommend reviewing its supplies and readiness.",
                evidence:
                    `${names}: ${maximum} request(s) each out of ` +
                    `${appointmentsReviewed} eligible appointment(s). ` +
                    "Cancelled, declined, expired, and unpaid booking holds are excluded.",
                action:
                    `Check the supplies, service availability, and assigned specialists for ${names}.`,
                dataPeriod: period,
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
                ruleId: "STAFF-PEAK-001",
                category: "Staffing",
                title: "Review staffing on the busiest recorded day",
                description: `${peakDays} recorded the highest eligible appointment count.`,
                priority: "Medium",
                rule:
                    "IF a weekday has the highest eligible appointment count in the last 30 days, THEN recommend reviewing staff allocation for that day.",
                evidence:
                    `${peakDays}: ${maximum} appointment(s) each out of ` +
                    `${appointmentsReviewed} eligible appointment(s). ` +
                    "This is a historical count, not a prediction.",
                action:
                    `Compare the existing ${peakDays} staff schedule with approved bookings and qualified-service assignments.`,
                dataPeriod: period,
                path: "/admin/staff",
            })
        }

        res.json({
            method: "Deterministic rule-based decision support",
            generatedAt: new Date().toISOString(),
            criticalAlerts: lowStockItems.length,
            businessSuggestions: recommendations.filter(
                (item) => item.category !== "Inventory",
            ).length,
            appointmentsReviewed,
            peakDays,
            recommendations,
            period: `Last 30 days (${period}), including today`,
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

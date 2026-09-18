const express = require("express")
const router = express.Router()
const db = require("../db")

router.get("/", (req, res) => {
    const forecast = {}

    const nextWeekBookingsSql = `
    SELECT COUNT(*) / 4 AS expectedBookingsNextWeek
    FROM appointments
    WHERE appointment_date >= DATE_SUB(CURDATE(), INTERVAL 28 DAY)
  `

    const nextMonthBookingsSql = `
    SELECT COUNT(*) AS totalBookings
    FROM appointments
    WHERE appointment_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  `

    const predictedRevenueSql = `
    SELECT IFNULL(SUM(amount), 0) / 30 AS averageDailyRevenue
    FROM transactions
    WHERE transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  `

    const seasonalTrendSql = `
    SELECT MONTHNAME(appointment_date) AS month, COUNT(*) AS bookings
    FROM appointments
    GROUP BY MONTH(appointment_date), MONTHNAME(appointment_date)
    ORDER BY bookings DESC
    LIMIT 1
  `

    const peakDaysSql = `
    SELECT DAYNAME(appointment_date) AS day, COUNT(*) AS total
    FROM appointments
    GROUP BY DAYNAME(appointment_date)
    ORDER BY total DESC
    LIMIT 2
  `

    const lowStockSql = `
    SELECT name, stock, alertLevel
    FROM inventory
    WHERE stock <= alertLevel
    LIMIT 5
  `

    const mostRequestedServiceSql = `
    SELECT service, COUNT(*) AS total
    FROM transactions
    GROUP BY service
    ORDER BY total DESC
    LIMIT 1
  `

    db.query(nextWeekBookingsSql, (err, weekResult) => {
        if (err) return res.status(500).json({ error: err.message })

        forecast.expectedBookingsNextWeek = Math.round(
            Number(weekResult[0].expectedBookingsNextWeek || 0),
        )

        db.query(nextMonthBookingsSql, (err, monthResult) => {
            if (err) return res.status(500).json({ error: err.message })

            forecast.expectedBookingsNextMonth = Math.round(
                Number(monthResult[0].totalBookings || 0),
            )

            db.query(predictedRevenueSql, (err, revenueResult) => {
                if (err) return res.status(500).json({ error: err.message })

                const averageDailyRevenue = Number(revenueResult[0].averageDailyRevenue || 0)

                forecast.predictedRevenueNextWeek = averageDailyRevenue * 7
                forecast.predictedRevenueNextMonth = averageDailyRevenue * 30

                db.query(seasonalTrendSql, (err, seasonalResult) => {
                    if (err) return res.status(500).json({ error: err.message })

                    forecast.seasonalTrend =
                        seasonalResult.length > 0
                            ? `${seasonalResult[0].month} has the highest bookings.`
                            : "No seasonal trend available yet."

                    db.query(peakDaysSql, (err, peakResult) => {
                        if (err) return res.status(500).json({ error: err.message })

                        forecast.peakDays =
                            peakResult.length > 0
                                ? peakResult.map((item) => item.day).join(" & ")
                                : "N/A"

                        db.query(lowStockSql, (err, lowStockItems) => {
                            if (err) return res.status(500).json({ error: err.message })

                            forecast.lowStockItems = lowStockItems || []

                            db.query(mostRequestedServiceSql, (err, serviceResult) => {
                                if (err) return res.status(500).json({ error: err.message })

                                forecast.mostRequestedService =
                                    serviceResult.length > 0 ? serviceResult[0].service : "N/A"

                                const recommendations = []

                                if (forecast.expectedBookingsNextWeek >= 20) {
                                    recommendations.push(
                                        "High bookings are expected next week. Assign additional staff to handle customer volume.",
                                    )
                                } else if (forecast.expectedBookingsNextWeek >= 10) {
                                    recommendations.push(
                                        "Moderate bookings are expected next week. Maintain regular staffing and monitor schedule capacity.",
                                    )
                                } else {
                                    recommendations.push(
                                        "Low bookings are expected next week. Offer promotional packages to attract more customers.",
                                    )
                                }

                                if (forecast.predictedRevenueNextMonth >= 50000) {
                                    recommendations.push(
                                        "Revenue is expected to be high next month. Prepare additional supplies and inventory.",
                                    )
                                } else if (forecast.predictedRevenueNextMonth >= 20000) {
                                    recommendations.push(
                                        "Revenue is expected to remain stable. Continue current service and sales strategy.",
                                    )
                                } else {
                                    recommendations.push(
                                        "Revenue forecast is low. Launch marketing campaigns, discounts, or service bundles.",
                                    )
                                }

                                if (forecast.lowStockItems.length > 0) {
                                    const lowStockNames = forecast.lowStockItems
                                        .map((item) => item.name)
                                        .join(", ")

                                    recommendations.push(
                                        `Restock low inventory items before peak days: ${lowStockNames}.`,
                                    )
                                }

                                if (forecast.mostRequestedService !== "N/A") {
                                    recommendations.push(
                                        `Promote or bundle ${forecast.mostRequestedService}, since it is the most requested service.`,
                                    )
                                }

                                if (forecast.seasonalTrend !== "No seasonal trend available yet.") {
                                    recommendations.push(
                                        `Prepare staffing and inventory because ${forecast.seasonalTrend}`,
                                    )
                                }

                                if (forecast.peakDays !== "N/A") {
                                    recommendations.push(
                                        `Prepare additional staff and inventory every ${forecast.peakDays}.`,
                                    )
                                }

                                forecast.recommendation = recommendations

                                res.json(forecast)
                            })
                        })
                    })
                })
            })
        })
    })
})

module.exports = router

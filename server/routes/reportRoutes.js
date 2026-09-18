const express = require("express")
const router = express.Router()
const db = require("../db")

const promiseDb = db.promise()

const periods = {
    daily: {
        label: "Today",
        start: "CURDATE()",
        end: "DATE_ADD(CURDATE(), INTERVAL 1 DAY)",
    },

    weekly: {
        label: "This Week",
        start: "DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)",
        end: "DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 7 DAY)",
    },

    monthly: {
        label: "This Month",
        start: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
        end: "DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)",
    },
}

router.get("/", async (req, res) => {
    const periodKey = Object.hasOwn(periods, req.query.period) ? req.query.period : "weekly"

    const period = periods[periodKey]
    let connection

    try {
        connection = await promiseDb.getConnection()

        // All report dates and times follow Philippine time.
        await connection.query("SET time_zone = '+08:00'")

        const activeAppointment = `
      status NOT IN (
        'Declined',
        'Cancelled',
        'Rejected',
        'Awaiting Payment'
      )
    `

        const [
            [salesRows],
            [appointmentRows],
            [salesTrend],
            [appointmentStatus],
            [mostRequestedServices],
            [summary],
        ] = await Promise.all([
            connection.query(`
        SELECT
          COALESCE(SUM(amount), 0) AS sales,
          COUNT(*) AS transactions,
          COALESCE(AVG(amount), 0) AS averageSale
        FROM transactions
        WHERE status = 'Paid'
          AND transaction_date >= ${period.start}
          AND transaction_date < ${period.end}
      `),

            connection.query(`
        SELECT COUNT(*) AS appointments
        FROM appointments
        WHERE ${activeAppointment}
          AND appointment_date >= DATE(${period.start})
          AND appointment_date < DATE(${period.end})
      `),

            connection.query(`
        SELECT
          DATE_FORMAT(days.report_date, '%Y-%m-%d') AS date,
          COALESCE(SUM(t.amount), 0) AS sales
        FROM (
          SELECT CURDATE() - INTERVAL 6 DAY AS report_date

          UNION ALL

          SELECT CURDATE() - INTERVAL 5 DAY

          UNION ALL

          SELECT CURDATE() - INTERVAL 4 DAY

          UNION ALL

          SELECT CURDATE() - INTERVAL 3 DAY

          UNION ALL

          SELECT CURDATE() - INTERVAL 2 DAY

          UNION ALL

          SELECT CURDATE() - INTERVAL 1 DAY

          UNION ALL

          SELECT CURDATE()
        ) days
        LEFT JOIN transactions t
          ON DATE(t.transaction_date) = days.report_date
         AND t.status = 'Paid'
        GROUP BY days.report_date
        ORDER BY days.report_date
      `),

            connection.query(`
        SELECT
          status,
          COUNT(*) AS count
        FROM appointments
        WHERE appointment_date >= DATE(${period.start})
          AND appointment_date < DATE(${period.end})
          AND status <> 'Awaiting Payment'
        GROUP BY status
        ORDER BY count DESC, status
      `),

            connection.query(`
        SELECT
          service,
          COUNT(*) AS count
        FROM appointments
        WHERE ${activeAppointment}
          AND appointment_date >= DATE(${period.start})
          AND appointment_date < DATE(${period.end})
        GROUP BY service
        ORDER BY count DESC, service
        LIMIT 5
      `),

            connection.query(`
        SELECT
          DATE_FORMAT(d.report_date, '%Y-%m-%d') AS date,
          COALESCE(s.sales, 0) AS sales,
          COALESCE(s.transactions, 0) AS transactions,
          COALESCE(a.appointments, 0) AS appointments,
          COALESCE(a.topService, 'N/A') AS topService
        FROM (
          SELECT DATE(transaction_date) AS report_date
          FROM transactions
          WHERE status = 'Paid'
            AND transaction_date >= ${period.start}
            AND transaction_date < ${period.end}

          UNION

          SELECT appointment_date
          FROM appointments
          WHERE ${activeAppointment}
            AND appointment_date >= DATE(${period.start})
            AND appointment_date < DATE(${period.end})
        ) d

        LEFT JOIN (
          SELECT
            DATE(transaction_date) AS report_date,
            SUM(amount) AS sales,
            COUNT(*) AS transactions
          FROM transactions
          WHERE status = 'Paid'
            AND transaction_date >= ${period.start}
            AND transaction_date < ${period.end}
          GROUP BY DATE(transaction_date)
        ) s
          ON s.report_date = d.report_date

        LEFT JOIN (
          SELECT
            appointment_date AS report_date,
            COUNT(*) AS appointments,
            (
              SELECT a2.service
              FROM appointments a2
              WHERE
                a2.appointment_date =
                  appointments.appointment_date
                AND a2.status NOT IN (
                  'Declined',
                  'Cancelled',
                  'Rejected',
                  'Awaiting Payment'
                )
              GROUP BY a2.service
              ORDER BY COUNT(*) DESC, a2.service
              LIMIT 1
            ) AS topService
          FROM appointments
          WHERE ${activeAppointment}
            AND appointment_date >= DATE(${period.start})
            AND appointment_date < DATE(${period.end})
          GROUP BY appointment_date
        ) a
          ON a.report_date = d.report_date

        ORDER BY d.report_date DESC
      `),
        ])

        res.json({
            period: periodKey,
            periodLabel: period.label,

            sales: Number(salesRows[0]?.sales || 0),
            transactions: Number(salesRows[0]?.transactions || 0),
            averageSale: Number(salesRows[0]?.averageSale || 0),
            appointments: Number(appointmentRows[0]?.appointments || 0),

            salesTrend,
            appointmentStatus,
            mostRequestedServices,
            summary,
        })
    } catch (error) {
        console.error("Reports error:", error)

        res.status(500).json({
            error: "Unable to generate reports.",
        })
    } finally {
        connection?.release()
    }
})

module.exports = router

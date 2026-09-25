const express = require("express")
const router = express.Router()
const db = require("../db")

const promiseDb = db.promise()
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONTH_PATTERN = /^\d{4}-\d{2}$/

function manilaToday() {
  const manilaNow = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return manilaNow.toISOString().slice(0, 10)
}

function isValidDate(value) {
  if (!DATE_PATTERN.test(String(value || ""))) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isValidMonth(value) {
  if (!MONTH_PATTERN.test(String(value || ""))) return false
  return isValidDate(`${value}-01`)
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function addMonths(value, months) {
  const [year, month] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1 + months, 1))
  return date.toISOString().slice(0, 7)
}

function mondayOf(value) {
  const date = new Date(`${value}T00:00:00Z`)
  const day = date.getUTCDay()
  return addDays(value, -(day === 0 ? 6 : day - 1))
}

function displayDate(value, options) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    ...options,
  }).format(new Date(`${value}T00:00:00Z`))
}

function resolvePeriod(query) {
  const period = ["daily", "weekly", "monthly"].includes(query.period)
    ? query.period
    : "weekly"
  const today = manilaToday()

  if (period === "daily") {
    const startDate = isValidDate(query.date) ? query.date : today
    return {
      period,
      startDate,
      endDate: addDays(startDate, 1),
      selectedDate: startDate,
      selectedWeek: mondayOf(startDate),
      selectedMonth: startDate.slice(0, 7),
      label:
        startDate === today
          ? "Today"
          : displayDate(startDate, {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
    }
  }

  if (period === "monthly") {
    const selectedMonth = isValidMonth(query.month)
      ? query.month
      : today.slice(0, 7)
    const startDate = `${selectedMonth}-01`
    return {
      period,
      startDate,
      endDate: `${addMonths(selectedMonth, 1)}-01`,
      selectedDate: today,
      selectedWeek: mondayOf(today),
      selectedMonth,
      label: displayDate(startDate, { month: "long", year: "numeric" }),
    }
  }

  const anchor = isValidDate(query.week) ? query.week : today
  const startDate = mondayOf(anchor)
  const lastDate = addDays(startDate, 6)
  return {
    period,
    startDate,
    endDate: addDays(startDate, 7),
    selectedDate: today,
    selectedWeek: startDate,
    selectedMonth: startDate.slice(0, 7),
    label: `${displayDate(startDate, {
      month: "short",
      day: "numeric",
    })}–${displayDate(lastDate, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`,
  }
}

router.get("/", async (req, res) => {
  const selected = resolvePeriod(req.query)
  const { startDate, endDate } = selected
  let connection

  try {
    connection = await promiseDb.getConnection()
    await connection.query("SET time_zone = '+08:00'")

    const activeAppointment = `
      status NOT IN ('Declined', 'Cancelled', 'Rejected', 'Awaiting Payment')
    `

    const [overviewRows] = await connection.query(`
      SELECT
        COALESCE(SUM(CASE
          WHEN transaction_date >= CURDATE()
           AND transaction_date < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
          THEN amount ELSE 0 END), 0) AS todaySales,
        COALESCE(SUM(CASE
          WHEN transaction_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
           AND transaction_date < DATE_ADD(
             DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY),
             INTERVAL 7 DAY
           )
          THEN amount ELSE 0 END), 0) AS weekSales,
        COALESCE(SUM(CASE
          WHEN transaction_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
           AND transaction_date < DATE_ADD(
             DATE_FORMAT(CURDATE(), '%Y-%m-01'),
             INTERVAL 1 MONTH
           )
          THEN amount ELSE 0 END), 0) AS monthSales
      FROM transactions
      WHERE status = 'Paid'
    `)

    const [salesRows] = await connection.query(
      `SELECT
         COALESCE(SUM(amount), 0) AS sales,
         COUNT(*) AS transactions,
         COALESCE(AVG(amount), 0) AS averageSale
       FROM transactions
       WHERE status = 'Paid'
         AND transaction_date >= ?
         AND transaction_date < ?`,
      [startDate, endDate],
    )

    const [appointmentRows] = await connection.query(
      `SELECT COUNT(*) AS appointments
       FROM appointments
       WHERE ${activeAppointment}
         AND appointment_date >= ?
         AND appointment_date < ?`,
      [startDate, endDate],
    )

    const [summary] = await connection.query(
      `WITH RECURSIVE days AS (
         SELECT DATE(?) AS report_date
         UNION ALL
         SELECT DATE_ADD(report_date, INTERVAL 1 DAY)
         FROM days
         WHERE report_date < DATE_SUB(DATE(?), INTERVAL 1 DAY)
       )
       SELECT
         DATE_FORMAT(days.report_date, '%Y-%m-%d') AS date,
         COALESCE(s.sales, 0) AS sales,
         COALESCE(s.transactions, 0) AS transactions,
         COALESCE(a.appointments, 0) AS appointments,
         COALESCE((
           SELECT a2.service
           FROM appointments a2
           WHERE a2.appointment_date = days.report_date
             AND a2.status NOT IN (
               'Declined', 'Cancelled', 'Rejected', 'Awaiting Payment'
             )
           GROUP BY a2.service
           ORDER BY COUNT(*) DESC, a2.service
           LIMIT 1
         ), 'N/A') AS topService
       FROM days
       LEFT JOIN (
         SELECT DATE(transaction_date) AS report_date,
                SUM(amount) AS sales,
                COUNT(*) AS transactions
         FROM transactions
         WHERE status = 'Paid'
           AND transaction_date >= ?
           AND transaction_date < ?
         GROUP BY DATE(transaction_date)
       ) s ON s.report_date = days.report_date
       LEFT JOIN (
         SELECT appointment_date AS report_date,
                COUNT(*) AS appointments
         FROM appointments
         WHERE ${activeAppointment}
           AND appointment_date >= ?
           AND appointment_date < ?
         GROUP BY appointment_date
       ) a ON a.report_date = days.report_date
       ORDER BY days.report_date`,
      [startDate, endDate, startDate, endDate, startDate, endDate],
    )

    const [appointmentStatus] = await connection.query(
      `SELECT status, COUNT(*) AS count
       FROM appointments
       WHERE appointment_date >= ?
         AND appointment_date < ?
         AND status <> 'Awaiting Payment'
       GROUP BY status
       ORDER BY count DESC, status`,
      [startDate, endDate],
    )

    const [mostRequestedServices] = await connection.query(
      `SELECT service, COUNT(*) AS count
       FROM appointments
       WHERE ${activeAppointment}
         AND appointment_date >= ?
         AND appointment_date < ?
       GROUP BY service
       ORDER BY count DESC, service
       LIMIT 5`,
      [startDate, endDate],
    )

    const todaySales = Number(overviewRows[0]?.todaySales || 0)
    const weekSales = Number(overviewRows[0]?.weekSales || 0)
    const monthSales = Number(overviewRows[0]?.monthSales || 0)

    res.json({
      period: selected.period,
      periodLabel: selected.label,
      periodStart: startDate,
      periodEnd: addDays(endDate, -1),
      selectedDate: selected.selectedDate,
      selectedWeek: selected.selectedWeek,
      selectedMonth: selected.selectedMonth,

      sales: Number(salesRows[0]?.sales || 0),
      transactions: Number(salesRows[0]?.transactions || 0),
      averageSale: Number(salesRows[0]?.averageSale || 0),
      appointments: Number(appointmentRows[0]?.appointments || 0),

      todaySales,
      weekSales,
      monthSales,
      dailySales: todaySales,
      weeklySales: weekSales,
      monthlySales: monthSales,

      salesTrend: summary.map((row) => ({
        date: row.date,
        sales: Number(row.sales || 0),
      })),
      appointmentStatus: appointmentStatus.map((row) => ({
        ...row,
        count: Number(row.count || 0),
      })),
      mostRequestedServices: mostRequestedServices.map((row) => ({
        ...row,
        count: Number(row.count || 0),
      })),
      summary: summary
        .slice()
        .reverse()
        .map((row) => ({
          ...row,
          sales: Number(row.sales || 0),
          transactions: Number(row.transactions || 0),
          appointments: Number(row.appointments || 0),
        })),
    })
  } catch (error) {
    console.error("Reports error:", error)
    res.status(500).json({ error: "Unable to generate reports." })
  } finally {
    connection?.release()
  }
})

module.exports = router

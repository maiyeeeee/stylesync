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

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  )
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
    const startDate = isValidDate(query.date)
      ? query.date
      : today

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
      label: displayDate(startDate, {
        month: "long",
        year: "numeric",
      }),
    }
  }

  const anchor = isValidDate(query.week)
    ? query.week
    : today

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
      status NOT IN (
        'Declined',
        'Cancelled',
        'Rejected',
        'Awaiting Payment'
      )
    `

    // ====================================
    // SALES OVERVIEW
    // ====================================

    const [overviewRows] = await connection.query(`
      SELECT
        COALESCE(SUM(CASE
          WHEN transaction_date >= CURDATE()
           AND transaction_date < DATE_ADD(
             CURDATE(),
             INTERVAL 1 DAY
           )
          THEN amount ELSE 0 END), 0) AS todaySales,

        COALESCE(SUM(CASE
          WHEN transaction_date >= DATE_SUB(
            CURDATE(),
            INTERVAL WEEKDAY(CURDATE()) DAY
          )
           AND transaction_date < DATE_ADD(
             DATE_SUB(
               CURDATE(),
               INTERVAL WEEKDAY(CURDATE()) DAY
             ),
             INTERVAL 7 DAY
           )
          THEN amount ELSE 0 END), 0) AS weekSales,

        COALESCE(SUM(CASE
          WHEN transaction_date >= DATE_FORMAT(
            CURDATE(),
            '%Y-%m-01'
          )
           AND transaction_date < DATE_ADD(
             DATE_FORMAT(CURDATE(), '%Y-%m-01'),
             INTERVAL 1 MONTH
           )
          THEN amount ELSE 0 END), 0) AS monthSales

      FROM transactions
      WHERE status = 'Paid'
    `)

    // ====================================
    // SALES FOR SELECTED PERIOD
    // ====================================

    const [salesRows] = await connection.query(
      `SELECT
         COALESCE(SUM(amount), 0) AS sales,
         COUNT(*) AS transactions,
         COALESCE(AVG(amount), 0) AS averageSale
       FROM transactions
       WHERE status = 'Paid'
         AND transaction_date >= ?
         AND transaction_date < ?`,
      [startDate, endDate]
    )

    // ====================================
    // SALES CATEGORY ANALYTICS (READ-ONLY)
    // ====================================
    // Amount is the final sale price (including any discount).
    // Deposits are already part of that price; never subtract again.
    // Product rows are excluded from service rankings.

    const [salesByTypeRows] = await connection.query(
      `SELECT COALESCE(sale_type, 'Service') AS saleType,
              COUNT(*) AS transactions,
              COALESCE(SUM(amount), 0) AS revenue
       FROM transactions
       WHERE status = 'Paid'
         AND transaction_date >= ? AND transaction_date < ?
       GROUP BY COALESCE(sale_type, 'Service')
       ORDER BY revenue DESC`,
      [startDate, endDate]
    )

    const [paymentBreakdownRows] = await connection.query(
      `SELECT COALESCE(NULLIF(TRIM(payment), ''), 'Not recorded') AS paymentMethod,
              COUNT(*) AS transactions,
              COALESCE(SUM(amount), 0) AS revenue
       FROM transactions
       WHERE status = 'Paid'
         AND transaction_date >= ? AND transaction_date < ?
       GROUP BY COALESCE(NULLIF(TRIM(payment), ''), 'Not recorded')
       ORDER BY revenue DESC`,
      [startDate, endDate]
    )

    // Actual payment collections, separated from sale revenue.
    // Deposits are recorded on their verification date.
    // Checkout payments exclude any deposit already applied.
    const [paymentCollectionRows] = await connection.query(
      `SELECT
         paymentMethod,
         ROUND(SUM(collected), 2) AS collected,
         SUM(paymentEvents) AS paymentEvents
       FROM (
         -- POS balance collected at checkout
         SELECT
           COALESCE(NULLIF(TRIM(t.payment), ''), 'Not recorded')
             AS paymentMethod,
           GREATEST(
             t.amount - COALESCE(bda.amount_applied, 0),
             0
           ) AS collected,
           1 AS paymentEvents
         FROM transactions t
         LEFT JOIN booking_deposit_applications bda
           ON bda.transaction_id = t.transaction_id
         WHERE t.status = 'Paid'
           AND t.transaction_date >= ?
           AND t.transaction_date < ?

         UNION ALL

         -- Verified booking deposits (including unredeemed deposits)
         SELECT
           COALESCE(NULLIF(TRIM(bd.payment_method), ''), 'Not recorded')
             AS paymentMethod,
           COALESCE(bd.verified_amount, 0) AS collected,
           1 AS paymentEvents
         FROM booking_deposits bd
         WHERE bd.payment_status = 'Verified'
           AND bd.verified_at >= ?
           AND bd.verified_at < ?
       ) collection_rows
       GROUP BY paymentMethod
       ORDER BY collected DESC`,
      [startDate, endDate, startDate, endDate]
    );

    const [topSellingServiceRows] = await connection.query(
      `SELECT service, SUM(transactions) AS transactions,
              SUM(quantity) AS quantity, SUM(revenue) AS revenue
       FROM (
         SELECT COALESCE(NULLIF(TRIM(service), ''), 'Unspecified service') AS service,
                COUNT(*) AS transactions, SUM(COALESCE(quantity, 1)) AS quantity,
                SUM(amount) AS revenue
         FROM transactions
         WHERE status = 'Paid' AND (sale_type = 'Service' OR sale_type IS NULL)
           AND transaction_date >= ? AND transaction_date < ?
         GROUP BY service
         UNION ALL
         SELECT ti.item_name AS service,
       COUNT(*) AS transactions,
       SUM(ti.quantity) AS quantity,
       SUM(COALESCE(ti.final_line_total, ti.line_total)) AS revenue
         FROM transaction_items ti
         JOIN transactions t
         ON t.transaction_id = ti.transaction_id
         WHERE t.status = 'Paid' AND t.sale_type = 'Mixed' AND ti.item_type = 'Service'
           AND t.transaction_date >= ? AND t.transaction_date < ?
         GROUP BY ti.item_name
       ) service_rows GROUP BY service
       ORDER BY revenue DESC, transactions DESC, service ASC LIMIT 10`,
      [startDate, endDate, startDate, endDate]
    )

    const daysInPeriod = Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000
    )
    const previousStartDate = addDays(startDate, -daysInPeriod)
    const [[previousPeriodRows]] = await connection.query(
      `SELECT COALESCE(SUM(amount), 0) AS sales,
              COUNT(*) AS transactions
       FROM transactions
       WHERE status = 'Paid'
         AND transaction_date >= ? AND transaction_date < ?`,
      [previousStartDate, startDate]
    )

    const salesAnalytics = {
      previousPeriod: {
        startDate: previousStartDate,
        endDate: addDays(startDate, -1),
        sales: Number(previousPeriodRows?.sales || 0),
        transactions: Number(previousPeriodRows?.transactions || 0),
      },
      salesByType: salesByTypeRows.map((row) => ({
        saleType: row.saleType,
        transactions: Number(row.transactions || 0),
        revenue: Number(row.revenue || 0),
      })),
      paymentBreakdown: paymentBreakdownRows.map((row) => ({
        paymentMethod: row.paymentMethod,
        transactions: Number(row.transactions || 0),
        revenue: Number(row.revenue || 0),
      })),

paymentCollections: paymentCollectionRows.map((row) => ({
  paymentMethod: row.paymentMethod,
  paymentEvents: Number(row.paymentEvents || 0),
  collected: Number(row.collected || 0),
})),

      topSellingServices: topSellingServiceRows.map((row) => ({
        service: row.service,
        transactions: Number(row.transactions || 0),
        quantity: Number(row.quantity || 0),
        revenue: Number(row.revenue || 0),
      })),
    }

    // ====================================
    // PROMOTION & LOYALTY DISCOUNT ANALYTICS
    // ====================================
    // Read-only: only completed Paid POS transactions are counted.
    // Transaction amount already reflects the applied discount;
    // verified booking deposits are NOT subtracted again.
    // Promotions and loyalty rewards are mutually exclusive per sale.

    const [discountRows] = await connection.query(
      `SELECT
         COALESCE(SUM(CASE WHEN discount_type = 'promotion' THEN 1 ELSE 0 END), 0) AS promotionTransactions,
         COALESCE(SUM(CASE WHEN discount_type = 'loyalty' THEN 1 ELSE 0 END), 0) AS loyaltyTransactions,
         COALESCE(SUM(CASE WHEN discount_type = 'promotion' THEN COALESCE(discount_amount, 0) ELSE 0 END), 0) AS promotionSavings,
         COALESCE(SUM(CASE WHEN discount_type = 'loyalty' THEN COALESCE(discount_amount, 0) ELSE 0 END), 0) AS loyaltySavings,
         COALESCE(SUM(CASE WHEN discount_type IN ('promotion', 'loyalty') THEN COALESCE(subtotal, amount + COALESCE(discount_amount, 0)) ELSE 0 END), 0) AS discountedGrossSales,
         COALESCE(SUM(CASE WHEN discount_type IN ('promotion', 'loyalty') THEN amount ELSE 0 END), 0) AS discountedNetSales
       FROM transactions
       WHERE status = 'Paid'
         AND transaction_date >= ?
         AND transaction_date < ?`,
      [startDate, endDate]
    )

    const [promotionBreakdownRows] = await connection.query(
      `SELECT
         promotion_id AS promotionId,
         COUNT(*) AS transactions,
         COALESCE(SUM(discount_amount), 0) AS savings,
         COALESCE(SUM(amount), 0) AS paidSales
       FROM transactions
       WHERE status = 'Paid'
         AND discount_type = 'promotion'
         AND transaction_date >= ?
         AND transaction_date < ?
       GROUP BY promotion_id
       ORDER BY savings DESC, transactions DESC`,
      [startDate, endDate]
    )

    const discountTotals = discountRows[0] || {}
    const promotionSavings = Number(discountTotals.promotionSavings || 0)
    const loyaltySavings = Number(discountTotals.loyaltySavings || 0)
    const promotionTransactions = Number(discountTotals.promotionTransactions || 0)
    const loyaltyTransactions = Number(discountTotals.loyaltyTransactions || 0)
    const discountAnalytics = {
      promotionTransactions,
      loyaltyTransactions,
      discountedTransactions: promotionTransactions + loyaltyTransactions,
      promotionSavings,
      loyaltySavings,
      totalSavings: Math.round((promotionSavings + loyaltySavings) * 100) / 100,
      discountedGrossSales: Number(discountTotals.discountedGrossSales || 0),
      discountedNetSales: Number(discountTotals.discountedNetSales || 0),
      promotions: promotionBreakdownRows.map((row) => ({
        promotionId: row.promotionId == null ? null : Number(row.promotionId),
        transactions: Number(row.transactions || 0),
        savings: Number(row.savings || 0),
        paidSales: Number(row.paidSales || 0),
      })),
    }

    // ====================================
    // APPOINTMENTS FOR SELECTED PERIOD
    // ====================================

    const [appointmentRows] = await connection.query(
      `SELECT
         COUNT(*) AS appointments
       FROM appointments
       WHERE ${activeAppointment}
         AND appointment_date >= ?
         AND appointment_date < ?`,
      [startDate, endDate]
    )

    // ====================================
    // DAILY REPORT SUMMARY
    // ====================================

    const [summary] = await connection.query(
      `WITH RECURSIVE days AS (
         SELECT DATE(?) AS report_date

         UNION ALL

         SELECT DATE_ADD(
           report_date,
           INTERVAL 1 DAY
         )
         FROM days
         WHERE report_date < DATE_SUB(
           DATE(?),
           INTERVAL 1 DAY
         )
       )

       SELECT
         DATE_FORMAT(
           days.report_date,
           '%Y-%m-%d'
         ) AS date,

         COALESCE(s.sales, 0) AS sales,
         COALESCE(s.transactions, 0) AS transactions,
         COALESCE(a.appointments, 0) AS appointments,

         COALESCE((
           SELECT a2.service
           FROM appointments a2
           WHERE a2.appointment_date = days.report_date
             AND a2.status NOT IN (
               'Declined',
               'Cancelled',
               'Rejected',
               'Awaiting Payment'
             )
           GROUP BY a2.service
           ORDER BY COUNT(*) DESC, a2.service
           LIMIT 1
         ), 'N/A') AS topService

       FROM days

       LEFT JOIN (
         SELECT
           DATE(transaction_date) AS report_date,
           SUM(amount) AS sales,
           COUNT(*) AS transactions
         FROM transactions
         WHERE status = 'Paid'
           AND transaction_date >= ?
           AND transaction_date < ?
         GROUP BY DATE(transaction_date)
       ) s ON s.report_date = days.report_date

       LEFT JOIN (
         SELECT
           appointment_date AS report_date,
           COUNT(*) AS appointments
         FROM appointments
         WHERE ${activeAppointment}
           AND appointment_date >= ?
           AND appointment_date < ?
         GROUP BY appointment_date
       ) a ON a.report_date = days.report_date

       ORDER BY days.report_date`,
      [
        startDate,
        endDate,
        startDate,
        endDate,
        startDate,
        endDate,
      ]
    )

    // ====================================
    // APPOINTMENT STATUS ANALYTICS
    // ====================================

    const [appointmentStatus] = await connection.query(
      `SELECT
         status,
         COUNT(*) AS count
       FROM appointments
       WHERE appointment_date >= ?
         AND appointment_date < ?
         AND status <> 'Awaiting Payment'
       GROUP BY status
       ORDER BY count DESC, status`,
      [startDate, endDate]
    )

    // Appointment analytics: count every stored booking, including expired holds.
    // Dates refer to the scheduled appointment date (not the booking creation date).
    const [appointmentTotalsRows] = await connection.query(
      `SELECT
         COUNT(*) AS totalBookings,
         SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'Pending Validation' THEN 1 ELSE 0 END) AS pendingValidation,
         SUM(CASE WHEN status = 'Awaiting Payment' THEN 1 ELSE 0 END) AS awaitingPayment,
         SUM(CASE WHEN status = 'Declined' THEN 1 ELSE 0 END) AS declined,
         SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) AS cancelled,
         SUM(CASE WHEN status = 'Declined' AND suggested_date IS NOT NULL
                   AND suggested_time IS NOT NULL THEN 1 ELSE 0 END) AS rescheduleSuggestions
       FROM appointments
       WHERE appointment_date >= ? AND appointment_date < ?`,
      [startDate, endDate]
    )
    const appointmentTotals = appointmentTotalsRows[0] || {}

    const [cancellationRows] = await connection.query(
      `SELECT
         CASE
           WHEN d.payment_status = 'Expired' THEN 'Expired payment window'
           WHEN d.payment_status = 'Rejected' THEN 'Rejected deposit'
           ELSE 'Other / unknown'
         END AS reason,
         COUNT(*) AS count
       FROM appointments a
       LEFT JOIN booking_deposits d ON d.appointment_id = a.id
       WHERE a.status = 'Cancelled'
         AND a.appointment_date >= ? AND a.appointment_date < ?
       GROUP BY reason ORDER BY count DESC, reason`,
      [startDate, endDate]
    )

    const [dailyBookingRows] = await connection.query(
      `SELECT DATE_FORMAT(appointment_date, '%Y-%m-%d') AS date,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN status = 'Declined' THEN 1 ELSE 0 END) AS declined,
              SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) AS cancelled
       FROM appointments
       WHERE appointment_date >= ? AND appointment_date < ?
       GROUP BY appointment_date ORDER BY appointment_date`,
      [startDate, endDate]
    )

    const appointmentAnalytics = {
      totals: Object.fromEntries(
        ['totalBookings', 'approved', 'completed', 'pending', 'pendingValidation',
         'awaitingPayment', 'declined', 'cancelled', 'rescheduleSuggestions'].map(
          key => [key, Number(appointmentTotals[key] || 0)]
        )
      ),
      cancellations: cancellationRows.map(row => ({
        reason: row.reason, count: Number(row.count || 0)
      })),
      dailyBookings: dailyBookingRows.map(row => ({
        ...row, total: Number(row.total || 0), approved: Number(row.approved || 0),
        completed: Number(row.completed || 0), declined: Number(row.declined || 0),
        cancelled: Number(row.cancelled || 0)
      })),
    }

    // ====================================
    // MOST REQUESTED SERVICES
    // ====================================

    const [mostRequestedServices] = await connection.query(
      `SELECT
         service,
         COUNT(*) AS count
       FROM appointments
       WHERE ${activeAppointment}
         AND appointment_date >= ?
         AND appointment_date < ?
       GROUP BY service
       ORDER BY count DESC, service
       LIMIT 5`,
      [startDate, endDate]
    )

    // SERVICE ANALYTICS: current catalog snapshot + selected-period activity.
    // Historical transactions and appointments store service names, not stable IDs.
    const [[serviceCatalogTotals]] = await connection.query(`
      SELECT COUNT(*) AS totalServices,
             SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) AS availableServices,
             SUM(CASE WHEN status = 'Unavailable' THEN 1 ELSE 0 END) AS unavailableServices
      FROM services
    `)

    const [serviceCategoryRows] = await connection.query(`
      SELECT COALESCE(NULLIF(TRIM(category), ''), 'Uncategorized') AS category,
             COUNT(*) AS services,
             SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) AS available
      FROM services
      GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'Uncategorized')
      ORDER BY services DESC, category ASC
    `)

    const [serviceRevenueRows] = await connection.query(
      `SELECT service, SUM(paidTransactions) AS paidTransactions,
              SUM(unitsSold) AS unitsSold, SUM(revenue) AS revenue
       FROM (
         SELECT COALESCE(NULLIF(TRIM(service), ''), 'Unspecified service') AS service,
                COUNT(*) AS paidTransactions, SUM(COALESCE(quantity, 1)) AS unitsSold,
                SUM(amount) AS revenue
         FROM transactions
         WHERE status = 'Paid' AND (sale_type = 'Service' OR sale_type IS NULL)
           AND transaction_date >= ? AND transaction_date < ?
         GROUP BY service
         UNION ALL
         SELECT ti.item_name AS service,
       COUNT(*) AS paidTransactions,
       SUM(ti.quantity) AS unitsSold,
       SUM(COALESCE(ti.final_line_total, ti.line_total)) AS revenue
         FROM transaction_items ti JOIN transactions t ON t.transaction_id = ti.transaction_id
         WHERE t.status = 'Paid' AND t.sale_type = 'Mixed' AND ti.item_type = 'Service'
           AND t.transaction_date >= ? AND t.transaction_date < ?
         GROUP BY ti.item_name
       ) service_rows GROUP BY service
       ORDER BY revenue DESC, paidTransactions DESC, service ASC`,
      [startDate, endDate, startDate, endDate]
    )

    const [serviceDemandRows] = await connection.query(
      `SELECT COALESCE(NULLIF(TRIM(service), ''), 'Unspecified service') AS service,
              COUNT(*) AS requests
       FROM appointments
       WHERE ${activeAppointment}
         AND appointment_date >= ? AND appointment_date < ?
       GROUP BY COALESCE(NULLIF(TRIM(service), ''), 'Unspecified service')
       ORDER BY requests DESC, service ASC`,
      [startDate, endDate]
    )

    const serviceAnalytics = {
      catalog: {
        totalServices: Number(serviceCatalogTotals.totalServices || 0),
        availableServices: Number(serviceCatalogTotals.availableServices || 0),
        unavailableServices: Number(serviceCatalogTotals.unavailableServices || 0),
      },
      categories: serviceCategoryRows.map(row => ({
        category: row.category,
        services: Number(row.services || 0),
        available: Number(row.available || 0),
      })),
      paidServices: serviceRevenueRows.map(row => ({
        service: row.service,
        paidTransactions: Number(row.paidTransactions || 0),
        unitsSold: Number(row.unitsSold || 0),
        revenue: Number(row.revenue || 0),
      })),
      requestedServices: serviceDemandRows.map(row => ({
        service: row.service,
        requests: Number(row.requests || 0),
      })),
    }

    // ====================================
    // INVENTORY ANALYTICS
    // ====================================

    // Current inventory snapshot.
    // These values are NOT restricted
    // by the selected reporting period.

    const [inventoryOverviewRows] = await connection.query(`
      SELECT
        COUNT(*) AS products,

        COALESCE(
          SUM(stock),
          0
        ) AS unitsOnHand,

        COALESCE(
          SUM(
            CASE
              WHEN stock = 0 THEN 1
              ELSE 0
            END
          ),
          0
        ) AS outOfStock,

        COALESCE(
          SUM(
            CASE
              WHEN stock > 0
               AND stock <= alertLevel
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS lowStock,

        COALESCE(
          SUM(
            CASE
              WHEN stock > alertLevel
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS inStock

      FROM inventory
    `)

    // ====================================
    // STOCK BY CATEGORY
    // ====================================

    const [inventoryCategoryRows] = await connection.query(`
      SELECT
        category,
        COUNT(*) AS products,
        COALESCE(SUM(stock), 0) AS units

      FROM inventory

      GROUP BY category

      ORDER BY
        units DESC,
        category ASC
    `)

    // ====================================
    // STOCK MOVEMENT HISTORY
    // ====================================

    // Uses the existing inventory_movements
    // table and selected reporting period.

    const [inventoryMovementRows] = await connection.query(
      `SELECT
         DATE_FORMAT(
           recorded_at,
           '%Y-%m-%d'
         ) AS date,

         COALESCE(
           SUM(
             CASE
               WHEN quantity_change > 0
               THEN quantity_change
               ELSE 0
             END
           ),
           0
         ) AS stockIn,

         COALESCE(
           SUM(
             CASE
               WHEN quantity_change < 0
               THEN -quantity_change
               ELSE 0
             END
           ),
           0
         ) AS stockOut

       FROM inventory_movements

       WHERE recorded_at >= ?
         AND recorded_at < ?

       GROUP BY DATE_FORMAT(recorded_at, '%Y-%m-%d')

        ORDER BY date`,
      [startDate, endDate]
    )

    // ====================================
    // LOW STOCK / OUT OF STOCK PRODUCTS
    // ====================================

    const [inventoryAttentionRows] = await connection.query(`
      SELECT
        id,
        name,
        category,
        stock,
        alertLevel,

        CASE
          WHEN stock = 0
          THEN 'Out of Stock'
          ELSE 'Low Stock'
        END AS status

      FROM inventory

      WHERE stock <= alertLevel

      ORDER BY
        CASE
          WHEN stock = 0 THEN 0
          ELSE 1
        END,
        stock ASC,
        name ASC
    `)

    // ====================================
    // FORMAT INVENTORY DATA
    // ====================================

    const inventoryOverview =
      inventoryOverviewRows[0] || {}

    const movementByDate = new Map(
      inventoryMovementRows.map((row) => [
        String(row.date),
        row,
      ])
    )

    const inventoryMovementTrend = summary.map((row) => {
      const movement =
        movementByDate.get(String(row.date)) || {}

      return {
        date: String(row.date),
        stockIn: Number(movement.stockIn || 0),
        stockOut: Number(movement.stockOut || 0),
      }
    })

    const totalStockIn = inventoryMovementTrend.reduce(
      (total, row) => total + row.stockIn,
      0
    )

    const totalStockOut = inventoryMovementTrend.reduce(
      (total, row) => total + row.stockOut,
      0
    )

    // ====================================
    // FORMAT SALES DATA
    // ====================================

    const todaySales = Number(
      overviewRows[0]?.todaySales || 0
    )

    const weekSales = Number(
      overviewRows[0]?.weekSales || 0
    )

    const monthSales = Number(
      overviewRows[0]?.monthSales || 0
    )

    // ====================================
    // API RESPONSE
    // ====================================

    res.json({
      period: selected.period,
      periodLabel: selected.label,
      periodStart: startDate,
      periodEnd: addDays(endDate, -1),

      selectedDate: selected.selectedDate,
      selectedWeek: selected.selectedWeek,
      selectedMonth: selected.selectedMonth,

      // SALES

      sales: Number(salesRows[0]?.sales || 0),

      transactions: Number(
        salesRows[0]?.transactions || 0
      ),

      averageSale: Number(
        salesRows[0]?.averageSale || 0
      ),

      appointments: Number(
        appointmentRows[0]?.appointments || 0
      ),

      todaySales,
      weekSales,
      monthSales,

      dailySales: todaySales,
      weeklySales: weekSales,
      monthlySales: monthSales,

      salesAnalytics,
      serviceAnalytics,
      appointmentAnalytics,

      // Applied discounts on paid sales in the selected period.
      discountAnalytics,

      // ====================================
      // INVENTORY ANALYTICS RESPONSE
      // ====================================

      inventoryAnalytics: {
        snapshot: {
          products: Number(
            inventoryOverview.products || 0
          ),

          unitsOnHand: Number(
            inventoryOverview.unitsOnHand || 0
          ),

          inStock: Number(
            inventoryOverview.inStock || 0
          ),

          lowStock: Number(
            inventoryOverview.lowStock || 0
          ),

          outOfStock: Number(
            inventoryOverview.outOfStock || 0
          ),

          needsAttention:
            Number(inventoryOverview.lowStock || 0) +
            Number(inventoryOverview.outOfStock || 0),
        },

        categoryStock: inventoryCategoryRows.map(
          (row) => ({
            category:
              row.category || "Uncategorized",

            products: Number(row.products || 0),

            units: Number(row.units || 0),
          })
        ),

        movementTrend: inventoryMovementTrend,

        totalStockIn,
        totalStockOut,

        attentionItems: inventoryAttentionRows.map(
          (row) => ({
            id: row.id,
            name: row.name,
            category: row.category,
            stock: Number(row.stock || 0),
            alertLevel: Number(row.alertLevel || 0),
            status: row.status,
          })
        ),
      },

      // ====================================
      // EXISTING SALES / APPOINTMENT REPORTS
      // ====================================

      salesTrend: summary.map((row) => ({
        date: row.date,
        sales: Number(row.sales || 0),
      })),

      appointmentStatus: appointmentStatus.map(
        (row) => ({
          ...row,
          count: Number(row.count || 0),
        })
      ),

      mostRequestedServices:
        mostRequestedServices.map((row) => ({
          ...row,
          count: Number(row.count || 0),
        })),

      summary: summary
        .slice()
        .reverse()
        .map((row) => ({
          ...row,
          sales: Number(row.sales || 0),
          transactions: Number(
            row.transactions || 0
          ),
          appointments: Number(
            row.appointments || 0
          ),
        })),
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

const express = require("express")
const router = express.Router()
const database = require("../db").promise()

router.get("/", async (req, res) => {
  const days = Number(req.query.days) === 30 ? 30 : 7

  let connection
  let originalTimezone

  try {
    connection = await database.getConnection()

    const [[timezone]] = await connection.query(
      "SELECT @@session.time_zone AS timezone"
    )

    originalTimezone = timezone.timezone

    // Dashboard dates follow Philippine time.
    await connection.query("SET time_zone = '+08:00'")

    const [[clock]] = await connection.query(`
      SELECT
        DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today,
        DATE_FORMAT(
          NOW(),
          '%Y-%m-%dT%H:%i:%s+08:00'
        ) AS generatedAt
    `)

    /*
     * Hide unfinished deposit reservations.
     * Existing appointments without deposit records remain visible.
     */
    const visibleBooking = `
      (
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

    const activeBooking = `
      a.status IN (
        'Pending',
        'Pending Validation',
        'Approved',
        'Completed'
      )
    `

    const [[sales]] = await connection.query(`
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN transaction_date >= CURDATE()
              THEN amount
              ELSE 0
            END
          ),
          0
        ) AS salesToday
      FROM transactions
      WHERE status = 'Paid'
        AND transaction_date < NOW()
    `)

    const [[appointments]] = await connection.query(`
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN a.appointment_date = CURDATE()
                AND ${activeBooking}
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS appointmentsToday,

        COALESCE(
          SUM(
            CASE
              WHEN a.status IN (
                'Pending',
                'Pending Validation'
              )
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS pendingRequests

      FROM appointments a
      WHERE ${visibleBooking}
    `)

    const [lowStockItems] = await connection.query(`
      SELECT id, name, stock, alertLevel
      FROM inventory
      WHERE stock <= alertLevel
      ORDER BY stock ASC, name ASC
    `)

    const [salesRows] = await connection.query(
      `
      SELECT
        DATE_FORMAT(
          transaction_date,
          '%Y-%m-%d'
        ) AS date,
        SUM(amount) AS sales
      FROM transactions
      WHERE status = 'Paid'
        AND transaction_date >=
          DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND transaction_date <= NOW()
      GROUP BY DATE_FORMAT(
        transaction_date,
        '%Y-%m-%d'
      )
      ORDER BY date
      `,
      [days - 1]
    )

    const [appointmentRows] = await connection.query(
      `
      SELECT
        DATE_FORMAT(
          a.appointment_date,
          '%Y-%m-%d'
        ) AS date,
        COUNT(*) AS appointments
      FROM appointments a
      WHERE a.appointment_date >=
          DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND a.appointment_date <= CURDATE()
        AND ${activeBooking}
        AND ${visibleBooking}
      GROUP BY a.appointment_date
      ORDER BY a.appointment_date
      `,
      [days - 1]
    )

    const [topServices] = await connection.query(
      `
      SELECT
        a.service,
        COUNT(*) AS requests
      FROM appointments a
      WHERE a.appointment_date >=
          DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND a.appointment_date <= CURDATE()
        AND ${activeBooking}
        AND ${visibleBooking}
      GROUP BY a.service
      ORDER BY requests DESC, a.service ASC
      LIMIT 5
      `,
      [days - 1]
    )

    const [salesMix] = await connection.query(
      `
      SELECT
        COALESCE(sale_type, 'Service') AS type,
        SUM(amount) AS sales
      FROM transactions
      WHERE status = 'Paid'
        AND transaction_date >=
          DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND transaction_date <= NOW()
      GROUP BY COALESCE(sale_type, 'Service')
      ORDER BY sales DESC
      `,
      [days - 1]
    )

    const [todaySchedule] = await connection.query(`
      SELECT
        a.id,
        a.customer_name,
        a.service,
        TIME_FORMAT(
          a.appointment_time,
          '%H:%i'
        ) AS startTime,
        TIME_FORMAT(
          a.appointment_end_time,
          '%H:%i'
        ) AS endTime,
        a.status,
        COALESCE(s.name, 'Unassigned') AS staffName
      FROM appointments a
      LEFT JOIN staff s ON s.staff_id = a.staff_id
      WHERE a.appointment_date = CURDATE()
        AND ${activeBooking}
        AND ${visibleBooking}
      ORDER BY a.appointment_time, a.id
    `)

    /*
     * This is availability NOW, not a promise that a staff
     * member can perform every service or a full future interval.
     */
    const [staffRows] = await connection.query(`
      SELECT
        s.staff_id,
        s.name,
        s.role,
        s.daily_status,

        EXISTS (
          SELECT 1
          FROM staff_schedule sch
          WHERE sch.staff_id = s.staff_id
            AND sch.active = 1
            AND sch.day_of_week = DAYOFWEEK(CURDATE()) - 1
            AND sch.shift_start <= CURTIME()
            AND sch.shift_end > CURTIME()
        ) AS onShift,

        EXISTS (
          SELECT 1
          FROM staff_unavailability u
          WHERE u.staff_id = s.staff_id
            AND u.start_at <= NOW()
            AND u.end_at > NOW()
        ) AS unavailableNow,

        EXISTS (
          SELECT 1
          FROM appointments a
          LEFT JOIN booking_deposits bd
            ON bd.appointment_id = a.id
          WHERE a.staff_id = s.staff_id
            AND a.appointment_date = CURDATE()
            AND a.status NOT IN (
              'Declined',
              'Cancelled',
              'Rejected'
            )
            AND a.appointment_time <= CURTIME()
            AND COALESCE(
              a.appointment_end_time,
              ADDTIME(a.appointment_time, '01:00:00')
            ) > CURTIME()
            AND (
              bd.deposit_id IS NULL
              OR bd.payment_status IN (
                'Awaiting Verification',
                'Verified'
              )
              OR (
                bd.payment_status = 'Awaiting Payment'
                AND bd.expires_at > UTC_TIMESTAMP()
              )
            )
        ) AS occupiedNow

      FROM staff s
      WHERE s.active_status = 'Active'
      ORDER BY s.name, s.staff_id
    `)

    const staff = staffRows.map((item) => {
      let availability = "Off shift"

      if (
        item.daily_status !== "Available" ||
        Number(item.unavailableNow) === 1
      ) {
        availability = "Unavailable"
      } else if (Number(item.onShift) === 1) {
        availability =
          Number(item.occupiedNow) === 1
            ? "Occupied / reserved"
            : "Available now"
      }

      return {
        id: item.staff_id,
        name: item.name,
        role: item.role,
        availability,
      }
    })

    const salesMap = new Map(
      salesRows.map((item) => [
        item.date,
        Number(item.sales),
      ])
    )

    const appointmentMap = new Map(
      appointmentRows.map((item) => [
        item.date,
        Number(item.appointments),
      ])
    )

    // Include dates with zero records.
    const trend = []

    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(`${clock.today}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() - offset)

      const key = date.toISOString().slice(0, 10)

      trend.push({
        date: key,
        sales: salesMap.get(key) || 0,
        appointments: appointmentMap.get(key) || 0,
      })
    }

    res.json({
      days,
      today: clock.today,
      generatedAt: clock.generatedAt,
      salesToday: Number(sales.salesToday),
      appointmentsToday: Number(
        appointments.appointmentsToday
      ),
      pendingRequests: Number(
        appointments.pendingRequests
      ),
      availableStaff: staff.filter(
        (item) => item.availability === "Available now"
      ).length,
      lowStockCount: lowStockItems.length,
      lowStockItems,
      trend,
      topServices: topServices.map((item) => ({
        ...item,
        requests: Number(item.requests),
      })),
      salesMix: salesMix.map((item) => ({
        ...item,
        sales: Number(item.sales),
      })),
      todaySchedule,
      staff,
    })
  } catch (error) {
    console.error(
      "Dashboard load failed:",
      error.code || error.name
    )

    res.status(500).json({
      error: "Unable to load the dashboard. Please try again.",
    })
  } finally {
    if (connection) {
      try {
        if (originalTimezone !== undefined) {
          await connection.query(
            "SET time_zone = ?",
            [originalTimezone]
          )
        }

        connection.release()
      } catch {
        connection.destroy()
      }
    }
  }
})

// The bulk-delete-sales endpoint has been removed.

module.exports = router
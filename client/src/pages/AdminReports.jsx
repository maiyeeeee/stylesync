
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { API_URL, apiFetch } from "../lib/sessionApi"
import salonLogo from "../assets/dahling-logo.jpg"

const panel = "rounded-2xl border border-purple-100 bg-white shadow-sm"

const emptyReport = {
  period: "weekly",
  periodLabel: "This Week",
  periodStart: "",
  periodEnd: "",
  sales: 0,
  transactions: 0,
  averageSale: 0,
  appointments: 0,
  todaySales: 0,
  weekSales: 0,
  monthSales: 0,
  summary: [],
  salesTrend: [],
  appointmentStatus: [],
  mostRequestedServices: [],
}

const money = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  })

function todayInManila() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )

  return `${values.year}-${values.month}-${values.day}`
}

function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function mondayOf(value) {
  const date = new Date(`${value}T00:00:00Z`)
  const day = date.getUTCDay()
  return addDays(value, -(day === 0 ? 6 : day - 1))
}

function formatDate(value, options = {}) {
  if (!value) return "N/A"

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`)

  if (Number.isNaN(date.getTime())) return "N/A"

  return date.toLocaleDateString("en-PH", {
    timeZone: "UTC",
    ...options,
  })
}

function longDate(value) {
  return formatDate(value, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function shortDate(value) {
  return formatDate(value, {
    month: "short",
    day: "numeric",
  })
}

function ChartEmpty({ children }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-gray-500">
      {children}
    </div>
  )
}

function PrintableSalonReport({ report, generatedAt }) {
  const rows = [...(report.summary || [])].reverse()
  const topService = report.mostRequestedServices?.[0]

  const highestSalesDay = [...rows].sort(
    (a, b) => Number(b.sales || 0) - Number(a.sales || 0)
  )[0]

  const insights = [
    `Total paid sales for the selected period were ${money(report.sales)} across ${report.transactions} paid transactions.`,
    `The average value per paid transaction was ${money(report.averageSale)}.`,
    `${report.appointments} active appointments were recorded during the selected period.`,
  ]

  if (topService) {
    insights.push(
      `The leading requested service was ${topService.service}, with ${topService.count} recorded request(s).`
    )
  }

  if (highestSalesDay && Number(highestSalesDay.sales) > 0) {
    insights.push(
      `The highest-sales date was ${longDate(highestSalesDay.date)}, generating ${money(highestSalesDay.sales)}.`
    )
  }

  return (
    <article className="stylesync-print-report">
      <header className="stylesync-print-header">
        <img
          src={salonLogo}
          alt="Dahling's Salon and Spa Logo"
          className="stylesync-print-logo"
        />

        <div>
          <h1>DAHLING'S SALON AND SPA</h1>
          <h2>SALES & PERFORMANCE REPORT</h2>
          <p>Generated through StyleSync Management System</p>
          <p>
            Reporting Period: {report.periodLabel}
          </p>
          <p>
            {longDate(report.periodStart)} – {longDate(report.periodEnd)}
          </p>
          <p>Generated: {generatedAt} (Philippine Time)</p>
        </div>
      </header>

      <section className="stylesync-print-section">
        <h3>1. Executive Summary</h3>

        <div className="stylesync-print-kpis">
          <div>
            <span>Total Paid Sales</span>
            <strong>{money(report.sales)}</strong>
          </div>

          <div>
            <span>Paid Transactions</span>
            <strong>{report.transactions}</strong>
          </div>

          <div>
            <span>Average Sale</span>
            <strong>{money(report.averageSale)}</strong>
          </div>

          <div>
            <span>Active Appointments</span>
            <strong>{report.appointments}</strong>
          </div>
        </div>
      </section>

      <section className="stylesync-print-section">
        <h3>2. Paid Sales by Date</h3>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Paid Sales</th>
              <th>Paid Transactions</th>
            </tr>
          </thead>

          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.date}>
                  <td>{longDate(row.date)}</td>
                  <td>{money(row.sales)}</td>
                  <td>{row.transactions}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3}>No recorded sales activity.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="stylesync-print-section">
        <h3>3. Appointment Status Analysis</h3>

        <table>
          <thead>
            <tr>
              <th>Appointment Status</th>
              <th>Number of Appointments</th>
            </tr>
          </thead>

          <tbody>
            {report.appointmentStatus.length ? (
              report.appointmentStatus.map((row) => (
                <tr key={row.status}>
                  <td>{row.status}</td>
                  <td>{row.count}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2}>No appointment records.</td>
              </tr>
            )}
          </tbody>
        </table>

        <p className="stylesync-print-note">
          Unpaid reservation holds are excluded from appointment status analysis.
        </p>
      </section>

      <section className="stylesync-print-section">
        <h3>4. Most Requested Services</h3>

        <table>
          <thead>
            <tr>
              <th>Service Name</th>
              <th>Appointment Requests</th>
            </tr>
          </thead>

          <tbody>
            {report.mostRequestedServices.length ? (
              report.mostRequestedServices.map((row) => (
                <tr key={row.service}>
                  <td>{row.service}</td>
                  <td>{row.count}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2}>No service requests recorded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="stylesync-print-section">
        <h3>5. Daily Activity Summary</h3>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Paid Sales</th>
              <th>Transactions</th>
              <th>Appointments</th>
              <th>Top Service</th>
            </tr>
          </thead>

          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.date}>
                  <td>{longDate(row.date)}</td>
                  <td>{money(row.sales)}</td>
                  <td>{row.transactions}</td>
                  <td>{row.appointments}</td>
                  <td>{row.topService || "N/A"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>No activity for this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="stylesync-print-section">
        <h3>6. Management Insights</h3>

        <ul>
          {insights.map((insight, index) => (
            <li key={index}>{insight}</li>
          ))}
        </ul>

        <p className="stylesync-print-note">
          These insights summarize recorded business activity and do not
          represent forecasts or predictions.
        </p>
      </section>

      <footer className="stylesync-print-footer">
        <p>Prepared for Dahling's Salon and Spa</p>
        <p>Generated by StyleSync | Internal Management Report</p>
      </footer>
    </article>
  )
}

function AdminReports() {
  const today = useMemo(() => todayInManila(), [])
  const currentYear = Number(today.slice(0, 4))

  const [period, setPeriod] = useState("weekly")
  const [filters, setFilters] = useState({
    daily: today,
    weekly: mondayOf(today),
    monthly: today.slice(0, 7),
  })

  const [report, setReport] = useState(emptyReport)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [generatedAt, setGeneratedAt] = useState("")

  const selectedValue = filters[period]

  const dayOptions = useMemo(
    () => Array.from(
      { length: 31 },
      (_, index) => addDays(today, -index)
    ),
    [today]
  )

  const weekOptions = useMemo(
    () => Array.from(
      { length: 12 },
      (_, index) => addDays(mondayOf(today), -7 * index)
    ),
    [today]
  )

  const yearOptions = useMemo(
    () => Array.from(
      { length: 5 },
      (_, index) => currentYear - index
    ),
    [currentYear]
  )

  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, "0")
      const value = `${filters.monthly.slice(0, 4)}-${month}`

      return {
        value,
        label: formatDate(`${value}-01`, {
          month: "long",
        }),
      }
    }),
    [filters.monthly]
  )

  const loadReport = useCallback(async (
    selectedPeriod,
    selectedValue,
    signal
  ) => {
    setLoading(true)
    setError("")

    try {
      const params = new URLSearchParams({
        period: selectedPeriod,
      })

      const queryNames = {
        daily: "date",
        weekly: "week",
        monthly: "month",
      }

      params.set(queryNames[selectedPeriod], selectedValue)

      const response = await apiFetch(
        `${API_URL}/reports?${params.toString()}`,
        { signal }
      )

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          data?.error || "Unable to load the report."
        )
      }

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Unexpected report response.")
      }

      if (!signal?.aborted) {
        setReport({
          ...emptyReport,
          ...data,

          summary: Array.isArray(data.summary)
            ? data.summary
            : [],

          salesTrend: Array.isArray(data.salesTrend)
            ? data.salesTrend.map((item) => ({
                ...item,
                dateLabel: shortDate(item.date),
                sales: Number(item.sales || 0),
              }))
            : [],

          appointmentStatus: Array.isArray(data.appointmentStatus)
            ? data.appointmentStatus.map((item) => ({
                ...item,
                count: Number(item.count || 0),
              }))
            : [],

          mostRequestedServices: Array.isArray(data.mostRequestedServices)
            ? data.mostRequestedServices.map((item) => ({
                ...item,
                count: Number(item.count || 0),
              }))
            : [],
        })
      }
    } catch (requestError) {
      if (!signal?.aborted) {
        setError(
          requestError.message || "Unable to load the report."
        )
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    loadReport(period, selectedValue, controller.signal)

    return () => controller.abort()
  }, [period, selectedValue, loadReport])

  function updateFilter(value) {
    setFilters((previous) => ({
      ...previous,
      [period]: value,
    }))
  }

  function updateMonthYear(year) {
    setFilters((previous) => ({
      ...previous,
      monthly: `${year}-${previous.monthly.slice(5, 7)}`,
    }))
  }

  function handlePrint() {
    if (loading || error) return

    setGeneratedAt(
      new Date().toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        dateStyle: "long",
        timeStyle: "short",
      })
    )

    // Allow React to render the updated timestamp first.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print())
    })
  }

  const hasSales = report.salesTrend.some(
    (item) => item.sales > 0
  )

  const cards = [
    {
      label: "Today's Paid Sales",
      value: money(report.todaySales),
      note: "Sales recorded today",
    },
    {
      label: "This Week's Paid Sales",
      value: money(report.weekSales),
      note: "Monday through Sunday",
    },
    {
      label: "This Month's Paid Sales",
      value: money(report.monthSales),
      note: formatDate(`${today.slice(0, 7)}-01`, {
        month: "long",
        year: "numeric",
      }),
    },
    {
      label: "Selected-period Appointments",
      value: report.appointments,
      note: report.periodLabel,
    },
  ]

  return (
    <div className="stylesync-reports-page">
      <style>
        {`
          .stylesync-print-report {
            display: none;
          }

          @media print {
            @page {
              size: A4 portrait;
              margin: 14mm;
            }

            html,
            body,
            #root {
              background: white !important;
              overflow: visible !important;
              height: auto !important;
            }

            body * {
              visibility: hidden !important;
            }

            .stylesync-reports-page,
            .stylesync-print-report,
            .stylesync-print-report * {
              visibility: visible !important;
            }

            .stylesync-screen-dashboard {
              display: none !important;
            }

            .stylesync-print-report {
              display: block !important;
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              padding: 0;
              margin: 0;
              background: white;
              color: #222;
              font-family: Arial, sans-serif;
              font-size: 10px;
              line-height: 1.5;
            }

            .stylesync-print-header {
              display: flex;
              align-items: center;
              gap: 18px;
              padding-bottom: 15px;
              margin-bottom: 20px;
              border-bottom: 2px solid #7e22ce;
            }

            .stylesync-print-logo {
              width: 90px;
              height: 90px;
              object-fit: contain;
              flex-shrink: 0;
            }

            .stylesync-print-header h1 {
              margin: 0;
              color: #581c87;
              font-size: 19px;
              font-weight: 800;
            }

            .stylesync-print-header h2 {
              margin: 4px 0;
              font-size: 13px;
              font-weight: 700;
            }

            .stylesync-print-header p {
              margin: 2px 0;
              font-size: 10px;
            }

            .stylesync-print-section {
              margin-bottom: 20px;
            }

            .stylesync-print-section h3 {
              color: #581c87;
              font-size: 13px;
              font-weight: 700;
              border-bottom: 1px solid #ddd;
              padding-bottom: 6px;
              margin-bottom: 10px;
            }

            .stylesync-print-kpis {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 8px;
            }

            .stylesync-print-kpis > div {
              border: 1px solid #ddd;
              border-radius: 5px;
              padding: 10px;
              break-inside: avoid;
            }

            .stylesync-print-kpis span {
              display: block;
              font-size: 9px;
              color: #555;
            }

            .stylesync-print-kpis strong {
              display: block;
              margin-top: 5px;
              color: #581c87;
              font-size: 14px;
            }

            .stylesync-print-section table {
              width: 100%;
              border-collapse: collapse;
              font-size: 9px;
            }

            .stylesync-print-section th,
            .stylesync-print-section td {
              border: 1px solid #ddd;
              padding: 7px;
              text-align: left;
              overflow-wrap: anywhere;
            }

            .stylesync-print-section th {
              background: #f3e8ff !important;
              color: #581c87;
              font-weight: 700;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .stylesync-print-section thead {
              display: table-header-group;
            }

            .stylesync-print-section tr {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .stylesync-print-section ul {
              padding-left: 20px;
              list-style: disc;
            }

            .stylesync-print-section li {
              margin-bottom: 5px;
            }

            .stylesync-print-note {
              margin-top: 10px;
              color: #666;
              font-style: italic;
            }

            .stylesync-print-footer {
              margin-top: 25px;
              padding-top: 12px;
              border-top: 1px solid #ccc;
              text-align: center;
              font-size: 9px;
              color: #666;
            }

            .stylesync-print-footer p {
              margin: 2px 0;
            }
          }
        `}
      </style>

      <div className="stylesync-screen-dashboard min-w-0 space-y-6">

        {/* PAGE HEADER */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-purple-500">
              Descriptive Analytics
            </p>

            <h1 className="text-3xl font-bold text-purple-950">
              Reports
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Review recorded sales, appointments, and service activity.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => loadReport(period, selectedValue)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>

            <button
              type="button"
              disabled={loading || Boolean(error)}
              onClick={handlePrint}
              className="rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Print / Save PDF
            </button>
          </div>
        </header>

        {/* ERROR MESSAGE */}
        {error && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
          >
            {error}

            <button
              type="button"
              disabled={loading}
              onClick={() => loadReport(period, selectedValue)}
              className="ml-3 font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* REPORT FILTERS */}
        <section className={`${panel} p-4 md:p-5`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Report period
              </p>

              <div
                className="flex flex-wrap gap-2"
                aria-label="Report period"
              >
                {[
                  ["daily", "Today / Day"],
                  ["weekly", "Weekly"],
                  ["monthly", "Monthly"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPeriod(value)}
                    aria-pressed={period === value}
                    className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                      period === value
                        ? "bg-purple-700 text-white"
                        : "bg-gray-50 text-gray-600 hover:bg-purple-50 hover:text-purple-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {period === "daily" && (
                <label className="min-w-[260px] text-sm font-medium text-gray-700">
                  <span className="mb-2 block">Select day</span>

                  <select
                    value={filters.daily}
                    onChange={(event) =>
                      updateFilter(event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5"
                  >
                    {dayOptions.map((value) => (
                      <option key={value} value={value}>
                        {value === today ? "Today — " : ""}
                        {longDate(value)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {period === "weekly" && (
                <label className="min-w-[260px] text-sm font-medium text-gray-700">
                  <span className="mb-2 block">Select week</span>

                  <select
                    value={filters.weekly}
                    onChange={(event) =>
                      updateFilter(event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5"
                  >
                    {weekOptions.map((value, index) => (
                      <option key={value} value={value}>
                        {index === 0 ? "This week — " : ""}
                        {shortDate(value)} – {longDate(addDays(value, 6))}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {period === "monthly" && (
                <>
                  <label className="min-w-[180px] text-sm font-medium text-gray-700">
                    <span className="mb-2 block">Select month</span>

                    <select
                      value={filters.monthly}
                      onChange={(event) =>
                        updateFilter(event.target.value)
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5"
                    >
                      {monthOptions.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="min-w-[120px] text-sm font-medium text-gray-700">
                    <span className="mb-2 block">Year</span>

                    <select
                      value={filters.monthly.slice(0, 4)}
                      onChange={(event) =>
                        updateMonthYear(event.target.value)
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5"
                    >
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </div>

          <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-500">
            Showing:{" "}
            <span className="font-semibold text-purple-800">
              {report.periodLabel}
            </span>

            {loading && (
              <span className="ml-2">Loading…</span>
            )}
          </p>
        </section>

        {/* OVERVIEW CARDS */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <article
              key={card.label}
              className={`${panel} p-5`}
            >
              <p className="text-sm text-gray-500">
                {card.label}
              </p>

              <p className="mt-3 text-2xl font-bold text-purple-800">
                {loading && !error ? "—" : card.value}
              </p>

              <p className="mt-2 text-xs leading-relaxed text-gray-500">
                {card.note}
              </p>
            </article>
          ))}
        </section>

        {/* SELECTED PERIOD SUMMARY */}
        <section className={`${panel} grid gap-4 p-5 sm:grid-cols-3`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {report.periodLabel} paid sales
            </p>

            <p className="mt-2 text-xl font-bold text-purple-900">
              {money(report.sales)}
            </p>
          </div>

          <div className="border-gray-100 sm:border-l sm:pl-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Paid transactions
            </p>

            <p className="mt-2 text-xl font-bold text-purple-900">
              {report.transactions}
            </p>
          </div>

          <div className="border-gray-100 sm:border-l sm:pl-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Average sale
            </p>

            <p className="mt-2 text-xl font-bold text-emerald-700">
              {money(report.averageSale)}
            </p>
          </div>
        </section>

        {/* SALES AND APPOINTMENT CHARTS */}
        <section className="grid gap-6 xl:grid-cols-2">

          {/* SALES CHART */}
          <article className={`${panel} p-5 md:p-6`}>
            <h2 className="text-lg font-bold text-purple-950">
              Paid Sales — {report.periodLabel}
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              Dates without paid sales are shown as zero.
            </p>

            <div className="mt-5 h-72">
              {!hasSales ? (
                <ChartEmpty>
                  No paid sales recorded for the selected period.
                </ChartEmpty>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={report.salesTrend}>
                    <CartesianGrid
                      stroke="#eee8f3"
                      strokeDasharray="3 3"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fontSize: 12 }}
                    />

                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `₱${value}`}
                    />

                    <Tooltip
                      formatter={(value) => [
                        money(value),
                        "Paid sales",
                      ]}
                    />

                    <Line
                      type="monotone"
                      dataKey="sales"
                      stroke="#7e22ce"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>

          {/* APPOINTMENT STATUS CHART */}
          <article className={`${panel} p-5 md:p-6`}>
            <h2 className="text-lg font-bold text-purple-950">
              Appointment Status — {report.periodLabel}
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              Unpaid reservation holds are not included.
            </p>

            <div className="mt-5 h-72">
              {!report.appointmentStatus.length ? (
                <ChartEmpty>
                  No appointments recorded for the selected period.
                </ChartEmpty>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.appointmentStatus}>
                    <CartesianGrid
                      stroke="#eee8f3"
                      strokeDasharray="3 3"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="status"
                      tick={{ fontSize: 11 }}
                    />

                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 12 }}
                    />

                    <Tooltip
                      formatter={(value) => [
                        value,
                        "Appointments",
                      ]}
                    />

                    <Bar
                      dataKey="count"
                      fill="#ec4899"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>
        </section>

        {/* MOST REQUESTED SERVICES CHART */}
        <section className={`${panel} p-5 md:p-6`}>
          <h2 className="text-lg font-bold text-purple-950">
            Most Requested Services — {report.periodLabel}
          </h2>

          <p className="mt-1 text-xs text-gray-500">
            Based on actual active appointment records, not forecasts.
          </p>

          <div className="mt-5 h-72">
            {!report.mostRequestedServices.length ? (
              <ChartEmpty>
                No service requests recorded for the selected period.
              </ChartEmpty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={report.mostRequestedServices}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid
                    stroke="#eee8f3"
                    strokeDasharray="3 3"
                    horizontal={false}
                  />

                  <XAxis
                    type="number"
                    allowDecimals={false}
                  />

                  <YAxis
                    type="category"
                    dataKey="service"
                    width={130}
                    tick={{ fontSize: 12 }}
                  />

                  <Tooltip
                    formatter={(value) => [
                      value,
                      "Appointments",
                    ]}
                  />

                  <Bar
                    dataKey="count"
                    fill="#7e22ce"
                    radius={[0, 8, 8, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* ACTIVITY TABLE */}
        <section className={`${panel} overflow-hidden`}>
          <div className="p-5 md:p-6">
            <h2 className="text-lg font-bold text-purple-950">
              Activity by Date — {report.periodLabel}
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              Sales count paid transactions; appointments come from
              booking records.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-y border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-4 py-4 text-right">
                    Paid Sales
                  </th>
                  <th className="px-4 py-4 text-right">
                    Transactions
                  </th>
                  <th className="px-4 py-4 text-right">
                    Appointments
                  </th>
                  <th className="px-6 py-4">
                    Top Service
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {!report.summary.length ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-10 text-center text-gray-500"
                    >
                      {loading
                        ? "Loading report…"
                        : "No recorded activity for this period."}
                    </td>
                  </tr>
                ) : (
                  report.summary.map((row) => (
                    <tr
                      key={row.date}
                      className="hover:bg-purple-50/40"
                    >
                      <td className="px-6 py-4 font-medium text-gray-800">
                        {longDate(row.date)}
                      </td>

                      <td className="px-4 py-4 text-right font-semibold tabular-nums text-purple-800">
                        {money(row.sales)}
                      </td>

                      <td className="px-4 py-4 text-right tabular-nums">
                        {Number(row.transactions || 0)}
                      </td>

                      <td className="px-4 py-4 text-right tabular-nums">
                        {Number(row.appointments || 0)}
                      </td>

                      <td className="px-6 py-4 text-gray-600">
                        {row.topService || "N/A"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-xs text-gray-500">
          Report dates use Philippine time. Figures are descriptive
          records of completed system activity; no forecasting is used.
        </p>
      </div>

      {/* PRINT-ONLY OFFICIAL SALON REPORT */}
      <PrintableSalonReport
        report={report}
        generatedAt={generatedAt}
      />
    </div>
  )
}

export default AdminReports


import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
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
  appointmentAnalytics: {
    totals: { totalBookings: 0, approved: 0, completed: 0, pending: 0,
      pendingValidation: 0, awaitingPayment: 0, declined: 0, cancelled: 0,
      rescheduleSuggestions: 0 },
    cancellations: [], dailyBookings: [],
  },
  serviceAnalytics: {
    catalog: { totalServices: 0, availableServices: 0, unavailableServices: 0 },
    categories: [], paidServices: [], requestedServices: [],
  },
  mostRequestedServices: [],
  salesAnalytics: {
    previousPeriod: { startDate: "", endDate: "", sales: 0, transactions: 0 },
    salesByType: [],
    paymentBreakdown: [],
    topSellingServices: [],
  },
  discountAnalytics: {
    promotionTransactions: 0,
    loyaltyTransactions: 0,
    discountedTransactions: 0,
    promotionSavings: 0,
    loyaltySavings: 0,
    totalSavings: 0,
    discountedGrossSales: 0,
    discountedNetSales: 0,
    promotions: [],
  },
  inventoryAnalytics: {
    snapshot: {
      products: 0,
      unitsOnHand: 0,
      inStock: 0,
      lowStock: 0,
      outOfStock: 0,
      needsAttention: 0,
    },
    categoryStock: [],
    movementTrend: [],
    totalStockIn: 0,
    totalStockOut: 0,
    attentionItems: [],
  },
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

  const date = new Date(
    `${String(value).slice(0, 10)}T00:00:00Z`
  )

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

const chartColors = ["#7e22ce", "#c084fc", "#a78bfa", "#f59e0b", "#10b981", "#64748b", "#ec4899"]

function BreakdownDonut({ data, labelKey, valueKey = "revenue", formatValue = money, emptyText = "No data for this period." }) {
  const rows = data.filter((item) => Number(item[valueKey]) > 0)
  if (!rows.length) return <ChartEmpty>{emptyText}</ChartEmpty>
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={rows} dataKey={valueKey} nameKey={labelKey} cx="50%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={rows.length > 1 ? 2 : 0}>
          {rows.map((item, index) => <Cell key={String(item[labelKey])} fill={chartColors[index % chartColors.length]} />)}
        </Pie>
        <Tooltip formatter={(value, name) => [formatValue(value), name]} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function RankedBarChart({ data, labelKey, valueKey, formatValue = (value) => value, emptyText = "No data for this period.", maxItems = 10 }) {
  const rows = [...data].sort((a, b) => Number(b[valueKey]) - Number(a[valueKey])).slice(0, maxItems)
  if (!rows.length) return <ChartEmpty>{emptyText}</ChartEmpty>
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 25, bottom: 8, left: 10 }}>
        <CartesianGrid stroke="#eee8f3" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey={labelKey} width={155} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(value) => [formatValue(value), "Value"]} />
        <Bar dataKey={valueKey} fill="#7e22ce" radius={[0, 6, 6, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  )
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
    (a, b) =>
      Number(b.sales || 0) - Number(a.sales || 0)
  )[0]

  const insights = [
    `Total paid sales for the selected period were ${money(report.sales)} across ${report.transactions} paid transactions.`,
    `The average value per paid transaction was ${money(report.averageSale)}.`,
    `${report.appointments} active appointments were recorded during the selected period.`,
  ]

  const inventory = report.inventoryAnalytics

  insights.push(
    `Current inventory contains ${inventory.snapshot.unitsOnHand} units across ${inventory.snapshot.products} products; ${inventory.snapshot.needsAttention} product(s) need stock attention.`,
    `During the selected period, ${inventory.totalStockIn} units were recorded as stock in and ${inventory.totalStockOut} units as stock out.`
  )

  if (topService) {
    insights.push(
      `The leading requested service was ${topService.service}, with ${topService.count} recorded request(s).`
    )
  }

  if (
    highestSalesDay &&
    Number(highestSalesDay.sales) > 0
  ) {
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
          <p>
            Generated through InsightGlow Management System
          </p>
          <p>
            Reporting Period: {report.periodLabel}
          </p>
          <p>
            {longDate(report.periodStart)} –{" "}
            {longDate(report.periodEnd)}
          </p>
          <p>
            Generated: {generatedAt} (Philippine Time)
          </p>
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

        <div className="stylesync-print-chart">
          {report.salesTrend.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={report.salesTrend}>
                <CartesianGrid stroke="#eee8f3" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip formatter={(value) => money(value)} />
                <Line dataKey="sales" name="Paid Sales" type="monotone" stroke="#7e22ce" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <ChartEmpty>No sales data.</ChartEmpty>}
        </div>
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
                <td colSpan={3}>
                  No recorded sales activity.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="stylesync-print-section">
        <h3>3. Appointment Status Analysis</h3>

        <div className="stylesync-print-chart">
          {report.appointmentStatus.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.appointmentStatus}>
                <XAxis dataKey="status" tick={{ fontSize: 9 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 9 }} />
                <Bar dataKey="count" name="Appointments" fill="#ec4899" />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmpty>No appointment data.</ChartEmpty>}
        </div>
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
                <td colSpan={2}>
                  No appointment records.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <p className="stylesync-print-note">
          Unpaid reservation holds are excluded from
          appointment status analysis.
        </p>
      </section>

      <section className="stylesync-print-section">
        <h3>4. Most Requested Services</h3>

        <div className="stylesync-print-chart">
          {report.mostRequestedServices.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.mostRequestedServices} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 9 }} />
                <YAxis type="category" dataKey="service" width={115} tick={{ fontSize: 9 }} />
                <Bar dataKey="count" name="Requests" fill="#7e22ce" />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmpty>No service requests.</ChartEmpty>}
        </div>
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
                <td colSpan={2}>
                  No service requests recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="stylesync-print-section">
        <h3>5. Daily Activity Summary</h3>

        <div className="stylesync-print-chart">
          {rows.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows}>
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 9 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 9 }} />
                <Bar dataKey="transactions" name="Transactions" fill="#9333ea" />
                <Bar dataKey="appointments" name="Appointments" fill="#ec4899" />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmpty>No daily activity.</ChartEmpty>}
        </div>
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
                <td colSpan={5}>
                  No activity for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="stylesync-print-section">
        <h3>6. Inventory Analytics</h3>

        <p className="stylesync-print-note">
          Stock quantities are a current snapshot.
          Stock movement totals cover the selected
          report period.
        </p>

        <div className="stylesync-print-kpis">
          <div>
            <span>Products</span>
            <strong>
              {inventory.snapshot.products}
            </strong>
          </div>

          <div>
            <span>Units on Hand</span>
            <strong>
              {inventory.snapshot.unitsOnHand}
            </strong>
          </div>

          <div>
            <span>Needs Attention</span>
            <strong>
              {inventory.snapshot.needsAttention}
            </strong>
          </div>

          <div>
            <span>Stock In / Out</span>
            <strong>
              {inventory.totalStockIn} /{" "}
              {inventory.totalStockOut}
            </strong>
          </div>
        </div>

        <h4>Stock by Category</h4>

        <div className="stylesync-print-chart">
          {inventory.categoryStock.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={inventory.categoryStock} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 9 }} />
                <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 9 }} />
                <Bar dataKey="units" name="Units" fill="#9333ea" />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmpty>No inventory categories.</ChartEmpty>}
        </div>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Products</th>
              <th>Units on Hand</th>
            </tr>
          </thead>

          <tbody>
            {inventory.categoryStock.length ? (
              inventory.categoryStock.map((row) => (
                <tr key={row.category}>
                  <td>{row.category}</td>
                  <td>{row.products}</td>
                  <td>{row.units}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3}>
                  No inventory products recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <h4>Product Stock Status</h4>
        <div className="stylesync-print-chart">
          {inventory.snapshot.products ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { status: "In Stock", count: Number(inventory.snapshot.inStock || 0) },
                { status: "Low Stock", count: Number(inventory.snapshot.lowStock || 0) },
                { status: "Out of Stock", count: Number(inventory.snapshot.outOfStock || 0) },
              ]}>
                <XAxis dataKey="status" tick={{ fontSize: 9 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 9 }} />
                <Bar dataKey="count" fill="#7e22ce" />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmpty>No inventory status data.</ChartEmpty>}
        </div>
        <table>
          <thead><tr><th>Status</th><th>Products</th></tr></thead>
          <tbody>
            <tr><td>In Stock</td><td>{inventory.snapshot.inStock}</td></tr>
            <tr><td>Low Stock</td><td>{inventory.snapshot.lowStock}</td></tr>
            <tr><td>Out of Stock</td><td>{inventory.snapshot.outOfStock}</td></tr>
          </tbody>
        </table>

        <h4>Stock Movement by Date</h4>
        <div className="stylesync-print-chart">
          {inventory.movementTrend.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={inventory.movementTrend}>
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 9 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 9 }} />
                <Bar dataKey="stockIn" name="Stock In" fill="#9333ea" />
                <Bar dataKey="stockOut" name="Stock Out" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmpty>No stock movements.</ChartEmpty>}
        </div>
        <table>
          <thead><tr><th>Date</th><th>Stock In</th><th>Stock Out</th></tr></thead>
          <tbody>
            {inventory.movementTrend.length ? inventory.movementTrend.map((row) => (
              <tr key={row.date}>
                <td>{longDate(row.date)}</td>
                <td>{Number(row.stockIn || 0)}</td>
                <td>{Number(row.stockOut || 0)}</td>
              </tr>
            )) : <tr><td colSpan={3}>No stock movements recorded.</td></tr>}
          </tbody>
        </table>

        <h4>Products Requiring Attention</h4>

        <div className="stylesync-print-chart">
          {inventory.attentionItems.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={inventory.attentionItems} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 9 }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9 }} />
                <Bar dataKey="stock" name="Current Stock" fill="#9333ea" />
                <Bar dataKey="alertLevel" name="Reorder Level" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmpty>No products need attention.</ChartEmpty>}
        </div>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Reorder Level</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {inventory.attentionItems.length ? (
              inventory.attentionItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.category}</td>
                  <td>{item.stock}</td>
                  <td>{item.alertLevel}</td>
                  <td>{item.status}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>
                  No products currently need restocking.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="stylesync-print-section">
        <h3>7. Management Insights</h3>

        <ul>
          {insights.map((insight, index) => (
            <li key={index}>{insight}</li>
          ))}
        </ul>

        <p className="stylesync-print-note">
          These insights summarize recorded business
          activity and do not represent forecasts
          or predictions.
        </p>
      </section>

      <footer className="stylesync-print-footer">
        <p>
          Prepared for Dahling's Salon and Spa
        </p>
        <p>
          Generated by StyleSync | Internal Management Report
        </p>
      </footer>
    </article>
  )
}

function ReportCategoryIcon({ name }) {
  const paths = {
    sales: <><path d="M4 19V11h4v8" /><path d="M10 19V7h4v12" /><path d="M16 19V4h4v15" /><path d="M3 21h18" /></>,
    appointments: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /><path d="M8 14h3v3H8z" /></>,
    services: <><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><path d="M8 8l11 11M8 16L19 5M14 10l5-5" /></>,
    discounts: <><path d="M12 2l9 9v6l-6 5-12-12V4a2 2 0 0 1 2-2z" /><circle cx="7.5" cy="7.5" r="1" /></>,
    inventory: <><path d="M12 2 21 7v10l-9 5-9-5V7z" /><path d="m3 7 9 5 9-5M12 12v10" /></>,
  }
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
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
  const [attentionSearch, setAttentionSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("sales")

  const selectedValue = filters[period]

  const dayOptions = useMemo(
    () =>
      Array.from(
        { length: 31 },
        (_, index) => addDays(today, -index)
      ),
    [today]
  )

  const weekOptions = useMemo(
    () =>
      Array.from(
        { length: 12 },
        (_, index) =>
          addDays(mondayOf(today), -7 * index)
      ),
    [today]
  )

  const yearOptions = useMemo(
    () =>
      Array.from(
        { length: 5 },
        (_, index) => currentYear - index
      ),
    [currentYear]
  )

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1).padStart(2, "0")
        const value =
          `${filters.monthly.slice(0, 4)}-${month}`

        return {
          value,
          label: formatDate(`${value}-01`, {
            month: "long",
          }),
        }
      }),
    [filters.monthly]
  )

  const loadReport = useCallback(
    async (selectedPeriod, selectedValue, signal) => {
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

        params.set(
          queryNames[selectedPeriod],
          selectedValue
        )

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

        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data)
        ) {
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

            appointmentStatus: Array.isArray(
              data.appointmentStatus
            )
              ? data.appointmentStatus.map((item) => ({
                  ...item,
                  count: Number(item.count || 0),
                }))
              : [],

            appointmentAnalytics: {
              totals: { ...emptyReport.appointmentAnalytics.totals,
                ...(data.appointmentAnalytics?.totals || {}) },
              cancellations: Array.isArray(data.appointmentAnalytics?.cancellations)
                ? data.appointmentAnalytics.cancellations : [],
              dailyBookings: Array.isArray(data.appointmentAnalytics?.dailyBookings)
                ? data.appointmentAnalytics.dailyBookings : [],
            },
            salesAnalytics: {
              ...emptyReport.salesAnalytics,
              ...(data.salesAnalytics || {}),
              previousPeriod: {
                ...emptyReport.salesAnalytics.previousPeriod,
                ...(data.salesAnalytics?.previousPeriod || {}),
              },
              salesByType: Array.isArray(data.salesAnalytics?.salesByType) ? data.salesAnalytics.salesByType : [],
              paymentBreakdown: Array.isArray(data.salesAnalytics?.paymentBreakdown) ? data.salesAnalytics.paymentBreakdown : [],
              topSellingServices: Array.isArray(data.salesAnalytics?.topSellingServices) ? data.salesAnalytics.topSellingServices : [],
            },
            discountAnalytics: {
              ...emptyReport.discountAnalytics,
              ...(data.discountAnalytics || {}),
              promotions: Array.isArray(data.discountAnalytics?.promotions)
                ? data.discountAnalytics.promotions
                : [],
            },
            inventoryAnalytics: {
              ...emptyReport.inventoryAnalytics,
              ...(data.inventoryAnalytics || {}),

              snapshot: {
                ...emptyReport.inventoryAnalytics.snapshot,
                ...(data.inventoryAnalytics?.snapshot || {}),
              },

              categoryStock: Array.isArray(
                data.inventoryAnalytics?.categoryStock
              )
                ? data.inventoryAnalytics.categoryStock
                : [],

              movementTrend: Array.isArray(
                data.inventoryAnalytics?.movementTrend
              )
                ? data.inventoryAnalytics.movementTrend.map(
                    (row) => ({
                      ...row,
                      dateLabel: shortDate(row.date),
                      stockIn: Number(row.stockIn || 0),
                      stockOut: Number(row.stockOut || 0),
                    })
                  )
                : [],

              attentionItems: Array.isArray(
                data.inventoryAnalytics?.attentionItems
              )
                ? data.inventoryAnalytics.attentionItems
                : [],
            },

            serviceAnalytics: {
              catalog: {
                ...emptyReport.serviceAnalytics.catalog,
                ...(data.serviceAnalytics?.catalog || {}),
              },
              categories: Array.isArray(data.serviceAnalytics?.categories)
                ? data.serviceAnalytics.categories : [],
              paidServices: Array.isArray(data.serviceAnalytics?.paidServices)
                ? data.serviceAnalytics.paidServices : [],
              requestedServices: Array.isArray(data.serviceAnalytics?.requestedServices)
                ? data.serviceAnalytics.requestedServices : [],
            },
            mostRequestedServices: Array.isArray(
              data.mostRequestedServices
            )
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

  const inventory = report.inventoryAnalytics

  const stockStatuses = [
    {
      name: "In Stock",
      value: inventory.snapshot.inStock,
      fill: "#7e22ce",
    },
    {
      name: "Low Stock",
      value: inventory.snapshot.lowStock,
      fill: "#f59e0b",
    },
    {
      name: "Out of Stock",
      value: inventory.snapshot.outOfStock,
      fill: "#ef4444",
    },
  ]

  const hasStockMovement = inventory.movementTrend.some(
    (row) => row.stockIn > 0 || row.stockOut > 0
  )

  const categoryChartData =
    inventory.categoryStock.length > 8
      ? [
          ...inventory.categoryStock.slice(0, 7),
          {
            category: "Other categories",
            units: inventory.categoryStock
              .slice(7)
              .reduce(
                (sum, row) =>
                  sum + Number(row.units || 0),
                0
              ),
            products: inventory.categoryStock
              .slice(7)
              .reduce(
                (sum, row) =>
                  sum + Number(row.products || 0),
                0
              ),
          },
        ]
      : inventory.categoryStock

  const attentionItems = inventory.attentionItems.filter(
    (item) =>
      `${item.name} ${item.category} ${item.status}`
        .toLowerCase()
        .includes(attentionSearch.toLowerCase().trim())
  )

  const inventoryCards = [
    {
      label: "Products",
      value: inventory.snapshot.products,
      note: "Current inventory records",
    },
    {
      label: "Units on Hand",
      value: inventory.snapshot.unitsOnHand,
      note: "Total available quantity",
    },
    {
      label: "Needs Attention",
      value: inventory.snapshot.needsAttention,
      note: "Low-stock and out-of-stock products",
    },
    {
      label: "Stock In / Out",
      value: `${inventory.totalStockIn} / ${inventory.totalStockOut}`,
      note: `Units moved · ${report.periodLabel}`,
    },
  ]

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

            .stylesync-print-section h4 {
              margin: 14px 0 7px;
              color: #581c87;
              font-size: 11px;
              font-weight: 700;
            }

            .stylesync-print-chart {
              width: 100%;
              height: 175px;
              margin: 10px 0 12px;
              break-inside: avoid;
              page-break-inside: avoid;
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
              Review recorded sales, appointments,
              services, and inventory activity.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                loadReport(period, selectedValue)
              }
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
              onClick={() =>
                loadReport(period, selectedValue)
              }
              className="ml-3 font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* CATEGORY NAVIGATION */}
        <nav aria-label="Report categories" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { id: "sales", title: "Sales", description: "Revenue & transactions", icon: "sales" },
            { id: "appointments", title: "Appointments", description: "Booking activity", icon: "appointments" },
            { id: "services", title: "Services", description: "Service performance", icon: "services" },
            { id: "discounts", title: "Promotions & Discounts", description: "Promo & loyalty analytics", icon: "discounts" },
            { id: "inventory", title: "Inventory", description: "Stock & inventory", icon: "inventory" },
          ].map((category) => {
            const selected = activeCategory === category.id
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                aria-pressed={selected}
                className={`group relative flex min-h-[88px] items-center gap-3 rounded-2xl border px-3 py-4 text-left shadow-sm transform-gpu transition-all duration-200 ease-out hover:z-10 hover:-translate-y-1 hover:scale-[1.03] hover:border-purple-300 hover:bg-purple-50 hover:shadow-lg hover:shadow-purple-100/70 active:scale-[1.01] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 motion-reduce:transform-none motion-reduce:transition-none ${
                  selected
                    ? "border-purple-300 bg-gradient-to-br from-purple-100 via-purple-50 to-fuchsia-100 shadow-md shadow-purple-100"
                    : "border-gray-100 bg-white"
                }`}
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${selected ? "bg-purple-200 text-purple-800" : "bg-purple-50 text-purple-800 group-hover:bg-purple-100"}`} aria-hidden="true">
                  <ReportCategoryIcon name={category.icon} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold leading-snug text-purple-950">{category.title}</span>
                  <span className="mt-1 block text-[11px] leading-snug text-gray-500">{category.description}</span>
                </span>
                {selected && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-purple-700" />}
              </button>
            )
          })}
        </nav>

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
                  <span className="mb-2 block">
                    Select day
                  </span>

                  <select
                    value={filters.daily}
                    onChange={(event) =>
                      updateFilter(event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5"
                  >
                    {dayOptions.map((value) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {value === today
                          ? "Today — "
                          : ""}
                        {longDate(value)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {period === "weekly" && (
                <label className="min-w-[260px] text-sm font-medium text-gray-700">
                  <span className="mb-2 block">
                    Select week
                  </span>

                  <select
                    value={filters.weekly}
                    onChange={(event) =>
                      updateFilter(event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5"
                  >
                    {weekOptions.map(
                      (value, index) => (
                        <option
                          key={value}
                          value={value}
                        >
                          {index === 0
                            ? "This week — "
                            : ""}
                          {shortDate(value)} –{" "}
                          {longDate(
                            addDays(value, 6)
                          )}
                        </option>
                      )
                    )}
                  </select>
                </label>
              )}

              {period === "monthly" && (
                <>
                  <label className="min-w-[180px] text-sm font-medium text-gray-700">
                    <span className="mb-2 block">
                      Select month
                    </span>

                    <select
                      value={filters.monthly}
                      onChange={(event) =>
                        updateFilter(
                          event.target.value
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5"
                    >
                      {monthOptions.map(
                        (option) => (
                          <option
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label className="min-w-[120px] text-sm font-medium text-gray-700">
                    <span className="mb-2 block">
                      Year
                    </span>

                    <select
                      value={filters.monthly.slice(
                        0,
                        4
                      )}
                      onChange={(event) =>
                        updateMonthYear(
                          event.target.value
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5"
                    >
                      {yearOptions.map(
                        (year) => (
                          <option
                            key={year}
                            value={year}
                          >
                            {year}
                          </option>
                        )
                      )}
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
              <span className="ml-2">
                Loading…
              </span>
            )}
          </p>
        </section>


        {activeCategory === "sales" && (
          <>
        {/* OVERVIEW CARDS */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

          </>
        )}

        {activeCategory === "sales" && (
          <>
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

          </>
        )}

        {activeCategory === "sales" && (
          <>
            <section className={`${panel} p-5 md:p-6`}>
              <h2 className="text-lg font-bold text-purple-950">Sales Performance Comparison</h2>
              <p className="mt-1 text-xs text-gray-500">Selected period compared with the immediately preceding period of the same length.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-purple-50 p-4">
                  <p className="text-xs text-purple-700">Current period</p>
                  <p className="mt-2 text-xl font-bold text-purple-950">{money(report.sales)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-600">Previous period</p>
                  <p className="mt-2 text-xl font-bold text-gray-900">{money(report.salesAnalytics.previousPeriod.sales)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-600">Revenue change</p>
                  <p className={`mt-2 text-xl font-bold ${Number(report.sales) - Number(report.salesAnalytics.previousPeriod.sales) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {Number(report.sales) - Number(report.salesAnalytics.previousPeriod.sales) > 0 ? "+" : ""}{money(Number(report.sales) - Number(report.salesAnalytics.previousPeriod.sales))}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {Number(report.salesAnalytics.previousPeriod.sales) > 0
                      ? `${((Number(report.sales) - Number(report.salesAnalytics.previousPeriod.sales)) / Number(report.salesAnalytics.previousPeriod.sales) * 100).toFixed(1)}% vs previous period`
                      : "Percentage unavailable without previous-period sales"}
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <article className={`${panel} p-5 md:p-6`}>
                <h2 className="text-lg font-bold text-purple-950">Sales by Type</h2>
                <p className="mt-1 text-xs text-gray-500">Paid service and product sales for the selected period.</p>
                <div className="mt-4 h-56"><BreakdownDonut data={report.salesAnalytics.salesByType} labelKey="saleType" /></div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-gray-500"><th className="py-3">Sale type</th><th className="py-3 text-right">Transactions</th><th className="py-3 text-right">Revenue</th></tr></thead>
                    <tbody>{report.salesAnalytics.salesByType.length ? report.salesAnalytics.salesByType.map((item) => (
                      <tr key={item.saleType} className="border-b border-gray-100"><td className="py-3">{item.saleType}</td><td className="py-3 text-right">{item.transactions}</td><td className="py-3 text-right">{money(item.revenue)}</td></tr>
                    )) : <tr><td colSpan={3} className="py-5 text-center text-gray-500">No paid sales in this period.</td></tr>}</tbody>
                  </table>
                </div>
              </article>
              <article className={`${panel} p-5 md:p-6`}>
                <h2 className="text-lg font-bold text-purple-950">Payment Method Breakdown</h2>
                <p className="mt-1 text-xs text-gray-500">Payment method saved on each paid transaction; booking deposits are not counted again.</p>
                <div className="mt-4 h-56"><BreakdownDonut data={report.salesAnalytics.paymentBreakdown} labelKey="paymentMethod" /></div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-gray-500"><th className="py-3">Method</th><th className="py-3 text-right">Transactions</th><th className="py-3 text-right">Revenue</th></tr></thead>
                    <tbody>{report.salesAnalytics.paymentBreakdown.length ? report.salesAnalytics.paymentBreakdown.map((item) => (
                      <tr key={item.paymentMethod} className="border-b border-gray-100"><td className="py-3">{item.paymentMethod}</td><td className="py-3 text-right">{item.transactions}</td><td className="py-3 text-right">{money(item.revenue)}</td></tr>
                    )) : <tr><td colSpan={3} className="py-5 text-center text-gray-500">No payment data for this period.</td></tr>}</tbody>
                  </table>
                </div>
              </article>
            </section>

            <section className={`${panel} p-5 md:p-6`}>
              <h2 className="text-lg font-bold text-purple-950">Top-Selling Services by Revenue</h2>
              <p className="mt-1 text-xs text-gray-500">Based on paid service transactions, not appointment requests. Product sales are excluded.</p>
              <div className="mt-4 h-80"><RankedBarChart data={report.salesAnalytics.topSellingServices} labelKey="service" valueKey="revenue" formatValue={money} /></div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-gray-500"><th className="py-3">Service</th><th className="py-3 text-right">Paid transactions</th><th className="py-3 text-right">Quantity</th><th className="py-3 text-right">Revenue</th></tr></thead>
                  <tbody>{report.salesAnalytics.topSellingServices.length ? report.salesAnalytics.topSellingServices.map((item) => (
                    <tr key={item.service} className="border-b border-gray-100"><td className="py-3">{item.service}</td><td className="py-3 text-right">{item.transactions}</td><td className="py-3 text-right">{item.quantity}</td><td className="py-3 text-right font-medium text-purple-800">{money(item.revenue)}</td></tr>
                  )) : <tr><td colSpan={4} className="py-5 text-center text-gray-500">No paid service sales in this period.</td></tr>}</tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* SALES AND APPOINTMENT CHARTS */}
        <section className="grid gap-6">

          {/* SALES CHART */}
          {activeCategory === "sales" && (
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

            {/* PAID SALES DATA TABLE */}
        <div className="mt-6 overflow-x-auto border-t border-purple-100 pt-5">
            <h3 className="mb-3 text-sm font-bold text-purple-950">
        Paid Sales — Data Table
            </h3>

            <table className="w-full text-left text-sm">
            <thead className="bg-purple-50 text-purple-950">
            <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Paid Sales</th>
            </tr>
        </thead>

        <tbody>
            {report.salesTrend.length ? (
                report.salesTrend.map((row) => (
                    <tr
                        key={row.date}
                        className="border-b border-gray-100"
                    >
                        <td className="px-4 py-3">
                            {longDate(row.date)}
                        </td>
                        <td className="px-4 py-3 text-right">
                            {money(row.sales)}
                        </td>
                    </tr>
                ))
            ) : (
                <tr>
                    <td colSpan={2} className="px-4 py-4 text-center text-gray-500">
                        No sales data available.
                    </td>
                </tr>
            )}
        </tbody>
    </table>
</div>
          </article>

          )}
          {/* APPOINTMENT ANALYTICS — all booking records, including expired holds */}
          {activeCategory === "appointments" && (
            <section className="space-y-5">
              <div className={`${panel} p-5 md:p-6`}>
                <h2 className="text-lg font-bold text-purple-950">Booking Overview — {report.periodLabel}</h2>
                <p className="mt-1 text-xs text-gray-500">Based on scheduled appointment dates. Includes unpaid holds and expired reservations.</p>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[
                    ["Total Booking Records", "totalBookings"],
                    ["Approved", "approved"],
                    ["Completed", "completed"],
                    ["Pending Review", "pending"],
                    ["Declined", "declined"],
                    ["Cancelled", "cancelled"],
                    ["Reschedule Suggestions", "rescheduleSuggestions"],
                  ].map(([label, key]) => (
                    <div key={key} className="rounded-xl border border-purple-100 bg-purple-50/40 p-4">
                      <p className="text-xs text-gray-600">{label}</p>
                      <p className="mt-2 text-2xl font-bold text-purple-950">
                        {report.appointmentAnalytics.totals[key] || 0}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 border-t border-purple-100 pt-4">
                  <h3 className="text-sm font-semibold text-purple-950">Booking Status Distribution</h3>
                  <p className="mt-1 text-xs text-gray-500">Counts by current booking status, including payment holds. Reschedule suggestions are already included in declined bookings.</p>
                  <div className="h-60">
                    <BreakdownDonut
                      data={[
                        ["Approved", "approved"], ["Completed", "completed"], ["Pending", "pending"],
                        ["Pending Validation", "pendingValidation"], ["Awaiting Payment", "awaitingPayment"],
                        ["Declined", "declined"], ["Cancelled", "cancelled"],
                      ].map(([status, key]) => ({ status, count: report.appointmentAnalytics.totals[key] || 0 }))}
                      labelKey="status"
                      valueKey="count"
                      formatValue={(value) => `${value} bookings`}
                    />
                  </div>
                  <p className="text-xs text-gray-500">The booking cards above provide the exact counts; this chart shows their relative proportions.</p>
                </div>
                <p className="mt-3 text-xs text-gray-500">Awaiting Payment: {report.appointmentAnalytics.totals.awaitingPayment} · Pending Validation: {report.appointmentAnalytics.totals.pendingValidation}. Reschedule suggestions are declined bookings with an alternative date and time, not confirmed reschedules.</p>
              </div>
              <div className={`${panel} p-5 md:p-6`}>
                <h2 className="text-lg font-bold text-purple-950">Booking Trends by Scheduled Date</h2>
                <div className="mt-4 h-64">
                  {report.appointmentAnalytics.dailyBookings.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={report.appointmentAnalytics.dailyBookings}>
                        <CartesianGrid stroke="#eee8f3" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="total" name="Bookings" stroke="#9333ea" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <ChartEmpty>No booking records in this period.</ChartEmpty>}
                </div>
              </div>
              <div className={`${panel} p-5 md:p-6`}>
                <h2 className="text-lg font-bold text-purple-950">Cancellation Reasons</h2>
                <p className="mt-1 text-xs text-gray-500">Expired payment windows mean the deposit was not submitted in StyleSync before the 15-minute deadline; this does not prove no GCash transfer occurred.</p>
                <div className="mt-4 h-60"><RankedBarChart data={report.appointmentAnalytics.cancellations} labelKey="reason" valueKey="count" formatValue={(v) => `${v} bookings`} /></div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-purple-50"><tr><th className="px-4 py-3">Reason</th><th className="px-4 py-3 text-right">Bookings</th></tr></thead>
                    <tbody>{report.appointmentAnalytics.cancellations.length
                      ? report.appointmentAnalytics.cancellations.map(row => (
                        <tr key={row.reason} className="border-b border-gray-100"><td className="px-4 py-3">{row.reason}</td><td className="px-4 py-3 text-right">{row.count}</td></tr>
                      ))
                      : <tr><td colSpan={2} className="px-4 py-4 text-center text-gray-500">No cancellations in this period.</td></tr>}</tbody>
                  </table>
                </div>
              </div>
              <div className={`${panel} p-5 md:p-6`}>
                <h2 className="text-lg font-bold text-purple-950">Daily Booking Breakdown</h2>
                <p className="mt-1 text-xs text-gray-500">Peak day: {(() => {
                  const rows = report.appointmentAnalytics.dailyBookings
                  if (!rows.length) return "No data"
                  const peak = [...rows].sort((a,b) => b.total - a.total || a.date.localeCompare(b.date))[0]
                  return `${peak.date} (${peak.total} bookings)`
                })()}</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-purple-50"><tr>{["Date","Total","Approved","Completed","Declined","Cancelled"].map(h => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
                    <tbody>{report.appointmentAnalytics.dailyBookings.length
                      ? report.appointmentAnalytics.dailyBookings.map(row => (
                        <tr key={row.date} className="border-b border-gray-100">{[row.date,row.total,row.approved,row.completed,row.declined,row.cancelled].map((v,i) => <td key={i} className="px-3 py-3">{v}</td>)}</tr>
                      ))
                      : <tr><td colSpan={6} className="px-4 py-4 text-center text-gray-500">No bookings in this period.</td></tr>}</tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
          {/* APPOINTMENT STATUS CHART */}
          {activeCategory === "appointments" && (
          <article className={`${panel} p-5 md:p-6`}>
            <h2 className="text-lg font-bold text-purple-950">
              Appointment Status — {report.periodLabel}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Includes all recorded statuses, including expired reservations. Awaiting Payment is excluded only from this existing chart.
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

            {/* APPOINTMENT STATUS DATA TABLE */}
        <div className="mt-6 overflow-x-auto border-t border-purple-100 pt-5">
    <h3 className="mb-3 text-sm font-bold text-purple-950">
        Appointment Status — Data Table
    </h3>

    <table className="w-full text-left text-sm">
        <thead className="bg-purple-50 text-purple-950">
            <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Appointments</th>
            </tr>
        </thead>

        <tbody>
            {report.appointmentStatus.length ? (
                report.appointmentStatus.map((row) => (
                    <tr
                        key={row.status}
                        className="border-b border-gray-100"
                    >
                        <td className="px-4 py-3">{row.status}</td>
                        <td className="px-4 py-3 text-right">
                            {row.count}
                        </td>
                    </tr>
                ))
            ) : (
                <tr>
                    <td colSpan={2} className="px-4 py-4 text-center text-gray-500">
                        No appointment records available.
                    </td>
                </tr>
            )}
                    </tbody>
            </table>
                </div>
          </article>
          )}
        </section>

        {activeCategory === "services" && (
          <>
        <section className="grid gap-4 md:grid-cols-3">
          {[
            ["Catalog Services", report.serviceAnalytics.catalog.totalServices],
            ["Available Services", report.serviceAnalytics.catalog.availableServices],
            ["Unavailable Services", report.serviceAnalytics.catalog.unavailableServices],
          ].map(([label, value]) => (
            <article key={label} className={`${panel} p-5`}>
              <p className="text-sm text-gray-500">{label}</p>
              <p className="mt-2 text-3xl font-bold text-purple-950">{value}</p>
            </article>
          ))}
        </section>
        <p className="text-xs text-gray-500">Service catalog counts reflect current records, regardless of the selected reporting period.</p>

        <section className={`${panel} p-5 md:p-6`}>
          <h2 className="text-lg font-bold text-purple-950">Service Categories — Current Catalog</h2>
          <p className="mt-1 text-xs text-gray-500">Number of services per catalog category; current snapshot, not historical demand.</p>
          <div className="mt-4 h-72"><RankedBarChart data={report.serviceAnalytics.categories} labelKey="category" valueKey="services" formatValue={(v) => `${v} services`} maxItems={20} /></div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-purple-50 text-purple-950"><tr><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Services</th><th className="px-4 py-3 text-right">Available</th></tr></thead>
              <tbody>{report.serviceAnalytics.categories.length ? report.serviceAnalytics.categories.map(row => (
                <tr key={row.category} className="border-b border-gray-100"><td className="px-4 py-3">{row.category}</td><td className="px-4 py-3 text-right">{row.services}</td><td className="px-4 py-3 text-right">{row.available}</td></tr>
              )) : <tr><td colSpan={3} className="px-4 py-4 text-center text-gray-500">No services in the catalog.</td></tr>}</tbody>
            </table>
          </div>
        </section>

        <section className={`${panel} p-5 md:p-6`}>
          <h2 className="text-lg font-bold text-purple-950">Paid Service Performance — {report.periodLabel}</h2>
          <p className="mt-1 text-xs text-gray-500">Only paid service transactions; product sales are excluded. Revenue uses final discounted amounts.</p>
          <p className="mt-1 text-xs text-gray-500">Chart shows the 10 highest-revenue services; the table lists all recorded paid services.</p>
          <div className="mt-4 h-80"><RankedBarChart data={report.serviceAnalytics.paidServices} labelKey="service" valueKey="revenue" formatValue={money} /></div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-purple-50 text-purple-950"><tr><th className="px-4 py-3">Service</th><th className="px-4 py-3 text-right">Paid Transactions</th><th className="px-4 py-3 text-right">Units</th><th className="px-4 py-3 text-right">Revenue</th></tr></thead>
              <tbody>{report.serviceAnalytics.paidServices.length ? report.serviceAnalytics.paidServices.map(row => (
                <tr key={row.service} className="border-b border-gray-100"><td className="px-4 py-3">{row.service}</td><td className="px-4 py-3 text-right">{row.paidTransactions}</td><td className="px-4 py-3 text-right">{row.unitsSold}</td><td className="px-4 py-3 text-right">{money(row.revenue)}</td></tr>
              )) : <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-500">No paid services for the selected period.</td></tr>}</tbody>
            </table>
          </div>
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
                    {/* MOST REQUESTED SERVICES DATA TABLE */}
            <div className="mt-6 overflow-x-auto border-t border-purple-100 pt-5">
            <h3 className="mb-3 text-sm font-bold text-purple-950">
        Most Requested Services — Data Table
    </h3>

            <table className="w-full text-left text-sm">
        <thead className="bg-purple-50 text-purple-950">
            <tr>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3 text-right">Requests</th>
            </tr>
        </thead>

        <tbody>
            {report.mostRequestedServices.length ? (
                report.mostRequestedServices.map((row) => (
                    <tr
                        key={row.service}
                        className="border-b border-gray-100"
                    >
                        <td className="px-4 py-3">{row.service}</td>
                        <td className="px-4 py-3 text-right">
                            {row.count}
                        </td>
                    </tr>
                ))
            ) : (
                <tr>
                    <td colSpan={2} className="px-4 py-4 text-center text-gray-500">
                        No service requests available.
                    </td>
                </tr>
            )}
                    </tbody>
                </table>
            </div>
        </section>

          </>
        )}

        {activeCategory === "appointments" && (
          <>
        {/* ACTIVITY BY DATE — CHART AND TABLE */}
<section className={`${panel} overflow-hidden`}>

    {/* ACTIVITY CHART */}
    <div className="border-b border-purple-100 p-5 md:p-6">
        <h3 className="text-lg font-bold text-purple-950">
            Daily Activity Comparison — {report.periodLabel}
        </h3>

        <p className="mt-1 text-xs text-gray-500">
            Comparison of paid transactions and recorded appointments
            for each date in the selected period.
        </p>

        <div className="mt-5 h-72">
            {!report.summary.length ? (
                <ChartEmpty>
                    No activity recorded for the selected period.
                </ChartEmpty>
            ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={report.summary}
                        margin={{
                            top: 10,
                            right: 20,
                            left: 0,
                            bottom: 5,
                        }}
                    >
                        <CartesianGrid
                            stroke="#eee8f3"
                            strokeDasharray="3 3"
                            vertical={false}
                        />

                        <XAxis
                            dataKey="date"
                            tickFormatter={shortDate}
                            tick={{ fontSize: 11 }}
                            interval={
                                period === "monthly" ? 4 : 0
                            }
                        />

                        <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 12 }}
                        />

                        <Tooltip
                            labelFormatter={longDate}
                        />

                        <Bar
                            dataKey="transactions"
                            name="Paid Transactions"
                            fill="#9333ea"
                            radius={[5, 5, 0, 0]}
                            maxBarSize={24}
                        />

                        <Bar
                            dataKey="appointments"
                            name="Appointments"
                            fill="#ec4899"
                            radius={[5, 5, 0, 0]}
                            maxBarSize={24}
                        />
                    </BarChart>
                </ResponsiveContainer>
            )}
        </div>

        <div className="mt-4 flex flex-wrap gap-5 text-xs text-gray-600">
            <span>
                <span className="mr-2 inline-block h-3 w-3 rounded-sm bg-purple-600" />
                Paid Transactions
            </span>

            <span>
                <span className="mr-2 inline-block h-3 w-3 rounded-sm bg-pink-500" />
                Appointments
            </span>
        </div>
    </div>
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

          </>
        )}

        {activeCategory === "inventory" && (
          <>
        {/* INVENTORY ANALYTICS */}
        <section
          className="space-y-5"
          aria-labelledby="inventory-analytics-heading"
        >
          <div className="border-t border-purple-100 pt-7">
            <p className="text-xs font-semibold uppercase tracking-widest text-purple-500">
              Inventory Intelligence
            </p>
            <h2
              id="inventory-analytics-heading"
              className="mt-1 text-2xl font-bold text-purple-950"
            >
              Inventory Analytics
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-500">
              Current stock health and category distribution,
              with stock movements for {report.periodLabel}.
              Stock totals are a live snapshot; changing the
              report period only changes movement history.
            </p>
          </div>

          {/* INVENTORY SUMMARY CARDS */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {inventoryCards.map((card) => (
              <article
                key={card.label}
                className={`${panel} p-5`}
              >
                <p className="text-sm text-gray-500">
                  {card.label}
                </p>
                <p className="mt-3 text-2xl font-bold tabular-nums text-purple-800">
                  {loading && !error ? "—" : card.value}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-gray-500">
                  {card.note}
                </p>
              </article>
            ))}
          </div>

          {/* INVENTORY CHARTS */}
          <div className="grid gap-5 xl:grid-cols-2">


            {/* STOCK BY CATEGORY */}
            <article className={`${panel} min-w-0 p-5 md:p-6`}>
              <h3 className="text-lg font-bold text-purple-950">
                Stock by Category
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Units currently available, grouped by product category.
              </p>

              <div
                className="mt-5"
                style={{
                  height: Math.max(
                    260,
                    categoryChartData.length * 43
                  ),
                }}
              >
                {!categoryChartData.length ? (
                  <ChartEmpty>
                    No inventory products have been recorded yet.
                  </ChartEmpty>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={categoryChartData}
                      layout="vertical"
                      margin={{
                        top: 6,
                        right: 20,
                        bottom: 6,
                        left: 4,
                      }}
                    >
                      <CartesianGrid
                        stroke="#f0eaf5"
                        strokeDasharray="3 3"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{
                          fontSize: 11,
                          fill: "#6b7280",
                        }}
                      />
                      <YAxis
                        type="category"
                        dataKey="category"
                        width={118}
                        tick={{
                          fontSize: 11,
                          fill: "#4b5563",
                        }}
                        tickFormatter={(value) =>
                          value.length > 17
                            ? `${value.slice(0, 16)}…`
                            : value
                        }
                      />
                      <Tooltip
                        formatter={(value) => [
                          value,
                          "Units on hand",
                        ]}
                      />
                      <Bar
                        dataKey="units"
                        fill="#9333ea"
                        radius={[0, 6, 6, 0]}
                        maxBarSize={23}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* STOCK BY CATEGORY — MATCHING TABLE */}
            <div className="mt-6 border-t border-purple-100 pt-5">
    <h4 className="mb-3 text-sm font-bold text-purple-950">
        Stock by Category — Data Table
    </h4>

    <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
            <thead className="bg-purple-50 text-purple-950">
                <tr>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Products</th>
                    <th className="px-4 py-3 text-right">Units on Hand</th>
                </tr>
            </thead>

            <tbody>
                {categoryChartData.length ? (
                    categoryChartData.map((row) => (
                        <tr
                            key={row.category}
                            className="border-b border-gray-100"
                        >
                            <td className="px-4 py-3">{row.category}</td>
                            <td className="px-4 py-3 text-right">
                                {Number(row.products || 0)}
                            </td>
                            <td className="px-4 py-3 text-right">
                                {Number(row.units || 0)}
                            </td>
                        </tr>
                    ))
                ) : (
                    <tr>
                        <td
                            colSpan={3}
                            className="px-4 py-5 text-center text-gray-500"
                        >
                            No inventory products recorded.
                        </td>
                    </tr>
                )}
                        </tbody>
                        </table>
                </div>
            </div>
            </article>

            {/* PRODUCT STOCK STATUS */}
            <article className={`${panel} min-w-0 p-5 md:p-6`}>
              <h3 className="text-lg font-bold text-purple-950">
                Product Stock Status
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Number of products in each stock condition.
              </p>

              <div className="mt-4 h-[260px]">
                {!inventory.snapshot.products ? (
                  <ChartEmpty>
                    No inventory products have been recorded yet.
                  </ChartEmpty>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stockStatuses.filter(
                          (item) => item.value > 0
                        )}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={96}
                        paddingAngle={2}
                        stroke="#fff"
                        strokeWidth={2}
                      >
                        {stockStatuses
                          .filter((item) => item.value > 0)
                          .map((item) => (
                            <Cell
                              key={item.name}
                              fill={item.fill}
                            />
                          ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [
                          value,
                          "Products",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-gray-100 pt-4">
                {stockStatuses.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center gap-2 text-xs text-gray-600"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor: item.fill,
                      }}
                    />
                    <span>{item.name}</span>
                    <strong className="tabular-nums text-gray-800">
                      {item.value}
                    </strong>
                  </div>
                ))}
              </div>

              {/* PRODUCT STOCK STATUS — MATCHING TABLE */}
                <div className="mt-6 border-t border-purple-100 pt-5">
                <h4 className="mb-3 text-sm font-bold text-purple-950">
        Product Stock Status — Data Table
    </h4>

        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
            <thead className="bg-purple-50 text-purple-950">
                <tr>
                    <th className="px-4 py-3">Stock Status</th>
                    <th className="px-4 py-3 text-right">Products</th>
                </tr>
            </thead>

            <tbody>
                {stockStatuses.map((item) => (
                    <tr
                        key={item.name}
                        className="border-b border-gray-100"
                    >
                        <td className="px-4 py-3">
                            <span
                                className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: item.fill }}
                            />
                            {item.name}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold">
                            {Number(item.value || 0)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
</div>
</div>
            </article>


          {/* STOCK MOVEMENT CHART */}
          <article className={`${panel} min-w-0 p-5 md:p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-purple-950">
                  Stock Movement — {report.periodLabel}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  Recorded units added and removed each day,
                  including initial stock entries.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                <span>
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-purple-600" />
                  Stock In:{" "}
                  <strong>{inventory.totalStockIn}</strong>
                </span>
                <span>
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />
                  Stock Out:{" "}
                  <strong>{inventory.totalStockOut}</strong>
                </span>
              </div>
            </div>

            <div className="mt-5 h-72">
              {!hasStockMovement ? (
                <ChartEmpty>
                  No stock movements were recorded during this period.
                </ChartEmpty>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={inventory.movementTrend}
                    margin={{
                      top: 8,
                      right: 12,
                      left: 0,
                      bottom: 2,
                    }}
                  >
                    <CartesianGrid
                      stroke="#f0eaf5"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="dateLabel"
                      interval={period === "monthly" ? 4 : 0}
                      tick={{
                        fontSize: 11,
                        fill: "#6b7280",
                      }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{
                        fontSize: 11,
                        fill: "#6b7280",
                      }}
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        value,
                        name === "stockIn"
                          ? "Stock In"
                          : "Stock Out",
                      ]}
                    />
                    <Bar
                      dataKey="stockIn"
                      fill="#9333ea"
                      radius={[5, 5, 0, 0]}
                      maxBarSize={22}
                    />
                    <Bar
                      dataKey="stockOut"
                      fill="#f59e0b"
                      radius={[5, 5, 0, 0]}
                      maxBarSize={22}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* STOCK MOVEMENT DATA TABLE */}
            <div className="mt-6 border-t border-purple-100 pt-5">
              <h4 className="mb-3 text-sm font-bold text-purple-950">
                Stock Movement — Data Table
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-purple-50 text-purple-950">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Stock In</th>
                      <th className="px-4 py-3 text-right">Stock Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.movementTrend.length ? (
                      inventory.movementTrend.map((row) => (
                        <tr key={row.date} className="border-b border-gray-100">
                          <td className="px-4 py-3">{longDate(row.date)}</td>
                          <td className="px-4 py-3 text-right">{Number(row.stockIn || 0)}</td>
                          <td className="px-4 py-3 text-right">{Number(row.stockOut || 0)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-4 py-5 text-center text-gray-500">
                          No stock movements recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </article>
          </div>

          {/* LOW STOCK MONITORING TABLE */}
          <article className={`${panel} overflow-hidden`}>
            <div className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between md:p-6">
              <div>
                <h3 className="text-lg font-bold text-purple-950">
                  Stock Attention List
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  Products at or below their reorder level,
                  including zero stock.
                </p>
              </div>

              <input
                type="search"
                value={attentionSearch}
                onChange={(event) =>
                  setAttentionSearch(event.target.value)
                }
                placeholder="Search products…"
                aria-label="Search products needing stock attention"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-purple-400 md:max-w-xs"
              />
            </div>

            {/* STOCK ATTENTION CHART — SAME FILTERED DATA AS TABLE */}
            <div className="border-y border-purple-100 p-5 md:p-6">
              <h4 className="mb-2 text-sm font-bold text-purple-950">
                Stock Attention — Current Stock vs Reorder Level
              </h4>
              <p className="mb-4 text-xs text-gray-500">
                Chart and table both follow the product search above.
              </p>
              <div style={{ height: Math.max(240, attentionItems.length * 45) }}>
                {!attentionItems.length ? (
                  <ChartEmpty>No matching products needing stock attention.</ChartEmpty>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={attentionItems}
                      layout="vertical"
                      margin={{ top: 5, right: 15, bottom: 5, left: 10 }}
                    >
                      <CartesianGrid stroke="#eee8f3" strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="stock" name="Current Stock" fill="#9333ea" maxBarSize={18} />
                      <Bar dataKey="alertLevel" name="Reorder Level" fill="#f59e0b" maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-y border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-6 py-4">
                      Product
                    </th>
                    <th className="px-4 py-4">
                      Category
                    </th>
                    <th className="px-4 py-4 text-right">
                      Quantity
                    </th>
                    <th className="px-4 py-4 text-right">
                      Reorder Level
                    </th>
                    <th className="px-6 py-4">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {!attentionItems.length ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-9 text-center text-gray-500"
                      >
                        {inventory.attentionItems.length
                          ? "No products match your search."
                          : "All products are currently above their reorder levels."}
                      </td>
                    </tr>
                  ) : (
                    attentionItems.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-purple-50/40"
                      >
                        <td className="px-6 py-4 font-medium text-gray-800">
                          {item.name}
                        </td>
                        <td className="px-4 py-4 text-gray-500">
                          {item.category}
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums">
                          {item.stock}
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums">
                          {item.alertLevel}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              item.status === "Out of Stock"
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

          </>
        )}

        {activeCategory === "discounts" && (
          <section className="space-y-5" aria-labelledby="discount-reports-title">
            <div className={`${panel} p-5 md:p-6`}>
              <p className="text-xs font-semibold uppercase tracking-widest text-purple-500">Discount Intelligence</p>
              <h2 id="discount-reports-title" className="mt-2 text-2xl font-bold text-purple-950">Promotions & Loyalty Analytics</h2>
              <p className="mt-2 text-sm text-gray-500">
                Applied discounts on paid transactions during {report.periodLabel}. Promotions and loyalty do not stack.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Discounted Transactions", value: report.discountAnalytics.discountedTransactions, note: "Paid sales with an applied discount" },
                { label: "Promotion Uses", value: report.discountAnalytics.promotionTransactions, note: "Paid sales using promotions" },
                { label: "Loyalty Uses", value: report.discountAnalytics.loyaltyTransactions, note: "Paid sales using loyalty rewards" },
                { label: "Total Discounts Given", value: money(report.discountAnalytics.totalSavings), note: "Promotion and loyalty savings combined" },
              ].map((card) => (
                <article key={card.label} className={`${panel} p-5`}>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-purple-800">
                    {loading && !error ? "—" : card.value}
                  </p>
                  <p className="mt-2 text-xs text-gray-500">{card.note}</p>
                </article>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <article className={`${panel} min-w-0 p-5 md:p-6`}>
                <h3 className="text-lg font-bold text-purple-950">Discount Usage Comparison</h3>
                <p className="mt-1 text-xs text-gray-500">Number of paid transactions by applied discount type.</p>
                <div className="mt-5 h-72">
                  {Number(report.discountAnalytics.discountedTransactions || 0) === 0 ? (
                    <ChartEmpty>No discounted paid transactions for this period.</ChartEmpty>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { type: "Promotions", uses: Number(report.discountAnalytics.promotionTransactions || 0) },
                        { type: "Loyalty", uses: Number(report.discountAnalytics.loyaltyTransactions || 0) },
                      ]}>
                        <CartesianGrid stroke="#eee8f3" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="type" />
                        <YAxis allowDecimals={false} />
                        <Tooltip formatter={(value) => [value, "Paid transactions"]} />
                        <Bar dataKey="uses" name="Paid transactions" fill="#9333ea" radius={[8, 8, 0, 0]} maxBarSize={90} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="mt-5 overflow-x-auto border-t border-purple-100 pt-4">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-purple-50 text-purple-950">
                      <tr><th className="px-4 py-3">Discount Type</th><th className="px-4 py-3 text-right">Uses</th><th className="px-4 py-3 text-right">Savings</th></tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100"><td className="px-4 py-3">Promotions</td><td className="px-4 py-3 text-right">{report.discountAnalytics.promotionTransactions}</td><td className="px-4 py-3 text-right">{money(report.discountAnalytics.promotionSavings)}</td></tr>
                      <tr><td className="px-4 py-3">Loyalty</td><td className="px-4 py-3 text-right">{report.discountAnalytics.loyaltyTransactions}</td><td className="px-4 py-3 text-right">{money(report.discountAnalytics.loyaltySavings)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </article>

              <article className={`${panel} min-w-0 p-5 md:p-6`}>
                <h3 className="text-lg font-bold text-purple-950">Discounted Sales Impact</h3>
                <p className="mt-1 text-xs text-gray-500">Original versus final sales totals for discounted paid transactions.</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-purple-50 p-4"><p className="text-xs text-purple-700">Before discounts</p><p className="mt-2 text-xl font-bold text-purple-950">{money(report.discountAnalytics.discountedGrossSales)}</p></div>
                  <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs text-emerald-700">After discounts</p><p className="mt-2 text-xl font-bold text-emerald-900">{money(report.discountAnalytics.discountedNetSales)}</p></div>
                </div>
                <p className="mt-4 text-sm leading-6 text-gray-500">These figures reflect recorded paid transaction totals, not deposits collected separately. A verified deposit is not subtracted from the final service price again.</p>
              </article>
            </div>

            <article className={`${panel} overflow-hidden`}>
              <div className="p-5 md:p-6">
                <h3 className="text-lg font-bold text-purple-950">Promotion Breakdown</h3>
                <p className="mt-1 text-xs text-gray-500">Paid uses and savings by promotion ID for {report.periodLabel}.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] text-left text-sm">
                  <thead className="bg-purple-50 text-purple-950">
                    <tr><th className="px-5 py-3">Promotion</th><th className="px-5 py-3 text-right">Paid Uses</th><th className="px-5 py-3 text-right">Savings</th><th className="px-5 py-3 text-right">Final Sales</th></tr>
                  </thead>
                  <tbody>
                    {report.discountAnalytics.promotions.length ? report.discountAnalytics.promotions.map((item, index) => (
                      <tr key={`${item.promotionId ?? "unknown"}-${index}`} className="border-t border-gray-100">
                        <td className="px-5 py-3 font-medium">{item.promotionId == null ? "Unlinked promotion" : `Promotion #${item.promotionId}`}</td>
                        <td className="px-5 py-3 text-right">{item.transactions}</td>
                        <td className="px-5 py-3 text-right">{money(item.savings)}</td>
                        <td className="px-5 py-3 text-right">{money(item.paidSales)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-500">No promotion redemptions recorded for this period.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
            <p className="text-xs text-gray-500">Daily discount trends, discounted-service rankings, and unique customer counts require additional backend queries. Usage counts here represent paid transactions, not necessarily unique customers.</p>
          </section>
        )}

        <p className="text-xs text-gray-500">
          Report dates use Philippine time. Sales, appointments,
          and stock movements are historical records; inventory
          quantities and stock status reflect current stock.
          No forecasting is used.
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

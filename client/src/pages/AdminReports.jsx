import { useCallback, useEffect, useState } from "react"
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

const panel = "rounded-2xl border border-purple-100 bg-white shadow-sm"

const emptyReport = {
    period: "weekly",
    periodLabel: "This Week",
    sales: 0,
    transactions: 0,
    averageSale: 0,
    appointments: 0,
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

function dateValue(value) {
    if (!value) return null
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00+08:00`)
    return Number.isNaN(date.getTime()) ? null : date
}

function longDate(value) {
    const date = dateValue(value)

    return date
        ? date.toLocaleDateString("en-PH", {
              timeZone: "Asia/Manila",
              month: "short",
              day: "numeric",
              year: "numeric",
          })
        : "N/A"
}

function shortDate(value) {
    const date = dateValue(value)

    return date
        ? date.toLocaleDateString("en-PH", {
              timeZone: "Asia/Manila",
              month: "short",
              day: "numeric",
          })
        : "N/A"
}

function ChartEmpty({ children }) {
    return (
        <div className="flex h-full items-center justify-center text-sm text-gray-500">
            {children}
        </div>
    )
}

function AdminReports() {
    const [period, setPeriod] = useState("weekly")
    const [report, setReport] = useState(emptyReport)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    const loadReport = useCallback(async (selectedPeriod, signal) => {
        setLoading(true)
        setError("")

        try {
            const response = await apiFetch(`${API_URL}/reports?period=${selectedPeriod}`, {
                signal,
            })

            const data = await response.json().catch(() => null)

            if (!response.ok) {
                throw new Error(data?.error || "Unable to load the report.")
            }

            if (!data || typeof data !== "object" || Array.isArray(data)) {
                throw new Error("Unexpected report response.")
            }

            if (!signal?.aborted) {
                setReport({
                    ...emptyReport,
                    ...data,

                    summary: Array.isArray(data.summary) ? data.summary : [],

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
                setError(requestError.message || "Unable to load the report.")
            }
        } finally {
            if (!signal?.aborted) {
                setLoading(false)
            }
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()

        loadReport(period, controller.signal)

        return () => controller.abort()
    }, [period, loadReport])

    const hasSales = report.salesTrend.some((item) => item.sales > 0)

    const cards = [
        {
            label: `${report.periodLabel} Paid Sales`,
            value: money(report.sales),
            note: "Only transactions marked Paid",
            color: "text-purple-800",
        },
        {
            label: "Paid Transactions",
            value: report.transactions,
            note: report.periodLabel,
            color: "text-pink-600",
        },
        {
            label: "Active Appointments",
            value: report.appointments,
            note: "Excludes cancelled, declined, and unpaid holds",
            color: "text-purple-800",
        },
        {
            label: "Average Sale",
            value: money(report.averageSale),
            note: "Average paid transaction value",
            color: "text-emerald-700",
        },
    ]

    return (
        <div className="min-w-0 space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-purple-500">
                        Descriptive Analytics
                    </p>

                    <h1 className="text-3xl font-bold text-purple-950">Reports</h1>

                    <p className="mt-2 text-sm text-gray-500">
                        Review recorded sales, appointments, and service activity.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2 print:hidden">
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => loadReport(period)}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                        {loading ? "Refreshing…" : "Refresh"}
                    </button>

                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-800"
                    >
                        Print / Save PDF
                    </button>
                </div>
            </header>

            {error && (
                <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                    {error}

                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => loadReport(period)}
                        className="ml-3 font-semibold underline"
                    >
                        Retry
                    </button>
                </div>
            )}

            <section className={`${panel} p-3 print:hidden`}>
                <div className="flex flex-wrap gap-2" aria-label="Report period">
                    {[
                        ["daily", "Today"],
                        ["weekly", "This Week"],
                        ["monthly", "This Month"],
                    ].map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setPeriod(value)}
                            disabled={loading}
                            aria-pressed={period === value}
                            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                                period === value
                                    ? "bg-purple-700 text-white"
                                    : "text-gray-600 hover:bg-purple-50 hover:text-purple-800"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {cards.map((card) => (
                    <article key={card.label} className={`${panel} p-5`}>
                        <p className="text-sm text-gray-500">{card.label}</p>

                        <p className={`mt-3 text-2xl font-bold ${card.color}`}>
                            {loading && !error ? "—" : card.value}
                        </p>

                        <p className="mt-2 text-xs leading-relaxed text-gray-500">{card.note}</p>
                    </article>
                ))}
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
                <article className={`${panel} p-5 md:p-6`}>
                    <h2 className="text-lg font-bold text-purple-950">Paid Sales - Last 7 Days</h2>

                    <p className="mt-1 text-xs text-gray-500">
                        Days without paid sales are shown as zero.
                    </p>

                    <div className="mt-5 h-72">
                        {!hasSales ? (
                            <ChartEmpty>No paid sales recorded in the last seven days.</ChartEmpty>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={report.salesTrend}>
                                    <CartesianGrid
                                        stroke="#eee8f3"
                                        strokeDasharray="3 3"
                                        vertical={false}
                                    />

                                    <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />

                                    <YAxis
                                        tick={{ fontSize: 12 }}
                                        tickFormatter={(value) => `₱${value}`}
                                    />

                                    <Tooltip formatter={(value) => [money(value), "Paid sales"]} />

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

                <article className={`${panel} p-5 md:p-6`}>
                    <h2 className="text-lg font-bold text-purple-950">
                        Appointment Status - {report.periodLabel}
                    </h2>

                    <p className="mt-1 text-xs text-gray-500">
                        Unpaid reservation holds are not included.
                    </p>

                    <div className="mt-5 h-72">
                        {!report.appointmentStatus.length ? (
                            <ChartEmpty>No appointments recorded for this period.</ChartEmpty>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={report.appointmentStatus}>
                                    <CartesianGrid
                                        stroke="#eee8f3"
                                        strokeDasharray="3 3"
                                        vertical={false}
                                    />

                                    <XAxis dataKey="status" tick={{ fontSize: 11 }} />

                                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />

                                    <Tooltip formatter={(value) => [value, "Appointments"]} />

                                    <Bar dataKey="count" fill="#ec4899" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </article>
            </section>

            <section className={`${panel} p-5 md:p-6`}>
                <h2 className="text-lg font-bold text-purple-950">
                    Most Requested Services - {report.periodLabel}
                </h2>

                <p className="mt-1 text-xs text-gray-500">
                    Based on active appointment records, not forecasts.
                </p>

                <div className="mt-5 h-72">
                    {!report.mostRequestedServices.length ? (
                        <ChartEmpty>No service requests recorded for this period.</ChartEmpty>
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

                                <XAxis type="number" allowDecimals={false} />

                                <YAxis
                                    type="category"
                                    dataKey="service"
                                    width={130}
                                    tick={{ fontSize: 12 }}
                                />

                                <Tooltip formatter={(value) => [value, "Appointments"]} />

                                <Bar dataKey="count" fill="#7e22ce" radius={[0, 8, 8, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </section>

            <section className={`${panel} overflow-hidden`}>
                <div className="p-5 md:p-6">
                    <h2 className="text-lg font-bold text-purple-950">
                        Daily Summary - {report.periodLabel}
                    </h2>

                    <p className="mt-1 text-xs text-gray-500">
                        Sales count paid transactions; appointment count comes from booking records.
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="border-y border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                            <tr>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-4 py-4 text-right">Paid Sales</th>
                                <th className="px-4 py-4 text-right">Transactions</th>
                                <th className="px-4 py-4 text-right">Appointments</th>
                                <th className="px-6 py-4">Top Service</th>
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
                                    <tr key={row.date} className="hover:bg-purple-50/40">
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
                Report dates use Philippine time. All figures are descriptive records of completed
                system activity; no forecasting is used.
            </p>
        </div>
    )
}

export default AdminReports

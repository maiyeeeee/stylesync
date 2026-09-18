import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
    LuArrowUpRight,
    LuCalendarDays,
    LuCircleDollarSign,
    LuClock,
    LuPackage,
    LuRefreshCw,
    LuUsers,
    LuWifiOff,
} from "react-icons/lu"
import { Button } from "../components/ui/button"

import {
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts"

import { API_URL, apiFetch } from "../lib/sessionApi"
import { listEmergencyRecords } from "../lib/offlineDb"

const money = (value) =>
    new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        maximumFractionDigits: 2,
    }).format(Number(value || 0))

const shortDate = (value) =>
    new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        timeZone: "Asia/Manila",
    })

async function readApi(path, signal) {
    const response = await apiFetch(`${API_URL}${path}`, { signal })

    const data = await response.json()

    if (!response.ok) {
        throw new Error(data?.error || "Unable to load dashboard data.")
    }

    return data
}

function Panel({ title, subtitle, action, children }) {
    return (
        <section className="min-w-0 rounded-2xl border border-purple-100 bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-bold text-purple-950">{title}</h3>

                    {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
                </div>

                {action}
            </div>

            {children}
        </section>
    )
}

function ModuleLink({ to, children }) {
    return (
        <Link
            to={to}
            className="inline-flex items-center gap-2 text-xs font-medium text-purple-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600"
        >
            {typeof children === "string" ? children.replace(" →", "") : children}
            <LuArrowUpRight aria-hidden="true" />
        </Link>
    )
}

function Metric({ title, value, note, to, icon: Icon }) {
    return (
        <Link to={to} className="metric-card">
            <div className="metric-top">
                <p>{title}</p>
                <span>{Icon && <Icon aria-hidden="true" />}</span>
            </div>
            <p className="metric-value">{value}</p>
            <p className="metric-note">{note}</p>
        </Link>
    )
}

function Badge({ children, positive = false }) {
    return (
        <span
            className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                positive ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"
            }`}
        >
            {children}
        </span>
    )
}

function Empty({ children }) {
    return <p className="rounded-xl bg-gray-50 p-5 text-sm text-gray-500">{children}</p>
}

function AdminDashboard() {
    const [days, setDays] = useState(7)
    const [refresh, setRefresh] = useState(0)

    const [stats, setStats] = useState(null)
    const [recommendations, setRecommendations] = useState(null)
    const [emergencyCount, setEmergencyCount] = useState(null)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [recommendationError, setRecommendationError] = useState("")
    const [emergencyError, setEmergencyError] = useState("")

    useEffect(() => {
        const controller = new AbortController()

        setLoading(true)
        setError("")
        setRecommendationError("")
        setEmergencyError("")

        async function load() {
            const results = await Promise.allSettled([
                readApi(`/dashboard?days=${days}`, controller.signal),
                readApi("/recommendations", controller.signal),
                listEmergencyRecords(),
            ])

            if (controller.signal.aborted) return

            const [dashboardResult, recommendationResult, localResult] = results

            if (
                dashboardResult.status === "fulfilled" &&
                Array.isArray(dashboardResult.value?.trend) &&
                Array.isArray(dashboardResult.value?.staff) &&
                Array.isArray(dashboardResult.value?.todaySchedule) &&
                Array.isArray(dashboardResult.value?.lowStockItems) &&
                Array.isArray(dashboardResult.value?.topServices) &&
                Array.isArray(dashboardResult.value?.salesMix)
            ) {
                setStats(dashboardResult.value)
            } else {
                setStats(null)
                setError(
                    dashboardResult.status === "rejected"
                        ? dashboardResult.reason?.message || "Unable to load the dashboard."
                        : "Unexpected dashboard response. Check that the backend was updated.",
                )
            }

            if (
                recommendationResult.status === "fulfilled" &&
                Array.isArray(recommendationResult.value?.recommendations)
            ) {
                setRecommendations(recommendationResult.value.recommendations)
            } else {
                setRecommendations(null)
                setRecommendationError("Recommendations could not be loaded.")
            }

            if (localResult.status === "fulfilled" && Array.isArray(localResult.value)) {
                setEmergencyCount(
                    localResult.value.filter((item) => item.sync_status !== "Synced").length,
                )
            } else {
                setEmergencyCount(null)
                setEmergencyError("The local emergency queue could not be read.")
            }

            setLoading(false)
        }

        load()

        return () => controller.abort()
    }, [days, refresh])

    const refreshDashboard = () => setRefresh((previous) => previous + 1)

    if (loading) {
        return (
            <div
                role="status"
                className="rounded-2xl border border-purple-100 bg-white p-8 text-purple-700"
            >
                Loading your salon overview…
            </div>
        )
    }

    if (error || !stats) {
        return (
            <div role="alert" className="rounded-2xl bg-red-50 p-6 text-red-800">
                <p>{error || "Dashboard unavailable."}</p>

                <button
                    type="button"
                    onClick={refreshDashboard}
                    className="mt-4 rounded-xl bg-red-700 px-4 py-2 font-semibold text-white"
                >
                    Retry
                </button>
            </div>
        )
    }

    const trend = stats.trend.map((item) => ({
        ...item,
        label: shortDate(item.date),
    }))

    const occupied = stats.staff.filter(
        (item) => item.availability === "Occupied / reserved",
    ).length

    const offShift = stats.staff.filter((item) => item.availability === "Off shift").length

    const unavailable = stats.staff.filter((item) => item.availability === "Unavailable").length

    const attention = [
        {
            count: stats.pendingRequests,
            title: "Appointment requests awaiting review",
            to: "/admin/appointments",
        },
        {
            count: stats.lowStockCount,
            title: "Inventory items at or below reorder level",
            to: "/admin/inventory",
        },
        {
            count: unavailable,
            title: "Active staff marked unavailable now",
            to: "/admin/staff",
        },
        {
            count: emergencyCount,
            title: "Emergency records not synced on this device",
            to: "/admin/emergency",
        },
    ].filter((item) => Number(item.count) > 0)

    const updatedAt = new Date(stats.generatedAt).toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Manila",
    })

    return (
        <div className="space-y-6">
            <header className="dashboard-heading">
                <div className="flex flex-wrap items-start justify-between gap-5">
                    <div>
                        <p className="eyebrow">YOUR DAILY OVERVIEW</p>
                        <h1>A beautiful day starts here.</h1>
                        <p className="dashboard-subtitle">
                            A little clarity for everything happening at your salon.
                        </p>
                        <p className="dashboard-updated">
                            {shortDate(stats.today)} · Updated {updatedAt} · Philippine time
                        </p>
                    </div>
                    <Button
                        onClick={refreshDashboard}
                        variant="outline"
                        size="sm"
                        className="bg-white"
                    >
                        <LuRefreshCw /> Refresh
                    </Button>
                </div>
                <div className="dashboard-actions">
                    {[
                        ["/admin/transactions", "Record transaction"],
                        ["/admin/appointments", "Review appointments"],
                        ["/admin/inventory", "Update inventory"],
                        ["/admin/staff", "Manage staff"],
                    ].map(([to, label]) => (
                        <Link key={to} to={to}>
                            {label}
                            <LuArrowUpRight />
                        </Link>
                    ))}
                </div>
            </header>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Metric
                    title="Paid sales today"
                    icon={LuCircleDollarSign}
                    value={money(stats.salesToday)}
                    note="Transactions marked Paid"
                    to="/admin/transactions"
                />

                <Metric
                    title="Appointments today"
                    icon={LuCalendarDays}
                    value={stats.appointmentsToday}
                    note="Pending, approved, and completed"
                    to="/admin/appointments"
                />

                <Metric
                    title="Pending requests"
                    icon={LuClock}
                    value={stats.pendingRequests}
                    note="All dates · awaiting review"
                    to="/admin/appointments"
                />

                <Metric
                    title="Staff available now"
                    icon={LuUsers}
                    value={stats.availableStaff}
                    note="On shift and not currently reserved"
                    to="/admin/staff"
                />

                <Metric
                    title="Low-stock items"
                    icon={LuPackage}
                    value={stats.lowStockCount}
                    note="At or below the reorder level"
                    to="/admin/inventory"
                />

                <Metric
                    title="Emergency unsynced"
                    icon={LuWifiOff}
                    value={emergencyCount ?? "Unavailable"}
                    note="This device only · includes failed/review"
                    to="/admin/emergency"
                />
            </div>

            {emergencyError && (
                <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                    {emergencyError} Open Emergency Mode to investigate.
                </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-xl font-bold text-purple-950">Business performance</h3>

                    <p className="mt-1 text-sm text-gray-500">Recorded activity through today.</p>
                </div>

                <label className="flex items-center gap-3 text-sm font-medium text-gray-600">
                    Period
                    <select
                        value={days}
                        onChange={(event) => setDays(Number(event.target.value))}
                        className="rounded-xl border border-purple-200 bg-white px-3 py-2 text-purple-900"
                    >
                        <option value={7}>Last 7 days</option>
                        <option value={30}>Last 30 days</option>
                    </select>
                </label>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <Panel
                    title="Paid sales trend"
                    subtitle={`Last ${days} days · days without sales show zero`}
                >
                    <div className="h-64 min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trend}>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                    stroke="#ede9f2"
                                />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                                <YAxis
                                    tick={{ fontSize: 11 }}
                                    width={65}
                                    tickFormatter={(value) => Number(value).toLocaleString()}
                                />
                                <Tooltip formatter={(value) => [money(value), "Paid sales"]} />
                                <Line
                                    type="linear"
                                    dataKey="sales"
                                    stroke="#896379"
                                    strokeWidth={3}
                                    dot={days === 7}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Panel>

                <Panel
                    title="Appointment activity"
                    subtitle="By scheduled date · excludes cancelled and declined"
                >
                    <div className="h-64 min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={trend}>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                    stroke="#ede9f2"
                                />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Bar
                                    name="Appointments"
                                    dataKey="appointments"
                                    fill="#b991a7"
                                    radius={[5, 5, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
                <div className="min-w-0 xl:col-span-2">
                    <Panel
                        title="Today’s appointments"
                        subtitle="Pending, approved, and completed appointments"
                        action={<ModuleLink to="/admin/appointments">View all →</ModuleLink>}
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[620px] text-left text-sm">
                                <thead className="border-b text-gray-500">
                                    <tr>
                                        {["Time", "Customer", "Service", "Staff", "Status"].map(
                                            (label) => (
                                                <th key={label} className="px-2 pb-3 font-medium">
                                                    {label}
                                                </th>
                                            ),
                                        )}
                                    </tr>
                                </thead>

                                <tbody>
                                    {!stats.todaySchedule.length && (
                                        <tr>
                                            <td colSpan={5} className="py-6 text-gray-500">
                                                No appointments scheduled for today.
                                            </td>
                                        </tr>
                                    )}

                                    {stats.todaySchedule.map((item) => (
                                        <tr key={item.id} className="border-b border-gray-100">
                                            <td className="whitespace-nowrap px-2 py-4 align-middle">
                                                {item.startTime}–{item.endTime || "—"}
                                            </td>
                                            <td className="px-2 py-4 align-middle font-medium text-gray-900">
                                                {item.customer_name}
                                            </td>
                                            <td className="px-2 py-4 align-middle">
                                                {item.service}
                                            </td>
                                            <td className="px-2 py-4 align-middle">
                                                {item.staffName}
                                            </td>
                                            <td className="px-2 py-4 align-middle">
                                                <Badge
                                                    positive={["Approved", "Completed"].includes(
                                                        item.status,
                                                    )}
                                                >
                                                    {item.status}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Panel>
                </div>

                <Panel
                    title="Staff right now"
                    subtitle="Snapshot at the last refresh"
                    action={<ModuleLink to="/admin/staff">Manage →</ModuleLink>}
                >
                    <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
                        {[
                            ["Available", stats.availableStaff],
                            ["Occupied / reserved", occupied],
                            ["Off shift", offShift],
                            ["Unavailable", unavailable],
                        ].map(([label, count]) => (
                            <div key={label} className="rounded-xl bg-purple-50 p-3">
                                <p className="text-xs text-gray-500">{label}</p>
                                <p className="mt-1 text-xl font-bold text-purple-900">{count}</p>
                            </div>
                        ))}
                    </div>

                    <div className="max-h-64 space-y-3 overflow-y-auto">
                        {!stats.staff.length && <Empty>No active staff records.</Empty>}

                        {stats.staff.map((item) => (
                            <div
                                key={item.id}
                                className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3"
                            >
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">
                                        {item.name}
                                    </p>
                                    <p className="text-xs text-gray-500">{item.role}</p>
                                </div>

                                <Badge positive={item.availability === "Available now"}>
                                    {item.availability}
                                </Badge>
                            </div>
                        ))}
                    </div>

                    <p className="mt-4 text-xs leading-relaxed text-gray-500">
                        Booking still checks service qualifications and availability for the
                        complete service duration.
                    </p>
                </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Needs attention" subtitle="Open a module to review the records">
                    <div className="space-y-3">
                        {!attention.length && (
                            <Empty>No alerts in the available dashboard data.</Empty>
                        )}

                        {attention.map((item) => (
                            <Link
                                key={item.to}
                                to={item.to}
                                className="flex items-center justify-between gap-4 rounded-xl border border-amber-100 bg-amber-50 p-4 hover:border-amber-300"
                            >
                                <p className="text-sm font-medium text-amber-950">{item.title}</p>
                                <span className="rounded-lg bg-white px-3 py-1 font-bold text-amber-900">
                                    {item.count}{" "}
                                    <LuArrowUpRight className="inline size-4" aria-hidden="true" />
                                </span>
                            </Link>
                        ))}
                    </div>
                </Panel>

                <Panel
                    title="Rule-based recommendations"
                    subtitle="Current stock and the last 30 days of appointments"
                    action={<ModuleLink to="/admin/recommendations">View all →</ModuleLink>}
                >
                    {recommendationError ? (
                        <p role="alert" className="text-sm text-red-700">
                            {recommendationError}
                        </p>
                    ) : !recommendations?.length ? (
                        <Empty>No recommendations triggered by the current data.</Empty>
                    ) : (
                        <div className="space-y-4">
                            {recommendations.slice(0, 3).map((item, index) => (
                                <div
                                    key={`${item.title}-${index}`}
                                    className="rounded-xl bg-purple-50 p-4"
                                >
                                    <p className="text-xs font-semibold uppercase tracking-wide text-purple-600">
                                        {item.priority} priority
                                    </p>

                                    <h4 className="mt-1 font-semibold text-purple-950">
                                        {item.title}
                                    </h4>

                                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                                        {item.description}
                                    </p>

                                    <p className="mt-2 text-xs text-purple-700">
                                        Rule: {item.rule}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <Panel
                    title="Top requested services"
                    subtitle={`Last ${days} days · appointment requests`}
                >
                    {!stats.topServices.length ? (
                        <Empty>No service requests in this period.</Empty>
                    ) : (
                        <ol className="space-y-3">
                            {stats.topServices.map((item, index) => (
                                <li
                                    key={item.service}
                                    className="flex items-center gap-3 rounded-xl bg-gray-50 p-3"
                                >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 font-bold text-purple-700">
                                        {index + 1}
                                    </span>
                                    <span className="flex-1 text-sm font-medium text-gray-800">
                                        {item.service}
                                    </span>
                                    <span className="text-sm font-bold text-purple-800">
                                        {item.requests}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </Panel>

                <Panel
                    title="Service and product sales"
                    subtitle={`Paid transactions · last ${days} days`}
                    action={<ModuleLink to="/admin/reports">Reports →</ModuleLink>}
                >
                    {!stats.salesMix.length ? (
                        <Empty>No paid transactions in this period.</Empty>
                    ) : (
                        <div className="space-y-3">
                            {stats.salesMix.map((item) => (
                                <div
                                    key={item.type}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-pink-50 p-4"
                                >
                                    <span className="font-medium text-gray-700">{item.type}</span>
                                    <span className="text-xl font-bold text-purple-900">
                                        {money(item.sales)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    )
}

export default AdminDashboard

import { useEffect, useMemo, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

import { API_URL, apiFetch } from "../lib/sessionApi"

const GROUPS = [
    {
        name: "Female",
        color: "#7c3aed",
        badge: "bg-purple-100 text-purple-800",
    },
    {
        name: "Male",
        color: "#0891b2",
        badge: "bg-cyan-100 text-cyan-800",
    },
    {
        name: "Prefer not to say",
        color: "#64748b",
        badge: "bg-gray-100 text-gray-700",
    },
    {
        name: "Not recorded",
        color: "#d97706",
        badge: "bg-amber-100 text-amber-800",
    },
    {
        name: "Other recorded value",
        color: "#db2777",
        badge: "bg-pink-100 text-pink-800",
    },
]

const number = (value) => Number(value || 0).toLocaleString("en-PH")

function normalizeGender(value) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase()

    if (!normalized || normalized === "not recorded") {
        return "Not recorded"
    }

    if (normalized === "female") return "Female"
    if (normalized === "male") return "Male"

    if (normalized === "prefer not to say") {
        return "Prefer not to say"
    }

    return "Other recorded value"
}

function Panel({ title, subtitle, children }) {
    return (
        <section className="min-w-0 rounded-2xl border border-purple-100 bg-white p-5 shadow-sm md:p-6">
            <h3 className="text-lg font-bold text-purple-950">{title}</h3>

            {subtitle && <p className="mt-1 text-sm leading-relaxed text-gray-500">{subtitle}</p>}

            <div className="mt-5">{children}</div>
        </section>
    )
}

function Empty({ children }) {
    return <p className="rounded-xl bg-gray-50 p-5 text-sm text-gray-500">{children}</p>
}

function GenderBadge({ gender }) {
    const group = GROUPS.find((item) => item.name === gender)

    return (
        <span
            className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                group?.badge || "bg-gray-100 text-gray-700"
            }`}
        >
            {gender}
        </span>
    )
}

function BookingTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null

    const entries = payload.filter((item) => Number(item.value) > 0)

    return (
        <div className="max-w-xs rounded-xl border border-purple-100 bg-white p-4 shadow-lg">
            <p className="mb-2 font-semibold text-purple-950">{label}</p>

            {entries.map((item) => (
                <p key={item.dataKey} className="text-sm text-gray-600">
                    {item.name}: {number(item.value)}
                </p>
            ))}
        </div>
    )
}

async function getData(path, signal) {
    const response = await apiFetch(`${API_URL}/gad/${path}`, { signal })

    const data = await response.json()

    if (!response.ok || !Array.isArray(data)) {
        throw new Error(data?.error || "Unexpected GAD response. Please try again.")
    }

    return data
}

function AdminGAD() {
    const [preferences, setPreferences] = useState([])
    const [summary, setSummary] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [refresh, setRefresh] = useState(0)
    const [updatedAt, setUpdatedAt] = useState(null)

    const [search, setSearch] = useState("")
    const [genderFilter, setGenderFilter] = useState("All")
    const [page, setPage] = useState(1)

    const pageSize = 8

    useEffect(() => {
        const controller = new AbortController()

        setLoading(true)
        setError("")

        async function load() {
            try {
                const [bookingData, customerData] = await Promise.all([
                    getData("customer-preferences", controller.signal),
                    getData("gender-summary", controller.signal),
                ])

                if (controller.signal.aborted) return

                setPreferences(
                    bookingData.map((item) => ({
                        gender: normalizeGender(item.gender),
                        customer_type: item.customer_type || "Not recorded",
                        service: item.service || "Unspecified Service",
                        total_bookings: Number(item.total_bookings) || 0,
                    })),
                )

                setSummary(customerData)
                setUpdatedAt(new Date())
                setPage(1)
            } catch (requestError) {
                if (!controller.signal.aborted) {
                    setError(requestError.message || "Unable to load GAD analytics.")
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false)
                }
            }
        }

        load()

        return () => controller.abort()
    }, [refresh])

    const totals = useMemo(() => {
        const result = new Map(GROUPS.map((item) => [item.name, 0]))

        summary.forEach((item) => {
            const gender = normalizeGender(item.gender)

            result.set(gender, result.get(gender) + (Number(item.total) || 0))
        })

        return result
    }, [summary])

    const customerTotal = [...totals.values()].reduce((sum, count) => sum + count, 0)

    const services = useMemo(() => {
        const grouped = new Map()

        preferences.forEach((item) => {
            if (!grouped.has(item.service)) {
                const row = {
                    service: item.service,
                    total: 0,
                }

                GROUPS.forEach((group, index) => {
                    row[`group${index}`] = 0
                })

                grouped.set(item.service, row)
            }

            const row = grouped.get(item.service)
            const index = GROUPS.findIndex((group) => group.name === item.gender)

            row[`group${index}`] += item.total_bookings
            row.total += item.total_bookings
        })

        return [...grouped.values()].sort(
            (a, b) => b.total - a.total || a.service.localeCompare(b.service),
        )
    }, [preferences])

    const bookingTotal = services.reduce((sum, item) => sum + item.total, 0)

    const leadingServices = services.length
        ? services.filter((item) => item.total === services[0].total)
        : []

    const missingBookings = preferences
        .filter((item) => item.gender === "Not recorded")
        .reduce((sum, item) => sum + item.total_bookings, 0)

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase()

        return preferences.filter((item) => {
            const matchesGender = genderFilter === "All" || item.gender === genderFilter

            const matchesSearch = [item.service, item.customer_type, item.gender].some((value) =>
                value.toLowerCase().includes(query),
            )

            return matchesGender && matchesSearch
        })
    }, [preferences, search, genderFilter])

    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))

    const currentPage = Math.min(page, pageCount)

    const visibleRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    const chartServices = services.slice(0, 8)

    const displayedGroups = GROUPS.filter(
        (group) =>
            totals.get(group.name) > 0 || preferences.some((item) => item.gender === group.name),
    )

    if (loading) {
        return (
            <div
                role="status"
                className="rounded-2xl border border-purple-100 bg-white p-8 text-purple-700"
            >
                Loading customer analytics…
            </div>
        )
    }

    if (error) {
        return (
            <div role="alert" className="rounded-2xl bg-red-50 p-6 text-red-800">
                <p>{error}</p>

                <button
                    type="button"
                    onClick={() => setRefresh((value) => value + 1)}
                    className="mt-4 rounded-xl bg-red-700 px-4 py-2 font-semibold text-white"
                >
                    Retry
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <header className="rounded-3xl bg-gradient-to-br from-purple-950 via-purple-800 to-pink-700 p-6 text-white shadow-sm md:p-8">
                <div className="flex flex-wrap items-start justify-between gap-5">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-purple-200">
                            Gender and Development
                        </p>

                        <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
                            Understand your customers
                        </h2>

                        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-purple-100">
                            Explore recorded customer profiles and service bookings to support
                            inclusive salon planning.
                        </p>

                        <p className="mt-4 text-xs text-purple-200">
                            All-time records · All appointment statuses
                            {updatedAt &&
                                ` · Refreshed ${updatedAt.toLocaleTimeString("en-PH", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                    timeZone: "Asia/Manila",
                                })} Philippine time`}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setRefresh((value) => value + 1)}
                        className="rounded-xl border border-white px-4 py-2 text-sm font-semibold transition hover:bg-white hover:text-purple-900"
                    >
                        Refresh analytics
                    </button>
                </div>
            </header>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                    [
                        "Customer profiles",
                        number(customerTotal),
                        "Registered records, not unique people",
                    ],
                    [
                        "Recorded bookings",
                        number(bookingTotal),
                        "All dates and appointment statuses",
                    ],
                    [
                        "Services booked",
                        number(services.length),
                        "Distinct service labels in booking data",
                    ],
                    [
                        "Gender not recorded",
                        number(totals.get("Not recorded")),
                        "Customer profiles with no recorded value",
                    ],
                ].map(([title, value, note]) => (
                    <div
                        key={title}
                        className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm"
                    >
                        <p className="text-sm font-medium text-gray-500">{title}</p>
                        <p className="mt-3 text-3xl font-bold tracking-tight text-purple-900">
                            {value}
                        </p>
                        <p className="mt-2 text-xs text-gray-500">{note}</p>
                    </div>
                ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
                <Panel
                    title="Customer profile distribution"
                    subtitle="Share of registered customer records"
                >
                    {!customerTotal ? (
                        <Empty>No customer profiles available.</Empty>
                    ) : (
                        <div className="space-y-5">
                            {GROUPS.map((group) => {
                                const count = totals.get(group.name)
                                const percentage = (count / customerTotal) * 100

                                return (
                                    <div key={group.name}>
                                        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                                            <span className="text-gray-600">{group.name}</span>

                                            <span className="font-semibold text-gray-900">
                                                {number(count)}
                                                <span className="ml-2 font-normal text-gray-500">
                                                    {percentage.toFixed(1)}%
                                                </span>
                                            </span>
                                        </div>

                                        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                                            <div
                                                className="h-full rounded-full"
                                                style={{
                                                    width: `${percentage}%`,
                                                    backgroundColor: group.color,
                                                }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </Panel>

                <div className="min-w-0 xl:col-span-2">
                    <Panel
                        title="Bookings by service and recorded gender"
                        subtitle="Top 8 services by booking count · full breakdown below"
                    >
                        {!chartServices.length ? (
                            <Empty>No booking data available.</Empty>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <div
                                        className="min-w-[500px]"
                                        style={{
                                            height: Math.max(240, chartServices.length * 48),
                                        }}
                                    >
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart
                                                layout="vertical"
                                                data={chartServices}
                                                margin={{
                                                    top: 5,
                                                    right: 20,
                                                    left: 0,
                                                    bottom: 5,
                                                }}
                                            >
                                                <CartesianGrid
                                                    strokeDasharray="3 3"
                                                    horizontal={false}
                                                    stroke="#ede9f2"
                                                />

                                                <XAxis
                                                    type="number"
                                                    allowDecimals={false}
                                                    tick={{ fontSize: 11 }}
                                                />

                                                <YAxis
                                                    type="category"
                                                    dataKey="service"
                                                    width={145}
                                                    tick={{ fontSize: 12 }}
                                                    tickFormatter={(value) =>
                                                        value.length > 22
                                                            ? `${value.slice(0, 21)}…`
                                                            : value
                                                    }
                                                />

                                                <Tooltip content={<BookingTooltip />} />

                                                {GROUPS.map((group, index) => (
                                                    <Bar
                                                        key={group.name}
                                                        dataKey={`group${index}`}
                                                        name={group.name}
                                                        stackId="bookings"
                                                        fill={group.color}
                                                        maxBarSize={24}
                                                    />
                                                ))}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                                    {displayedGroups.map((group) => (
                                        <span
                                            key={group.name}
                                            className="inline-flex items-center gap-2 text-xs text-gray-600"
                                        >
                                            <span
                                                className="h-2.5 w-2.5 rounded-full"
                                                style={{
                                                    backgroundColor: group.color,
                                                }}
                                            />
                                            {group.name}
                                        </span>
                                    ))}
                                </div>
                            </>
                        )}
                    </Panel>
                </div>
            </div>

            <Panel
                title="Booking breakdown"
                subtitle="Search affects this table only. Summary cards and charts remain all-time."
            >
                <div className="mb-5 flex flex-col gap-3 md:flex-row">
                    <label className="flex-1">
                        <span className="mb-2 block text-xs font-semibold text-gray-500">
                            Search records
                        </span>
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value)
                                setPage(1)
                            }}
                            placeholder="Search service or customer type…"
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
                        />
                    </label>

                    <label>
                        <span className="mb-2 block text-xs font-semibold text-gray-500">
                            Recorded gender
                        </span>
                        <select
                            value={genderFilter}
                            onChange={(event) => {
                                setGenderFilter(event.target.value)
                                setPage(1)
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm md:w-56"
                        >
                            <option value="All">All groups</option>
                            {GROUPS.map((group) => (
                                <option key={group.name}>{group.name}</option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-sm">
                        <thead className="bg-purple-50 text-purple-900">
                            <tr>
                                <th className="rounded-tl-xl px-4 py-3">Service</th>
                                <th className="px-4 py-3">Recorded gender</th>
                                <th className="px-4 py-3">Customer type</th>
                                <th className="rounded-tr-xl px-4 py-3 text-right">Bookings</th>
                            </tr>
                        </thead>

                        <tbody>
                            {!visibleRows.length && (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                                        No matching records.
                                    </td>
                                </tr>
                            )}

                            {visibleRows.map((item) => (
                                <tr
                                    key={JSON.stringify([
                                        item.service,
                                        item.gender,
                                        item.customer_type,
                                    ])}
                                    className="border-b border-gray-100 hover:bg-purple-50"
                                >
                                    <td className="px-4 py-4 align-middle font-medium text-gray-900">
                                        {item.service}
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                        <GenderBadge gender={item.gender} />
                                    </td>
                                    <td className="px-4 py-4 align-middle text-gray-600">
                                        {item.customer_type}
                                    </td>
                                    <td className="px-4 py-4 text-right align-middle font-semibold text-purple-900">
                                        {number(item.total_bookings)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
                    <p className="text-gray-500">
                        {number(filtered.length)} groups · Page {currentPage} of {pageCount}
                    </p>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={currentPage === 1}
                            onClick={() => setPage(currentPage - 1)}
                            className="rounded-lg border border-gray-200 px-3 py-2 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Previous
                        </button>
                        <button
                            type="button"
                            disabled={currentPage === pageCount}
                            onClick={() => setPage(currentPage + 1)}
                            className="rounded-lg border border-gray-200 px-3 py-2 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </Panel>

            <Panel
                title="Recorded observations"
                subtitle="A short summary of the data, without repeated promotional cards"
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl bg-purple-50 p-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-purple-600">
                            Leading service count
                        </p>

                        {leadingServices.length ? (
                            <>
                                <h4 className="mt-2 font-bold text-purple-950">
                                    {leadingServices.map((item) => item.service).join(", ")}
                                </h4>
                                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                                    {number(leadingServices[0].total)} recorded booking(s)
                                    {leadingServices.length > 1 ? " each" : ""}. This describes
                                    booking activity, not every customer’s preference.
                                </p>
                            </>
                        ) : (
                            <p className="mt-2 text-sm text-gray-600">
                                No bookings available for comparison.
                            </p>
                        )}
                    </div>

                    <div className="rounded-xl bg-gray-50 p-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Data completeness
                        </p>
                        <h4 className="mt-2 font-bold text-gray-900">
                            {number(missingBookings)} booking(s) without recorded gender
                        </h4>
                        <p className="mt-2 text-sm leading-relaxed text-gray-600">
                            This includes unmatched customer profiles and blank gender values.
                            “Prefer not to say” is counted separately as an explicit recorded
                            choice.
                        </p>
                    </div>
                </div>

                <p className="mt-5 text-xs leading-relaxed text-gray-500">
                    Bookings use the latest customer profile matched by contact number. Shared
                    numbers can associate bookings with the same profile. Customer totals count
                    profile records and may include duplicates. These figures do not establish
                    individual preferences or measure fairness of access to salon services.
                </p>
            </Panel>
        </div>
    )
}

export default AdminGAD

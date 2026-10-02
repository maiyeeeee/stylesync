import { useCallback, useEffect, useRef, useState } from "react"
import { API_URL, apiFetch } from "../lib/sessionApi"

const controlClass =
    "rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"

const actionClass =
    "rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"

function getAppointmentId(appointment) {
    return appointment.id ?? appointment.appointment_id
}

function formatDate(value) {
    if (!value) return "N/A"

    const text = String(value)

    // Preserve a date-only value without shifting it across time zones.
    const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
        ? new Date(`${text}T00:00:00+08:00`)
        : new Date(text)

    if (Number.isNaN(date.getTime())) return "N/A"

    return date.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Manila",
    })
}

function todayInManila() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date())
}

function statusClass(status) {
    if (["Approved", "Completed"].includes(status)) {
        return "bg-green-100 text-green-800"
    }

    if (["Declined", "Cancelled", "Rejected"].includes(status)) {
        return "bg-red-50 text-red-700"
    }

    return "bg-amber-100 text-amber-900"
}

function AdminAppointments() {
    const [appointments, setAppointments] = useState([])
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("All")

    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState("")
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")
    const [busy, setBusy] = useState(false)
    const [declineTarget, setDeclineTarget] = useState(null)
    const [declineForm, setDeclineForm] = useState({
        reason: "",
        suggestedDate: "",
        suggestedTime: "",
    })

    const mutationLock = useRef(false)
    const loadSequence = useRef(0)

    const fetchAppointments = useCallback(async (signal) => {
        const sequence = ++loadSequence.current

        setLoading(true)
        setLoadError("")

        try {
            const response = await apiFetch(`${API_URL}/appointments`, { signal })

            const data = await response.json().catch(() => null)

            if (!response.ok || !Array.isArray(data)) {
                throw new Error(data?.error || "Unable to load appointments.")
            }

            if (signal?.aborted || sequence !== loadSequence.current) {
                return
            }

            setAppointments(data)
        } catch (requestError) {
            if (!signal?.aborted && sequence === loadSequence.current) {
                setLoadError(
                    requestError.message || "Unable to load appointments. Please try again.",
                )
            }
        } finally {
            if (!signal?.aborted && sequence === loadSequence.current) {
                setLoading(false)
            }
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        fetchAppointments(controller.signal)

        return () => controller.abort()
    }, [fetchAppointments])

    const blocked = busy || loading || Boolean(loadError)

    async function mutate(url, options, successMessage) {
        if (mutationLock.current || blocked) return

        mutationLock.current = true
        setBusy(true)
        setError("")
        setMessage("")

        try {
            const response = await apiFetch(url, options)
            const data = await response.json().catch(() => null)

            if (!response.ok) {
                throw new Error(data?.error || "Unable to save this change.")
            }

            setMessage(successMessage)
            await fetchAppointments()
            return true
        } catch (requestError) {
            setError(requestError.message || "Unable to save this change. Please try again.")
            return false
        } finally {
            mutationLock.current = false
            setBusy(false)
        }
    }

    function updateStatus(id, status, details = {}) {
        return mutate(
            `${API_URL}/appointments/${id}/status`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status, ...details }),
            },
            "Appointment status updated.",
        )
    }

    function openDecline(appointment) {
        setError("")
        setMessage("")
        setDeclineTarget(appointment)
        setDeclineForm({
            reason: appointment.decline_reason || "Selected schedule is unavailable.",
            suggestedDate: appointment.suggested_date
                ? String(appointment.suggested_date).slice(0, 10)
                : "",
            suggestedTime: appointment.suggested_time
                ? String(appointment.suggested_time).slice(0, 5)
                : "",
        })
    }

    async function submitDecline(event) {
        event.preventDefault()
        if (!declineTarget || blocked || mutationLock.current) return

        const reason = declineForm.reason.trim()
        if (!reason || !declineForm.suggestedDate || !declineForm.suggestedTime) {
            setError("Enter a decline reason and a suggested alternative date and time.")
            return
        }

        const saved = await updateStatus(getAppointmentId(declineTarget), "Declined", {
            decline_reason: reason,
            suggested_date: declineForm.suggestedDate,
            suggested_time: declineForm.suggestedTime,
        })

        if (saved) {
            setDeclineTarget(null)
            setDeclineForm({ reason: "", suggestedDate: "", suggestedTime: "" })
        }
    }

    function deleteAppointment(appointment) {
        if (blocked || mutationLock.current) return

        const confirmed = window.confirm(
            `Delete the appointment for ${
                appointment.customer_name || "this customer"
            }? This cannot be undone.`,
        )

        if (!confirmed) return

        return mutate(
            `${API_URL}/appointments/${getAppointmentId(appointment)}`,
            { method: "DELETE" },
            "Appointment deleted.",
        )
    }

    const filteredAppointments = appointments.filter((item) => {
        const query = search.trim().toLowerCase()

        const matchesSearch = [
            item.customer_name,
            item.contact_number,
            item.service,
            item.staff_name,
        ].some((value) =>
            String(value || "")
                .toLowerCase()
                .includes(query),
        )

        const matchesStatus =
            statusFilter === "All" ||
            (statusFilter === "Pending"
                ? ["Pending", "Pending Validation"].includes(item.status)
                : item.status === statusFilter)

        return matchesSearch && matchesStatus
    })

    const statuses = [
        ...new Set([
            "Pending",
            "Approved",
            "Declined",
            "Cancelled",
            "Completed",
            ...appointments
                .map((item) => item.status)
                .filter((status) => Boolean(status) && status !== "Pending Validation"),
        ]),
    ]

    const cards = [
        {
            title: "Total requests",
            value: appointments.length,
            color: "text-purple-800",
        },
        {
            title: "Pending review",
            value: appointments.filter((item) =>
                ["Pending", "Pending Validation"].includes(item.status),
            ).length,
            color: "text-amber-700",
        },
        {
            title: "Approved",
            value: appointments.filter((item) => item.status === "Approved").length,
            color: "text-green-700",
        },
        {
            title: "Declined",
            value: appointments.filter((item) => item.status === "Declined").length,
            color: "text-red-700",
        },
    ]

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-purple-600">
                        Salon operations
                    </p>

                    <h2 className="mt-2 text-3xl font-bold tracking-tight text-purple-950">
                        Appointment management
                    </h2>

                    <p className="mt-2 text-sm leading-relaxed text-gray-500">
                        Review assigned staff and the complete service interval before approval.
                    </p>
                </div>

                <button
                    type="button"
                    disabled={busy || loading}
                    onClick={() => fetchAppointments()}
                    className="rounded-xl border border-purple-200 bg-white px-4 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {loading ? "Refreshing…" : "Refresh"}
                </button>
            </header>

            {loadError && (
                <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
                    {loadError}

                    <button
                        type="button"
                        onClick={() => fetchAppointments()}
                        disabled={busy || loading}
                        className="ml-3 font-semibold underline"
                    >
                        Retry
                    </button>
                </div>
            )}

            {error && (
                <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
                    {error}
                </p>
            )}

            {message && (
                <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">
                    {message}
                </p>
            )}

            {declineTarget && (
                <section
                    aria-labelledby="decline-appointment-title"
                    className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm md:p-6"
                >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-red-600">
                                Decline appointment
                            </p>
                            <h3
                                id="decline-appointment-title"
                                className="mt-2 text-xl font-bold text-purple-950"
                            >
                                {declineTarget.customer_name} — {declineTarget.service}
                            </h3>
                            <p className="mt-1 text-sm text-gray-500">
                                Explain why the request cannot be accepted and provide another
                                schedule the client may book.
                            </p>
                        </div>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setDeclineTarget(null)}
                            className={`${actionClass} border-gray-200 bg-white text-gray-600 hover:bg-gray-100`}
                        >
                            Close
                        </button>
                    </div>

                    <form onSubmit={submitDecline} className="mt-5 grid gap-4 md:grid-cols-2">
                        <label className="text-sm font-medium text-purple-950 md:col-span-2">
                            Reason for declining
                            <textarea
                                required
                                maxLength={500}
                                value={declineForm.reason}
                                onChange={(event) =>
                                    setDeclineForm((current) => ({
                                        ...current,
                                        reason: event.target.value,
                                    }))
                                }
                                className={`${controlClass} mt-2 min-h-24 w-full`}
                                placeholder="Example: The selected stylist is unavailable for the requested schedule."
                            />
                        </label>

                        <label className="text-sm font-medium text-purple-950">
                            Suggested alternative date
                            <input
                                required
                                type="date"
                                min={todayInManila()}
                                value={declineForm.suggestedDate}
                                onChange={(event) =>
                                    setDeclineForm((current) => ({
                                        ...current,
                                        suggestedDate: event.target.value,
                                    }))
                                }
                                className={`${controlClass} mt-2 w-full`}
                            />
                        </label>

                        <label className="text-sm font-medium text-purple-950">
                            Suggested alternative time
                            <input
                                required
                                type="time"
                                value={declineForm.suggestedTime}
                                onChange={(event) =>
                                    setDeclineForm((current) => ({
                                        ...current,
                                        suggestedTime: event.target.value,
                                    }))
                                }
                                className={`${controlClass} mt-2 w-full`}
                            />
                        </label>

                        <div className="flex flex-wrap gap-3 md:col-span-2">
                            <button
                                type="submit"
                                disabled={busy}
                                className={`${actionClass} border-red-600 bg-red-600 px-4 text-white hover:bg-red-700`}
                            >
                                {busy ? "Saving…" : "Decline and send suggestion"}
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => setDeclineTarget(null)}
                                className={`${actionClass} border-gray-200 bg-white px-4 text-gray-600 hover:bg-gray-100`}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </section>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {cards.map((card) => (
                    <div
                        key={card.title}
                        className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm"
                    >
                        <p className="text-sm text-gray-500">{card.title}</p>

                        <p className={`mt-2 text-3xl font-bold ${card.color}`}>
                            {loading || loadError ? "—" : card.value}
                        </p>

                        <p className="mt-2 text-xs text-gray-400">All dates</p>
                    </div>
                ))}
            </div>

            <section className="min-w-0 overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 p-5 md:p-6">
                    <div>
                        <h3 className="text-lg font-bold text-purple-950">Appointment requests</h3>

                        <p className="mt-1 text-xs text-gray-500">
                            {loading
                                ? "Loading appointments…"
                                : loadError
                                  ? "Could not refresh the list."
                                  : `${filteredAppointments.length} of ${appointments.length} records`}
                        </p>
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                        <label>
                            <span className="sr-only">Search appointments</span>

                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Customer, service, or staff…"
                                className={`${controlClass} w-full sm:w-64`}
                            />
                        </label>

                        <label>
                            <span className="sr-only">Filter by status</span>

                            <select
                                value={statusFilter}
                                onChange={(event) => setStatusFilter(event.target.value)}
                                className={`${controlClass} w-full`}
                            >
                                <option value="All">All statuses</option>

                                {statuses.map((status) => (
                                    <option key={status} value={status}>
                                        {status}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                </div>

                <div
                    className="overflow-x-auto"
                    tabIndex={0}
                    role="region"
                    aria-label="Appointment requests table"
                >
                    <table className="w-full min-w-[1080px] text-left text-sm">
                        <thead className="border-y border-purple-100 bg-purple-50 text-purple-900">
                            <tr>
                                {[
                                    "Customer",
                                    "Service",
                                    "Schedule",
                                    "Assigned staff",
                                    "Status",
                                    "Source",
                                    "Actions",
                                ].map((heading) => (
                                    <th
                                        key={heading}
                                        scope="col"
                                        className="px-5 py-3 text-xs font-semibold"
                                    >
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {!filteredAppointments.length ? (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-5 py-10 text-center text-gray-500"
                                    >
                                        {loading
                                            ? "Loading appointments…"
                                            : loadError
                                              ? "Appointments could not be loaded."
                                              : "No appointments match your search."}
                                    </td>
                                </tr>
                            ) : (
                                filteredAppointments.map((appointment) => {
                                    const id = getAppointmentId(appointment)

                                    const start = String(appointment.appointment_time || "").slice(
                                        0,
                                        5,
                                    )

                                    const end = String(
                                        appointment.appointment_end_time || "",
                                    ).slice(0, 5)

                                    return (
                                        <tr
                                            key={id}
                                            className="border-b border-gray-100 transition-colors hover:bg-purple-50"
                                        >
                                            <td className="px-5 py-4 align-middle">
                                                <p className="font-semibold text-gray-900">
                                                    {appointment.customer_name}
                                                </p>

                                                <p className="mt-1 whitespace-nowrap text-xs text-gray-500">
                                                    {appointment.contact_number || "No contact"}
                                                </p>
                                            </td>

                                            <td className="max-w-[220px] px-5 py-4 align-middle text-gray-700">
                                                {appointment.service}
                                            </td>

                                            <td className="whitespace-nowrap px-5 py-4 align-middle">
                                                <p className="font-medium text-gray-800">
                                                    {formatDate(appointment.appointment_date)}
                                                </p>

                                                <p className="mt-1 text-xs text-gray-500">
                                                    {start || "N/A"}–{end || "N/A"}
                                                </p>
                                            </td>

                                            <td className="px-5 py-4 align-middle text-gray-700">
                                                {appointment.staff_name || "Unassigned / legacy"}
                                            </td>

                                            <td className="px-5 py-4 align-middle">
                                                <span
                                                    className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                                                        appointment.status,
                                                    )}`}
                                                >
                                                    {appointment.status || "Unspecified"}
                                                </span>
                                                {appointment.status === "Declined" &&
                                                    appointment.decline_reason && (
                                                        <div className="mt-2 max-w-[240px] text-xs leading-relaxed text-gray-500">
                                                            <p>{appointment.decline_reason}</p>
                                                            {appointment.suggested_date &&
                                                                appointment.suggested_time && (
                                                                    <p className="mt-1 font-medium text-purple-700">
                                                                        Suggested: {formatDate(
                                                                            appointment.suggested_date,
                                                                        )}{" "}
                                                                        at {String(
                                                                            appointment.suggested_time,
                                                                        ).slice(0, 5)}
                                                                    </p>
                                                                )}
                                                        </div>
                                                    )}
                                            </td>

                                            <td className="px-5 py-4 align-middle">
                                                <span
                                                    className={`inline-flex whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium ${
                                                        appointment.offline_id
                                                            ? "bg-purple-100 text-purple-700"
                                                            : "bg-gray-100 text-gray-600"
                                                    }`}
                                                >
                                                    {appointment.offline_id
                                                        ? "Emergency Sync"
                                                        : "Online"}
                                                </span>
                                            </td>

                                            <td className="px-5 py-4 align-middle">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        disabled={
                                                            blocked ||
                                                            appointment.status === "Approved"
                                                        }
                                                        onClick={() => updateStatus(id, "Approved")}
                                                        aria-label={`Approve appointment for ${appointment.customer_name}`}
                                                        className={`${actionClass} border-green-200 bg-green-50 text-green-800 hover:bg-green-100`}
                                                    >
                                                        Approve
                                                    </button>

                                                    <button
                                                        type="button"
                                                        disabled={
                                                            blocked ||
                                                            appointment.status === "Declined"
                                                        }
                                                        onClick={() => openDecline(appointment)}
                                                        aria-label={`Decline appointment for ${appointment.customer_name}`}
                                                        className={`${actionClass} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}
                                                    >
                                                        Decline
                                                    </button>

                                                    <button
                                                        type="button"
                                                        disabled={blocked}
                                                        onClick={() =>
                                                            deleteAppointment(appointment)
                                                        }
                                                        aria-label={`Delete appointment for ${appointment.customer_name}`}
                                                        className={`${actionClass} border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-800`}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <p className="px-5 py-4 text-xs text-gray-500">
                    Search and status filters apply to the table. Summary cards show all loaded
                    appointments.
                </p>
            </section>
        </div>
    )
}

export default AdminAppointments

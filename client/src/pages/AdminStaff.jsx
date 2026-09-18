import { useCallback, useEffect, useRef, useState } from "react"

import { API_URL, apiFetch } from "../lib/sessionApi"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const inputClass =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"

const secondaryButton =
    "rounded-xl border border-purple-200 bg-white px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40"

const primaryButton =
    "rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-40"

function blankForm() {
    return {
        name: "",
        role: "Stylist",
        active_status: "Active",
        daily_status: "Available",
        service_ids: [],
        schedules: [1, 2, 3, 4, 5, 6].map((day) => ({
            day_of_week: day,
            shift_start: "09:00",
            shift_end: "18:00",
        })),
    }
}

function initials(name) {
    return (
        String(name || "")
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0])
            .join("")
            .toUpperCase() || "?"
    )
}

function statusLabel(item) {
    if (item.active_status !== "Active") return "Inactive"

    return item.daily_status === "Available" ? "Marked available" : "Marked unavailable"
}

function activeSchedules(item) {
    return (item.schedules || []).filter(
        (schedule) => schedule.active == null || Number(schedule.active) === 1,
    )
}

function formatPeriod(value) {
    if (!value) return "—"

    const text = String(value)

    // Preserve wall-clock values when the API returns SQL DATETIME text.
    if (!/[zZ]$|[+-]\d{2}:\d{2}$/.test(text)) {
        return text.replace("T", " ").slice(0, 16)
    }

    const date = new Date(text)

    if (Number.isNaN(date.getTime())) return text

    return date.toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    })
}

function Field({ label, children }) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-700">{label}</span>
            {children}
        </label>
    )
}

function Notice({ children, error = false }) {
    return (
        <div
            role={error ? "alert" : "status"}
            className={`rounded-xl p-4 text-sm ${
                error ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"
            }`}
        >
            {children}
        </div>
    )
}

async function request(path, options = {}) {
    const response = await apiFetch(`${API_URL}${path}`, options)

    const data = await response.json().catch(() => null)

    if (!response.ok) {
        throw new Error(data?.error || "Unable to complete the request.")
    }

    return data
}

function AdminStaff() {
    const [staff, setStaff] = useState([])
    const [services, setServices] = useState([])

    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState("")
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")
    const [busy, setBusy] = useState(false)

    const [search, setSearch] = useState("")
    const [filter, setFilter] = useState("All")

    const [form, setForm] = useState(blankForm)
    const [editingId, setEditingId] = useState(null)
    const [showForm, setShowForm] = useState(false)

    const [leaveStaff, setLeaveStaff] = useState(null)
    const [leave, setLeave] = useState({
        start_at: "",
        end_at: "",
        reason: "",
    })

    const mutationLock = useRef(false)
    const loadSequence = useRef(0)
    const editorRef = useRef(null)
    const leaveRef = useRef(null)

    const loadData = useCallback(async (signal) => {
        const sequence = ++loadSequence.current

        setLoading(true)
        setLoadError("")

        try {
            const [staffData, serviceData] = await Promise.all([
                request("/staff", { signal }),
                request("/services", { signal }),
            ])

            if (signal?.aborted || sequence !== loadSequence.current) {
                return
            }

            if (!Array.isArray(staffData) || !Array.isArray(serviceData)) {
                throw new Error("Invalid staff or services response.")
            }

            setStaff(staffData)
            setServices(serviceData)
        } catch (requestError) {
            if (!signal?.aborted && sequence === loadSequence.current) {
                setLoadError(requestError.message || "Cannot load staff information.")
            }
        } finally {
            if (!signal?.aborted && sequence === loadSequence.current) {
                setLoading(false)
            }
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        loadData(controller.signal)

        return () => controller.abort()
    }, [loadData])

    useEffect(() => {
        if (showForm) {
            editorRef.current?.scrollIntoView({
                block: "start",
            })
            editorRef.current?.focus({ preventScroll: true })
        }
    }, [showForm, editingId])

    useEffect(() => {
        if (leaveStaff) {
            leaveRef.current?.scrollIntoView({
                block: "start",
            })
            leaveRef.current?.focus({ preventScroll: true })
        }
    }, [leaveStaff])

    const blocked = busy || loading || Boolean(loadError)

    const clearNotices = () => {
        setError("")
        setMessage("")
    }

    const mutate = async (path, options, successMessage, afterSave) => {
        if (mutationLock.current || loading || loadError) return

        mutationLock.current = true
        setBusy(true)
        clearNotices()

        try {
            await request(path, options)
            afterSave?.()
            setMessage(successMessage)
            await loadData()
        } catch (requestError) {
            setError(requestError.message || "Unable to save the change.")
        } finally {
            mutationLock.current = false
            setBusy(false)
        }
    }

    const openNewStaff = () => {
        clearNotices()
        setLeaveStaff(null)
        setEditingId(null)
        setForm(blankForm())
        setShowForm(true)
    }

    const editStaff = (item) => {
        clearNotices()
        setLeaveStaff(null)
        setEditingId(item.staff_id)

        setForm({
            name: item.name || "",
            role: item.role || "",
            active_status: item.active_status || "Active",
            daily_status: item.daily_status || "Available",
            service_ids: (item.service_ids || []).map(Number),
            schedules: activeSchedules(item).map((schedule) => ({
                day_of_week: Number(schedule.day_of_week),
                shift_start: String(schedule.shift_start).slice(0, 5),
                shift_end: String(schedule.shift_end).slice(0, 5),
            })),
        })

        setShowForm(true)
    }

    const toggleService = (id) => {
        setForm((previous) => ({
            ...previous,
            service_ids: previous.service_ids.includes(id)
                ? previous.service_ids.filter((value) => value !== id)
                : [...previous.service_ids, id],
        }))
    }

    const updateSchedule = (index, field, value) => {
        setForm((previous) => ({
            ...previous,
            schedules: previous.schedules.map((schedule, position) =>
                position === index ? { ...schedule, [field]: value } : schedule,
            ),
        }))
    }

    const submitStaff = (event) => {
        event.preventDefault()

        if (!form.name.trim() || !form.role.trim()) {
            setError("Enter the staff name and role.")
            return
        }

        if (!form.service_ids.length) {
            setError("Select at least one qualified service.")
            return
        }

        if (!form.schedules.length) {
            setError("Add at least one working shift.")
            return
        }

        const invalidShift = form.schedules.some(
            (schedule) =>
                !schedule.shift_start ||
                !schedule.shift_end ||
                schedule.shift_end <= schedule.shift_start,
        )

        if (invalidShift) {
            setError("Every shift must end after its start time.")
            return
        }

        const overlap = form.schedules.some((first, index) =>
            form.schedules.some(
                (second, otherIndex) =>
                    otherIndex > index &&
                    Number(first.day_of_week) === Number(second.day_of_week) &&
                    first.shift_start < second.shift_end &&
                    second.shift_start < first.shift_end,
            ),
        )

        if (overlap) {
            setError("Shifts on the same day must not overlap.")
            return
        }

        mutate(
            editingId ? `/staff/${editingId}` : "/staff",
            {
                method: editingId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    name: form.name.trim(),
                    role: form.role.trim(),
                }),
            },
            editingId ? "Staff updated successfully." : "Staff added successfully.",
            () => setShowForm(false),
        )
    }

    const toggleAvailability = (item) =>
        mutate(
            `/staff/${item.staff_id}/daily-status`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    daily_status: item.daily_status === "Available" ? "Unavailable" : "Available",
                }),
            },
            "Availability setting updated.",
        )

    const archiveStaff = (item) => {
        if (
            blocked ||
            item.active_status !== "Active" ||
            !window.confirm(
                `Archive ${item.name}? They will no longer appear as available for new appointments, but their historical records will be preserved.`,
            )
        ) {
            return
        }

        mutate(
            `/staff/${item.staff_id}`,
            { method: "DELETE" },
            `${item.name} was archived and removed from new booking assignments.`,
            () => {
                if (editingId === item.staff_id) {
                    setEditingId(null)
                    setShowForm(false)
                }

                if (leaveStaff?.staff_id === item.staff_id) {
                    setLeaveStaff(null)
                }
            },
        )
    }

    const openLeave = (item) => {
        clearNotices()
        setShowForm(false)
        setLeave({
            start_at: "",
            end_at: "",
            reason: "",
        })
        setLeaveStaff(item)
    }

    const submitLeave = (event) => {
        event.preventDefault()

        if (!leave.start_at || !leave.end_at || leave.end_at <= leave.start_at) {
            setError("Choose an end date/time after the start.")
            return
        }

        mutate(
            `/staff/${leaveStaff.staff_id}/unavailability`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    start_at: leave.start_at.replace("T", " ") + ":00",
                    end_at: leave.end_at.replace("T", " ") + ":00",
                    reason: leave.reason.trim() || "Unavailable",
                }),
            },
            "Leave or break recorded. Review any existing bookings during this period.",
            () => setLeaveStaff(null),
        )
    }

    const removeLeave = (id) => {
        if (blocked || !window.confirm("Remove this unavailable period?")) {
            return
        }

        mutate(`/staff/unavailability/${id}`, { method: "DELETE" }, "Unavailable period removed.")
    }

    const activeStaff = staff.filter((item) => item.active_status === "Active")

    const availableCount = activeStaff.filter((item) => item.daily_status === "Available").length

    const unavailableCount = activeStaff.filter((item) => item.daily_status !== "Available").length

    const filteredStaff = staff.filter((item) => {
        const text = [
            item.name,
            item.role,
            ...(item.services || []).map((service) => service.service),
        ]
            .join(" ")
            .toLowerCase()

        const matchesSearch = text.includes(search.trim().toLowerCase())

        const matchesFilter =
            filter === "All" ||
            (filter === "Active" && item.active_status === "Active") ||
            (filter === "Inactive" && item.active_status !== "Active") ||
            (filter === "Available" &&
                item.active_status === "Active" &&
                item.daily_status === "Available") ||
            (filter === "Unavailable" &&
                item.active_status === "Active" &&
                item.daily_status !== "Available")

        return matchesSearch && matchesFilter
    })

    const selectableServices = services.filter(
        (service) =>
            service.status === "Available" || form.service_ids.includes(Number(service.service_id)),
    )

    return (
        <div className="space-y-6">
            <header className="rounded-3xl bg-gradient-to-br from-purple-950 via-purple-800 to-pink-700 p-6 text-white shadow-sm md:p-8">
                <div className="flex flex-wrap items-start justify-between gap-5">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-purple-200">
                            Team management
                        </p>

                        <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
                            Your salon team
                        </h2>

                        <p className="mt-3 max-w-xl text-sm leading-relaxed text-purple-100">
                            Manage service qualifications, working shifts, availability settings,
                            and time away.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={busy || loading}
                            onClick={() => loadData()}
                            className="rounded-xl border border-white px-4 py-2.5 text-sm font-semibold hover:bg-white hover:text-purple-900 disabled:opacity-40"
                        >
                            Refresh
                        </button>

                        <button
                            type="button"
                            disabled={blocked}
                            onClick={openNewStaff}
                            className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-purple-900 hover:bg-purple-100 disabled:opacity-40"
                        >
                            + Add staff
                        </button>
                    </div>
                </div>
            </header>

            {error && <Notice error>{error}</Notice>}

            {loadError && (
                <Notice error>
                    {loadError}

                    <button
                        type="button"
                        disabled={busy || loading}
                        onClick={() => loadData()}
                        className="ml-3 font-semibold underline"
                    >
                        Retry
                    </button>
                </Notice>
            )}

            {message && <Notice>{message}</Notice>}

            {loading && (
                <p role="status" className="text-sm text-purple-700">
                    Loading staff and services…
                </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                    ["Active staff", activeStaff.length],
                    ["Marked available", availableCount],
                    ["Marked unavailable", unavailableCount],
                    ["Inactive staff", staff.length - activeStaff.length],
                ].map(([title, count]) => (
                    <div
                        key={title}
                        className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm"
                    >
                        <p className="text-sm text-gray-500">{title}</p>

                        <p className="mt-3 text-3xl font-bold text-purple-900">
                            {loading || loadError ? "—" : count}
                        </p>
                    </div>
                ))}
            </div>

            <p className="text-sm leading-relaxed text-gray-500">
                “Marked available” is a manual setting. It does not mean the person is on shift or
                free for a specific booking. Booking checks also consider qualifications, shifts,
                leave, and existing appointments. The manual setting remains until changed.
            </p>

            {showForm && (
                <section
                    ref={editorRef}
                    tabIndex={-1}
                    aria-labelledby="staff-editor-title"
                    className="scroll-mt-24 rounded-2xl border border-purple-200 bg-white p-5 shadow-sm outline-none md:p-6"
                >
                    <h3 id="staff-editor-title" className="text-xl font-bold text-purple-950">
                        {editingId ? "Edit staff member" : "Add staff member"}
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                        Set qualifications and the regular weekly schedule.
                    </p>

                    <form onSubmit={submitStaff} className="mt-6">
                        <fieldset disabled={blocked} className="min-w-0 space-y-6">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Staff name">
                                    <input
                                        required
                                        value={form.name}
                                        onChange={(event) =>
                                            setForm({
                                                ...form,
                                                name: event.target.value,
                                            })
                                        }
                                        className={inputClass}
                                        placeholder="Enter staff name"
                                    />
                                </Field>

                                <Field label="Role">
                                    <input
                                        required
                                        value={form.role}
                                        onChange={(event) =>
                                            setForm({
                                                ...form,
                                                role: event.target.value,
                                            })
                                        }
                                        className={inputClass}
                                        placeholder="For example, Stylist"
                                    />
                                </Field>

                                <Field label="Staff record status">
                                    <select
                                        value={form.active_status}
                                        onChange={(event) =>
                                            setForm({
                                                ...form,
                                                active_status: event.target.value,
                                            })
                                        }
                                        className={inputClass}
                                    >
                                        <option>Active</option>
                                        <option>Inactive</option>
                                    </select>
                                </Field>

                                <Field label="Manual availability setting">
                                    <select
                                        value={form.daily_status}
                                        onChange={(event) =>
                                            setForm({
                                                ...form,
                                                daily_status: event.target.value,
                                            })
                                        }
                                        className={inputClass}
                                    >
                                        <option>Available</option>
                                        <option>Unavailable</option>
                                    </select>
                                </Field>
                            </div>

                            <fieldset>
                                <legend className="mb-3 text-sm font-semibold text-gray-700">
                                    Qualified services
                                </legend>

                                {!selectableServices.length && (
                                    <p className="text-sm text-gray-500">
                                        Add an available service in Services first.
                                    </p>
                                )}

                                <div className="grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                                    {selectableServices.map((service) => {
                                        const id = Number(service.service_id)
                                        const selected = form.service_ids.includes(id)

                                        return (
                                            <label
                                                key={id}
                                                className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${
                                                    selected
                                                        ? "border-purple-300 bg-purple-50"
                                                        : "border-gray-200"
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleService(id)}
                                                    className="mt-1 accent-purple-700"
                                                />

                                                <span>
                                                    {service.service}

                                                    {service.status !== "Available" && (
                                                        <span className="ml-1 text-xs text-gray-500">
                                                            ({service.status || "Unavailable"})
                                                        </span>
                                                    )}
                                                </span>
                                            </label>
                                        )
                                    })}
                                </div>
                            </fieldset>

                            <div>
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                    <h4 className="text-sm font-semibold text-gray-700">
                                        Weekly shifts
                                    </h4>

                                    <button
                                        type="button"
                                        className={secondaryButton}
                                        onClick={() =>
                                            setForm((previous) => ({
                                                ...previous,
                                                schedules: [
                                                    ...previous.schedules,
                                                    {
                                                        day_of_week: 1,
                                                        shift_start: "09:00",
                                                        shift_end: "18:00",
                                                    },
                                                ],
                                            }))
                                        }
                                    >
                                        + Add shift
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {form.schedules.map((schedule, index) => (
                                        <div
                                            key={index}
                                            className="grid items-end gap-3 rounded-xl bg-gray-50 p-3 sm:grid-cols-2 xl:grid-cols-4"
                                        >
                                            <Field label="Day">
                                                <select
                                                    value={schedule.day_of_week}
                                                    onChange={(event) =>
                                                        updateSchedule(
                                                            index,
                                                            "day_of_week",
                                                            Number(event.target.value),
                                                        )
                                                    }
                                                    className={inputClass}
                                                >
                                                    {DAYS.map((day, dayIndex) => (
                                                        <option key={day} value={dayIndex}>
                                                            {day}
                                                        </option>
                                                    ))}
                                                </select>
                                            </Field>

                                            <Field label="Start">
                                                <input
                                                    required
                                                    type="time"
                                                    value={schedule.shift_start}
                                                    onChange={(event) =>
                                                        updateSchedule(
                                                            index,
                                                            "shift_start",
                                                            event.target.value,
                                                        )
                                                    }
                                                    className={inputClass}
                                                />
                                            </Field>

                                            <Field label="End">
                                                <input
                                                    required
                                                    type="time"
                                                    value={schedule.shift_end}
                                                    onChange={(event) =>
                                                        updateSchedule(
                                                            index,
                                                            "shift_end",
                                                            event.target.value,
                                                        )
                                                    }
                                                    className={inputClass}
                                                />
                                            </Field>
                                            <button
                                                type="button"
                                                className="rounded-xl px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                                                aria-label={`Remove ${
                                                    DAYS[schedule.day_of_week]
                                                } shift ${index + 1}`}
                                                onClick={() =>
                                                    setForm((previous) => ({
                                                        ...previous,
                                                        schedules: previous.schedules.filter(
                                                            (_, position) => position !== index,
                                                        ),
                                                    }))
                                                }
                                            >
                                                Remove shift
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-5">
                                <button type="submit" className={primaryButton}>
                                    {busy ? "Saving…" : "Save staff"}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForm(false)
                                        setError("")
                                    }}
                                    className={secondaryButton}
                                >
                                    Cancel
                                </button>
                            </div>
                        </fieldset>
                    </form>
                </section>
            )}

            {leaveStaff && (
                <section
                    ref={leaveRef}
                    tabIndex={-1}
                    aria-labelledby="leave-title"
                    className="scroll-mt-24 rounded-2xl border border-purple-200 bg-white p-5 shadow-sm outline-none md:p-6"
                >
                    <h3 id="leave-title" className="text-xl font-bold text-purple-950">
                        Add leave or break · {leaveStaff.name}
                    </h3>

                    <p className="mt-2 text-sm text-gray-500">
                        Enter salon-local dates and times. Review existing appointments before
                        recording time away.
                    </p>

                    <form onSubmit={submitLeave} className="mt-5">
                        <fieldset disabled={blocked} className="min-w-0 space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Start date and time">
                                    <input
                                        required
                                        type="datetime-local"
                                        value={leave.start_at}
                                        onChange={(event) =>
                                            setLeave({
                                                ...leave,
                                                start_at: event.target.value,
                                            })
                                        }
                                        className={inputClass}
                                    />
                                </Field>

                                <Field label="End date and time">
                                    <input
                                        required
                                        type="datetime-local"
                                        value={leave.end_at}
                                        onChange={(event) =>
                                            setLeave({
                                                ...leave,
                                                end_at: event.target.value,
                                            })
                                        }
                                        className={inputClass}
                                    />
                                </Field>
                            </div>

                            <Field label="Reason">
                                <input
                                    value={leave.reason}
                                    onChange={(event) =>
                                        setLeave({
                                            ...leave,
                                            reason: event.target.value,
                                        })
                                    }
                                    placeholder="Leave, lunch break, appointment…"
                                    className={inputClass}
                                />
                            </Field>

                            <div className="flex flex-wrap gap-2">
                                <button type="submit" className={primaryButton}>
                                    {busy ? "Saving…" : "Save unavailable period"}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setLeaveStaff(null)
                                        setError("")
                                    }}
                                    className={secondaryButton}
                                >
                                    Cancel
                                </button>
                            </div>
                        </fieldset>
                    </form>
                </section>
            )}

            <section className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row">
                    <label className="flex-1">
                        <span className="sr-only">Search staff</span>

                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search name, role, or service…"
                            className={inputClass}
                        />
                    </label>

                    <label>
                        <span className="sr-only">Filter staff</span>

                        <select
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                            className={inputClass}
                        >
                            <option value="All">All staff</option>
                            <option value="Active">Active staff</option>
                            <option value="Available">Marked available</option>
                            <option value="Unavailable">Marked unavailable</option>
                            <option value="Inactive">Inactive staff</option>
                        </select>
                    </label>
                </div>
            </section>

            {!loading && !loadError && (
                <p className="text-sm text-gray-500">
                    Showing {filteredStaff.length} of {staff.length} staff records
                </p>
            )}

            {!loading && !loadError && !filteredStaff.length && (
                <div className="rounded-2xl bg-white p-8 text-center text-gray-500">
                    No staff match your search or filter.
                </div>
            )}

            <div className="grid gap-5 xl:grid-cols-2">
                {filteredStaff.map((item) => {
                    const active = item.active_status === "Active"

                    const available = active && item.daily_status === "Available"

                    const schedules = activeSchedules(item)

                    const workingDays = new Set(
                        schedules.map((schedule) => Number(schedule.day_of_week)),
                    )

                    const shiftLabels = [
                        ...new Set(
                            schedules.map(
                                (schedule) =>
                                    `${String(schedule.shift_start).slice(0, 5)}–${String(
                                        schedule.shift_end,
                                    ).slice(0, 5)}`,
                            ),
                        ),
                    ]

                    return (
                        <article
                            key={item.staff_id}
                            className="flex min-w-0 flex-col rounded-2xl border border-purple-100 bg-white p-5 shadow-sm md:p-6"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div
                                        aria-hidden="true"
                                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-100 text-lg font-bold text-purple-800"
                                    >
                                        {initials(item.name)}
                                    </div>

                                    <div className="min-w-0">
                                        <h3 className="break-words text-lg font-bold text-purple-950">
                                            {item.name}
                                        </h3>

                                        <p className="text-sm text-gray-500">{item.role}</p>
                                    </div>
                                </div>

                                <span
                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                        !active
                                            ? "bg-gray-100 text-gray-600"
                                            : available
                                              ? "bg-green-100 text-green-800"
                                              : "bg-amber-100 text-amber-900"
                                    }`}
                                >
                                    {statusLabel(item)}
                                </span>
                            </div>

                            <div className="mt-5">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Qualified services
                                </p>

                                <div className="flex flex-wrap gap-2">
                                    {(item.services || []).map((service) => (
                                        <span
                                            key={service.service_id}
                                            className="rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-800"
                                        >
                                            {service.service}
                                        </span>
                                    ))}

                                    {!item.services?.length && (
                                        <span className="text-sm text-gray-500">
                                            No services assigned
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="mt-5 rounded-xl bg-gray-50 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        Weekly schedule
                                    </p>

                                    <p className="text-xs font-semibold text-purple-800">
                                        {shiftLabels.length === 1
                                            ? shiftLabels[0]
                                            : shiftLabels.length > 1
                                              ? "Varied shifts"
                                              : "No active shifts"}
                                    </p>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {DAYS.map((day, index) => (
                                        <span
                                            key={day}
                                            title={`${day}: ${
                                                workingDays.has(index)
                                                    ? "Scheduled"
                                                    : "No regular shift"
                                            }`}
                                            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                                                workingDays.has(index)
                                                    ? "bg-purple-700 text-white"
                                                    : "bg-white text-gray-400"
                                            }`}
                                        >
                                            {day.slice(0, 3)}
                                        </span>
                                    ))}
                                </div>

                                {schedules.length > 0 && (
                                    <details className="mt-3">
                                        <summary className="cursor-pointer text-xs font-semibold text-purple-700">
                                            View shift details
                                        </summary>

                                        <ul className="mt-2 space-y-1 text-xs text-gray-600">
                                            {schedules.map((schedule, index) => (
                                                <li key={schedule.schedule_id || index}>
                                                    {DAYS[Number(schedule.day_of_week)]}:{" "}
                                                    {String(schedule.shift_start).slice(0, 5)}–
                                                    {String(schedule.shift_end).slice(0, 5)}
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                )}
                            </div>

                            {item.unavailability?.length > 0 && (
                                <details className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-4">
                                    <summary className="cursor-pointer text-sm font-semibold text-amber-900">
                                        Current / upcoming time away ({item.unavailability.length})
                                    </summary>

                                    <div className="mt-3 space-y-3">
                                        {item.unavailability.map((entry) => (
                                            <div
                                                key={entry.unavailability_id}
                                                className="rounded-lg bg-white p-3"
                                            >
                                                <p className="text-sm font-semibold text-gray-800">
                                                    {entry.reason || "Unavailable"}
                                                </p>

                                                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                                                    {formatPeriod(entry.start_at)}
                                                    {" → "}
                                                    {formatPeriod(entry.end_at)}
                                                </p>

                                                <button
                                                    type="button"
                                                    disabled={blocked}
                                                    onClick={() =>
                                                        removeLeave(entry.unavailability_id)
                                                    }
                                                    className="mt-2 text-xs font-semibold text-red-700 hover:underline disabled:opacity-40"
                                                >
                                                    Remove period
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}

                            <div className="mt-auto flex flex-wrap gap-2 pt-5">
                                <button
                                    type="button"
                                    disabled={blocked}
                                    onClick={() => editStaff(item)}
                                    className={primaryButton}
                                >
                                    Edit staff
                                </button>

                                <button
                                    type="button"
                                    disabled={blocked || !active}
                                    onClick={() => toggleAvailability(item)}
                                    className={secondaryButton}
                                >
                                    Mark{" "}
                                    {item.daily_status === "Available"
                                        ? "unavailable"
                                        : "available"}
                                </button>

                                <button
                                    type="button"
                                    disabled={blocked || !active}
                                    onClick={() => openLeave(item)}
                                    className={secondaryButton}
                                >
                                    + Leave / break
                                </button>

                                {active && (
                                    <button
                                        type="button"
                                        disabled={blocked}
                                        onClick={() => archiveStaff(item)}
                                        className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        Archive staff
                                    </button>
                                )}
                            </div>
                        </article>
                    )
                })}
            </div>
        </div>
    )
}

export default AdminStaff

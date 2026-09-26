import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { API_URL, apiFetch } from "../lib/sessionApi"

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
]

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-200"

const primaryButton =
  "rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"

const secondaryButton =
  "rounded-xl border border-purple-200 bg-white px-4 py-2.5 text-sm font-semibold text-purple-700 transition hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50"

const dangerButton =
  "rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"

function defaultSchedules() {
  return [1, 2, 3, 4, 5, 6].map((day) => ({
    day_of_week: day,
    shift_start: "09:00",
    shift_end: "18:00",
    break_start: "",
    break_end: "",
  }))
}

function blankForm() {
  return {
    name: "",
    role: "",
    active_status: "Active",
    daily_status: "Available",
    service_ids: [],
    schedules: defaultSchedules(),
  }
}

function blankLeaveForm() {
  return {
    staff_id: "",
    start_at: "",
    end_at: "",
    reason: "",
  }
}

function normalizeTime(value) {
  return String(value || "").slice(0, 5)
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!parts.length) return "?"

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

function statusLabel(staff) {
  if (staff.active_status !== "Active") {
    return {
      label: "Inactive",
      className: "bg-gray-100 text-gray-700",
    }
  }

  if (staff.daily_status === "Unavailable") {
    return {
      label: "Unavailable today",
      className: "bg-orange-100 text-orange-700",
    }
  }

  return {
    label: "Available",
    className: "bg-green-100 text-green-700",
  }
}

function activeSchedules(staff) {
  return Array.isArray(staff.schedules)
    ? staff.schedules.filter((schedule) => Number(schedule.active) !== 0)
    : []
}

function formatTime(value) {
  if (!value) return ""

  const [hourValue, minuteValue] = normalizeTime(value).split(":")
  const hour = Number(hourValue)
  const minute = minuteValue || "00"

  if (!Number.isFinite(hour)) return normalizeTime(value)

  const suffix = hour >= 12 ? "PM" : "AM"
  const displayHour = hour % 12 || 12

  return `${displayHour}:${minute} ${suffix}`
}

function formatDateTime(value) {
  if (!value) return "Not recorded"

  const parsed = new Date(String(value).replace(" ", "T"))

  if (Number.isNaN(parsed.getTime())) {
    return String(value)
  }

  return parsed.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-gray-700">
        {label}
      </span>

      {children}

      {hint && (
        <span className="mt-1 block text-xs leading-5 text-gray-500">
          {hint}
        </span>
      )}
    </label>
  )
}

function Notice({ type = "error", children }) {
  const styles =
    type === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : "border-red-200 bg-red-50 text-red-700"

  return (
    <div role={type === "error" ? "alert" : "status"} className={`rounded-xl border p-4 text-sm ${styles}`}>
      {children}
    </div>
  )
}

async function request(path, options = {}) {
  const response = await apiFetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...options,
  })

  const result = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      result?.error ||
        result?.message ||
        "The request could not be completed.",
    )
  }

  return result
}

function AdminStaff() {
  const [staff, setStaff] = useState([])
  const [services, setServices] = useState([])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [mutationError, setMutationError] = useState("")
  const [busyAction, setBusyAction] = useState("")

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")

  const [showStaffForm, setShowStaffForm] = useState(false)
  const [editingStaffId, setEditingStaffId] = useState(null)
  const [form, setForm] = useState(blankForm)

  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [leaveForm, setLeaveForm] = useState(blankLeaveForm)
  const leaveFormRef = useRef(null)

  const loadData = useCallback(async (signal) => {
    setLoading(true)
    setLoadError("")

    try {
      const [staffData, serviceData] = await Promise.all([
        request("/staff", { signal }),
        request("/services", { signal }),
      ])

      setStaff(Array.isArray(staffData) ? staffData : [])
      setServices(Array.isArray(serviceData) ? serviceData : [])
    } catch (error) {
      if (error.name !== "AbortError") {
        setLoadError(error.message)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    loadData(controller.signal)

    return () => controller.abort()
  }, [loadData])

  const selectableServices = useMemo(() => {
    const selected = new Set(form.service_ids.map(Number))

    return services.filter(
      (service) =>
        service.status === "Available" ||
        selected.has(Number(service.service_id)),
    )
  }, [form.service_ids, services])

  const filteredStaff = useMemo(() => {
    const term = search.trim().toLowerCase()

    return staff.filter((member) => {
      const memberStatus = statusLabel(member).label

      const matchesSearch =
        !term ||
        member.name?.toLowerCase().includes(term) ||
        member.role?.toLowerCase().includes(term) ||
        member.services?.some((service) =>
          service.service?.toLowerCase().includes(term),
        )

      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Active" &&
          member.active_status === "Active") ||
        (statusFilter === "Inactive" &&
          member.active_status !== "Active") ||
        (statusFilter === "Available" &&
          memberStatus === "Available") ||
        (statusFilter === "Unavailable" &&
          memberStatus === "Unavailable today")

      return matchesSearch && matchesStatus
    })
  }, [search, staff, statusFilter])

  const metrics = useMemo(() => {
    const active = staff.filter(
      (member) => member.active_status === "Active",
    )

    return {
      total: staff.length,
      active: active.length,
      available: active.filter(
        (member) => member.daily_status === "Available",
      ).length,
      unavailable: active.filter(
        (member) => member.daily_status === "Unavailable",
      ).length,
    }
  }, [staff])

  function clearMessages() {
    setMutationError("")
    setSuccessMessage("")
  }

  function openNewStaffForm() {
    clearMessages()
    setEditingStaffId(null)
    setForm(blankForm())
    setShowStaffForm(true)
  }

  function editStaff(member) {
    clearMessages()

    const schedules = activeSchedules(member).map((schedule) => ({
      day_of_week: Number(schedule.day_of_week),
      shift_start: normalizeTime(schedule.shift_start),
      shift_end: normalizeTime(schedule.shift_end),
      break_start: normalizeTime(schedule.break_start),
      break_end: normalizeTime(schedule.break_end),
    }))

    setEditingStaffId(member.staff_id)
    setForm({
      name: member.name || "",
      role: member.role || "",
      active_status:
        member.active_status === "Inactive" ? "Inactive" : "Active",
      daily_status:
        member.daily_status === "Unavailable"
          ? "Unavailable"
          : "Available",
      service_ids: Array.isArray(member.service_ids)
        ? member.service_ids.map(Number)
        : [],
      schedules: schedules.length ? schedules : defaultSchedules(),
    })

    setShowStaffForm(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function closeStaffForm() {
    if (busyAction) return

    setShowStaffForm(false)
    setEditingStaffId(null)
    setForm(blankForm())
    setMutationError("")
  }

  function updateSchedule(index, field, value) {
    setForm((previous) => ({
      ...previous,
      schedules: previous.schedules.map((schedule, scheduleIndex) =>
        scheduleIndex === index
          ? { ...schedule, [field]: value }
          : schedule,
      ),
    }))
  }

  function addSchedule() {
    setForm((previous) => ({
      ...previous,
      schedules: [
        ...previous.schedules,
        {
          day_of_week: 1,
          shift_start: "09:00",
          shift_end: "18:00",
          break_start: "",
          break_end: "",
        },
      ],
    }))
  }

  function removeSchedule(index) {
    setForm((previous) => ({
      ...previous,
      schedules: previous.schedules.filter(
        (_, scheduleIndex) => scheduleIndex !== index,
      ),
    }))
  }

  function toggleService(serviceId) {
    const numericId = Number(serviceId)

    setForm((previous) => {
      const alreadySelected = previous.service_ids.includes(numericId)

      return {
        ...previous,
        service_ids: alreadySelected
          ? previous.service_ids.filter((id) => id !== numericId)
          : [...previous.service_ids, numericId],
      }
    })
  }

  function validateStaffForm() {
    if (!form.name.trim() || !form.role.trim()) {
      return "Staff name and role are required."
    }

    if (!form.service_ids.length) {
      return "Select at least one qualified service."
    }

    if (!form.schedules.length) {
      return "Add at least one working shift."
    }

    for (const schedule of form.schedules) {
      const shiftStart = normalizeTime(schedule.shift_start)
      const shiftEnd = normalizeTime(schedule.shift_end)
      const breakStart = normalizeTime(schedule.break_start)
      const breakEnd = normalizeTime(schedule.break_end)

      if (!shiftStart || !shiftEnd || shiftEnd <= shiftStart) {
        return "Each working day must have a valid shift start and shift end."
      }

      const hasBreakStart = Boolean(breakStart)
      const hasBreakEnd = Boolean(breakEnd)

      if (hasBreakStart !== hasBreakEnd) {
        return "Enter both the break start and break end, or leave both empty."
      }

      if (
        hasBreakStart &&
        (breakStart <= shiftStart ||
          breakEnd >= shiftEnd ||
          breakEnd <= breakStart)
      ) {
        return "Break time must be completely inside the staff member's working shift."
      }
    }

    const schedulesByDay = new Map()

    for (const schedule of form.schedules) {
      const day = Number(schedule.day_of_week)
      const existing = schedulesByDay.get(day) || []

      for (const other of existing) {
        if (
          normalizeTime(schedule.shift_start) <
            normalizeTime(other.shift_end) &&
          normalizeTime(schedule.shift_end) >
            normalizeTime(other.shift_start)
        ) {
          return "A staff member cannot have overlapping shifts on the same day."
        }
      }

      existing.push(schedule)
      schedulesByDay.set(day, existing)
    }

    return ""
  }

  async function submitStaff(event) {
    event.preventDefault()
    clearMessages()

    const validationError = validateStaffForm()

    if (validationError) {
      setMutationError(validationError)
      return
    }

    const action = editingStaffId ? "updating-staff" : "creating-staff"
    setBusyAction(action)

    try {
      const payload = {
        name: form.name.trim(),
        role: form.role.trim(),
        active_status: form.active_status,
        daily_status: form.daily_status,
        service_ids: form.service_ids.map(Number),
        schedules: form.schedules.map((schedule) => ({
          day_of_week: Number(schedule.day_of_week),
          shift_start: normalizeTime(schedule.shift_start),
          shift_end: normalizeTime(schedule.shift_end),
          break_start: normalizeTime(schedule.break_start) || null,
          break_end: normalizeTime(schedule.break_end) || null,
        })),
      }

      const result = await request(
        editingStaffId ? `/staff/${editingStaffId}` : "/staff",
        {
          method: editingStaffId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      )

      setSuccessMessage(
        result.message ||
          (editingStaffId
            ? "Staff member updated successfully."
            : "Staff member created successfully."),
      )

      setShowStaffForm(false)
      setEditingStaffId(null)
      setForm(blankForm())
      await loadData()
    } catch (error) {
      setMutationError(error.message)
    } finally {
      setBusyAction("")
    }
  }

  async function toggleDailyStatus(member) {
    clearMessages()

    const newStatus =
      member.daily_status === "Available"
        ? "Unavailable"
        : "Available"

    setBusyAction(`status-${member.staff_id}`)

    try {
      const result = await request(
        `/staff/${member.staff_id}/daily-status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            daily_status: newStatus,
          }),
        },
      )

      setSuccessMessage(
        result.message || "Daily availability updated.",
      )

      await loadData()
    } catch (error) {
      setMutationError(error.message)
    } finally {
      setBusyAction("")
    }
  }

  async function archiveStaff(member) {
    if (
      !window.confirm(
        `Deactivate ${member.name}? Existing appointment records will remain.`,
      )
    ) {
      return
    }

    clearMessages()
    setBusyAction(`archive-${member.staff_id}`)

    try {
      const result = await request(`/staff/${member.staff_id}`, {
        method: "DELETE",
      })

      setSuccessMessage(
        result.message || "Staff member deactivated.",
      )

      await loadData()
    } catch (error) {
      setMutationError(error.message)
    } finally {
      setBusyAction("")
    }
  }

  function openLeaveForm(member = null) {
    clearMessages()

    setLeaveForm({
      staff_id: member ? String(member.staff_id) : "",
      start_at: "",
      end_at: "",
      reason: "",
    })

    setShowLeaveForm(true)

    // The form is rendered above the staff directory. When this action is
    // opened from a staff card, move the page to the form so the click does
    // not appear to do nothing.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        leaveFormRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      })
    })
  }

  async function submitLeave(event) {
    event.preventDefault()
    clearMessages()

    if (
      !leaveForm.staff_id ||
      !leaveForm.start_at ||
      !leaveForm.end_at
    ) {
      setMutationError(
        "Select a staff member and enter the unavailable period.",
      )
      return
    }

    if (leaveForm.end_at <= leaveForm.start_at) {
      setMutationError(
        "The unavailable end time must be after the start time.",
      )
      return
    }

    setBusyAction("adding-leave")

    try {
      const result = await request(
        `/staff/${leaveForm.staff_id}/unavailability`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            start_at: leaveForm.start_at,
            end_at: leaveForm.end_at,
            reason:
              leaveForm.reason.trim() ||
              "Unavailable",
          }),
        },
      )

      setSuccessMessage(
        result.message || "Unavailability recorded.",
      )

      setShowLeaveForm(false)
      setLeaveForm(blankLeaveForm())
      await loadData()
    } catch (error) {
      setMutationError(error.message)
    } finally {
      setBusyAction("")
    }
  }

  async function removeLeave(unavailability) {
    if (
      !window.confirm(
        "Remove this unavailable period from the staff schedule?",
      )
    ) {
      return
    }

    clearMessages()
    setBusyAction(
      `remove-leave-${unavailability.unavailability_id}`,
    )

    try {
      const result = await request(
        `/staff/unavailability/${unavailability.unavailability_id}`,
        {
          method: "DELETE",
        },
      )

      setSuccessMessage(
        result.message || "Unavailability removed.",
      )

      await loadData()
    } catch (error) {
      setMutationError(error.message)
    } finally {
      setBusyAction("")
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-purple-600">
              Team management
            </p>

            <h1 className="mt-1 text-2xl font-bold text-gray-900 md:text-3xl">
              Staff
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              Manage staff qualifications, weekly shifts, break
              times, and date-specific unavailable periods.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryButton}
              onClick={() => openLeaveForm()}
              disabled={Boolean(busyAction)}
            >
              Add time away
            </button>

            <button
              type="button"
              className={primaryButton}
              onClick={openNewStaffForm}
              disabled={Boolean(busyAction)}
            >
              + Add staff member
            </button>
          </div>
        </div>
      </section>

      {loadError && <Notice>{loadError}</Notice>}

      {mutationError && <Notice>{mutationError}</Notice>}

      {successMessage && (
        <Notice type="success">{successMessage}</Notice>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Staff records",
            value: metrics.total,
            description: "Active and inactive records",
            color: "text-purple-700",
          },
          {
            label: "Active staff",
            value: metrics.active,
            description: "Can be scheduled",
            color: "text-blue-700",
          },
          {
            label: "Available today",
            value: metrics.available,
            description: "Marked available",
            color: "text-green-700",
          },
          {
            label: "Unavailable today",
            value: metrics.unavailable,
            description: "Temporarily unavailable",
            color: "text-orange-700",
          },
        ].map((metric) => (
          <article
            key={metric.label}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-gray-500">
              {metric.label}
            </p>

            <p className={`mt-2 text-3xl font-bold ${metric.color}`}>
              {metric.value}
            </p>

            <p className="mt-2 text-xs text-gray-500">
              {metric.description}
            </p>
          </article>
        ))}
      </section>

      {showStaffForm && (
        <form
          onSubmit={submitStaff}
          className="space-y-6 rounded-2xl border border-purple-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {editingStaffId
                  ? "Edit staff member"
                  : "Add staff member"}
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Break times are optional but must stay inside the
                working shift.
              </p>
            </div>

            <button
              type="button"
              className={secondaryButton}
              onClick={closeStaffForm}
              disabled={Boolean(busyAction)}
            >
              Cancel
            </button>
          </div>

          <fieldset
            disabled={Boolean(busyAction)}
            className="space-y-6 disabled:opacity-70"
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Staff name">
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Example: Maria Santos"
                  maxLength={120}
                  required
                />
              </Field>

              <Field label="Role or specialization">
                <input
                  className={inputClass}
                  value={form.role}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      role: event.target.value,
                    }))
                  }
                  placeholder="Example: Hair stylist"
                  maxLength={120}
                  required
                />
              </Field>

              <Field label="Account status">
                <select
                  className={inputClass}
                  value={form.active_status}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      active_status: event.target.value,
                    }))
                  }
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </Field>

              <Field label="Daily availability">
                <select
                  className={inputClass}
                  value={form.daily_status}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      daily_status: event.target.value,
                    }))
                  }
                >
                  <option value="Available">Available</option>
                  <option value="Unavailable">
                    Unavailable
                  </option>
                </select>
              </Field>
            </div>

            <div>
              <h3 className="text-base font-bold text-gray-900">
                Qualified services
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                The staff member can only be assigned to selected
                services.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {selectableServices.map((service) => {
                  const serviceId = Number(service.service_id)
                  const checked =
                    form.service_ids.includes(serviceId)

                  return (
                    <label
                      key={serviceId}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                        checked
                          ? "border-purple-400 bg-purple-50"
                          : "border-gray-200 hover:border-purple-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-purple-600"
                        checked={checked}
                        onChange={() => toggleService(serviceId)}
                      />

                      <span>
                        <span className="block text-sm font-semibold text-gray-800">
                          {service.service}
                        </span>

                        <span className="mt-1 block text-xs text-gray-500">
                          {service.category || "Uncategorized"}
                          {service.status !== "Available"
                            ? " · Currently unavailable"
                            : ""}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>

              {!selectableServices.length && (
                <p className="mt-3 text-sm text-orange-700">
                  No services are available. Add or activate a
                  service first.
                </p>
              )}
            </div>

            <div>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    Weekly schedule and breaks
                  </h3>

                  <p className="mt-1 text-sm text-gray-500">
                    Add the regular shifts. Leave both break fields
                    empty when the shift has no break.
                  </p>
                </div>

                <button
                  type="button"
                  className={secondaryButton}
                  onClick={addSchedule}
                >
                  + Add shift
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {form.schedules.map((schedule, index) => (
                  <div
                    key={`${index}-${schedule.day_of_week}`}
                    className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-2 xl:grid-cols-6"
                  >
                    <Field label="Working day">
                      <select
                        className={inputClass}
                        value={schedule.day_of_week}
                        onChange={(event) =>
                          updateSchedule(
                            index,
                            "day_of_week",
                            Number(event.target.value),
                          )
                        }
                      >
                        {DAYS.map((day) => (
                          <option
                            key={day.value}
                            value={day.value}
                          >
                            {day.label}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Shift start">
                      <input
                        type="time"
                        className={inputClass}
                        value={schedule.shift_start}
                        onChange={(event) =>
                          updateSchedule(
                            index,
                            "shift_start",
                            event.target.value,
                          )
                        }
                        required
                      />
                    </Field>

                    <Field label="Shift end">
                      <input
                        type="time"
                        className={inputClass}
                        value={schedule.shift_end}
                        onChange={(event) =>
                          updateSchedule(
                            index,
                            "shift_end",
                            event.target.value,
                          )
                        }
                        required
                      />
                    </Field>

                    <Field label="Break start (optional)">
                      <input
                        type="time"
                        className={inputClass}
                        value={schedule.break_start || ""}
                        onChange={(event) =>
                          updateSchedule(
                            index,
                            "break_start",
                            event.target.value,
                          )
                        }
                      />
                    </Field>

                    <Field label="Break end (optional)">
                      <input
                        type="time"
                        className={inputClass}
                        value={schedule.break_end || ""}
                        onChange={(event) =>
                          updateSchedule(
                            index,
                            "break_end",
                            event.target.value,
                          )
                        }
                      />
                    </Field>

                    <div className="flex items-end">
                      <button
                        type="button"
                        className={`${dangerButton} w-full`}
                        onClick={() => removeSchedule(index)}
                        disabled={form.schedules.length === 1}
                      >
                        Remove shift
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-5">
              <button
                type="button"
                className={secondaryButton}
                onClick={closeStaffForm}
              >
                Cancel
              </button>

              <button type="submit" className={primaryButton}>
                {busyAction === "creating-staff"
                  ? "Creating…"
                  : busyAction === "updating-staff"
                    ? "Saving…"
                    : editingStaffId
                      ? "Save changes"
                      : "Create staff member"}
              </button>
            </div>
          </fieldset>
        </form>
      )}

      {showLeaveForm && (
        <form
          ref={leaveFormRef}
          onSubmit={submitLeave}
          className="space-y-5 rounded-2xl border border-orange-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Record staff time away
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Use this for leave, appointments, training, or
                temporary unavailability.
              </p>
            </div>

            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                if (!busyAction) {
                  setShowLeaveForm(false)
                  setLeaveForm(blankLeaveForm())
                }
              }}
              disabled={Boolean(busyAction)}
            >
              Cancel
            </button>
          </div>

          <fieldset
            disabled={Boolean(busyAction)}
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 disabled:opacity-70"
          >
            <Field label="Staff member">
              <select
                className={inputClass}
                value={leaveForm.staff_id}
                onChange={(event) =>
                  setLeaveForm((previous) => ({
                    ...previous,
                    staff_id: event.target.value,
                  }))
                }
                required
              >
                <option value="">Select staff</option>

                {staff
                  .filter(
                    (member) =>
                      member.active_status === "Active",
                  )
                  .map((member) => (
                    <option
                      key={member.staff_id}
                      value={member.staff_id}
                    >
                      {member.name}
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="Unavailable from">
              <input
                type="datetime-local"
                className={inputClass}
                value={leaveForm.start_at}
                onChange={(event) =>
                  setLeaveForm((previous) => ({
                    ...previous,
                    start_at: event.target.value,
                  }))
                }
                required
              />
            </Field>

            <Field label="Unavailable until">
              <input
                type="datetime-local"
                className={inputClass}
                value={leaveForm.end_at}
                onChange={(event) =>
                  setLeaveForm((previous) => ({
                    ...previous,
                    end_at: event.target.value,
                  }))
                }
                required
              />
            </Field>

            <Field label="Reason">
              <input
                className={inputClass}
                value={leaveForm.reason}
                onChange={(event) =>
                  setLeaveForm((previous) => ({
                    ...previous,
                    reason: event.target.value,
                  }))
                }
                placeholder="Example: Personal leave"
                maxLength={255}
              />
            </Field>
          </fieldset>

          <div className="flex justify-end">
            <button
              type="submit"
              className={primaryButton}
              disabled={Boolean(busyAction)}
            >
              {busyAction === "adding-leave"
                ? "Saving…"
                : "Save time away"}
            </button>
          </div>
        </form>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-gray-200 p-5 md:p-6 lg:flex-row lg:items-end">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Staff directory
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {filteredStaff.length} of {staff.length} staff records
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Search">
              <input
                className={inputClass}
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Name, role, or service..."
              />
            </Field>

            <Field label="Status">
              <select
                className={inputClass}
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
              >
                <option value="All">All statuses</option>
                <option value="Active">Active records</option>
                <option value="Available">Available today</option>
                <option value="Unavailable">
                  Unavailable today
                </option>
                <option value="Inactive">Inactive records</option>
              </select>
            </Field>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Loading staff records…
          </div>
        ) : !filteredStaff.length ? (
          <div className="p-10 text-center">
            <p className="font-semibold text-gray-800">
              No staff records found
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Try another filter or add a staff member.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 p-4 md:p-6 xl:grid-cols-2">
            {filteredStaff.map((member) => {
              const status = statusLabel(member)
              const schedules = activeSchedules(member)
              const upcomingLeave = Array.isArray(
                member.unavailability,
              )
                ? member.unavailability
                : []

              return (
                <article
                  key={member.staff_id}
                  className="rounded-2xl border border-gray-200 p-5 transition hover:border-purple-200 hover:shadow-sm"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-100 font-bold text-purple-700">
                        {initials(member.name)}
                      </div>

                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-bold text-gray-900">
                          {member.name}
                        </h3>

                        <p className="text-sm text-gray-500">
                          {member.role}
                        </p>

                        <span
                          className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={secondaryButton}
                        onClick={() => editStaff(member)}
                        disabled={Boolean(busyAction)}
                      >
                        Edit
                      </button>

                      {member.active_status === "Active" && (
                        <button
                          type="button"
                          className={secondaryButton}
                          onClick={() =>
                            toggleDailyStatus(member)
                          }
                          disabled={Boolean(busyAction)}
                        >
                          {busyAction ===
                          `status-${member.staff_id}`
                            ? "Updating…"
                            : member.daily_status === "Available"
                              ? "Mark unavailable"
                              : "Mark available"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Qualified services
                    </h4>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {member.services?.length ? (
                        member.services.map((service) => (
                          <span
                            key={service.service_id}
                            className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700"
                          >
                            {service.service}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-orange-700">
                          No qualified services assigned
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Weekly shifts and breaks
                    </h4>

                    <div className="mt-2 space-y-2">
                      {schedules.length ? (
                        schedules.map((schedule) => {
                          const day = DAYS.find(
                            (item) =>
                              item.value ===
                              Number(schedule.day_of_week),
                          )

                          const hasBreak =
                            schedule.break_start &&
                            schedule.break_end

                          return (
                            <div
                              key={
                                schedule.schedule_id ||
                                `${schedule.day_of_week}-${schedule.shift_start}-${schedule.shift_end}`
                              }
                              className="flex flex-col justify-between gap-1 rounded-xl bg-gray-50 px-3 py-2 text-sm sm:flex-row sm:items-center"
                            >
                              <span className="font-semibold text-gray-700">
                                {day?.label || "Unknown day"}
                              </span>

                              <div className="text-gray-600 sm:text-right">
                                <p>
                                  {formatTime(
                                    schedule.shift_start,
                                  )}{" "}
                                  –{" "}
                                  {formatTime(schedule.shift_end)}
                                </p>

                                <p
                                  className={
                                    hasBreak
                                      ? "text-xs text-orange-700"
                                      : "text-xs text-gray-400"
                                  }
                                >
                                  {hasBreak
                                    ? `Break: ${formatTime(
                                        schedule.break_start,
                                      )} – ${formatTime(
                                        schedule.break_end,
                                      )}`
                                    : "No break recorded"}
                                </p>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <p className="text-sm text-orange-700">
                          No active working schedule
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        Upcoming time away
                      </h4>

                      {member.active_status === "Active" && (
                        <button
                          type="button"
                          className="text-xs font-semibold text-purple-700 hover:underline"
                          onClick={() => openLeaveForm(member)}
                          disabled={Boolean(busyAction)}
                        >
                          + Add
                        </button>
                      )}
                    </div>

                    <div className="mt-2 space-y-2">
                      {upcomingLeave.length ? (
                        upcomingLeave.map((leave) => (
                          <div
                            key={leave.unavailability_id}
                            className="rounded-xl border border-orange-100 bg-orange-50 p-3"
                          >
                            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                              <div>
                                <p className="text-sm font-semibold text-orange-900">
                                  {leave.reason ||
                                    "Unavailable"}
                                </p>

                                <p className="mt-1 text-xs leading-5 text-orange-700">
                                  {formatDateTime(
                                    leave.start_at,
                                  )}{" "}
                                  to{" "}
                                  {formatDateTime(leave.end_at)}
                                </p>
                              </div>

                              <button
                                type="button"
                                className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                                onClick={() =>
                                  removeLeave(leave)
                                }
                                disabled={Boolean(busyAction)}
                              >
                                {busyAction ===
                                `remove-leave-${leave.unavailability_id}`
                                  ? "Removing…"
                                  : "Remove"}
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">
                          No upcoming unavailable period recorded.
                        </p>
                      )}
                    </div>
                  </div>

                  {member.active_status === "Active" && (
                    <div className="mt-5 flex justify-end border-t border-gray-100 pt-4">
                      <button
                        type="button"
                        className={dangerButton}
                        onClick={() => archiveStaff(member)}
                        disabled={Boolean(busyAction)}
                      >
                        {busyAction ===
                        `archive-${member.staff_id}`
                          ? "Deactivating…"
                          : "Deactivate staff"}
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

export default AdminStaff

import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { LuCalendarDays, LuClock3, LuCreditCard, LuCircleCheck, LuArrowUpRight, LuReceiptText, LuRefreshCw } from "react-icons/lu"
import { API_URL, apiFetch } from "../lib/sessionApi"

const cards = [
  { label: "Appointments today", icon: LuCalendarDays, tint: "bg-purple-100 text-purple-700", key: "today" },
  { label: "Pending appointments", icon: LuClock3, tint: "bg-amber-100 text-amber-700", key: "pending" },
  { label: "Payments to review", icon: LuCreditCard, tint: "bg-blue-100 text-blue-700", key: "payments" },
  { label: "Completed today", icon: LuCircleCheck, tint: "bg-green-100 text-green-700", key: "completed" },
]
const localDate = (value) => {
  if (!value) return ""
  const date = new Date(String(value).replace(" ", "T"))
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
}
const appointmentDate = (a) => a.appointment_date ?? a.booking_date ?? a.date ?? a.start_at ?? a.start_time
const appointmentStatus = (a) => String(a.status ?? "").toLowerCase()

export default function FrontDeskDashboard() {
  const [data, setData] = useState({ appointments: [], payments: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError("")
      try {
        const responses = await Promise.all([
          apiFetch(`${API_URL}/appointments`, { signal: controller.signal, cache: "no-store" }),
          apiFetch(`${API_URL}/booking-payments/review`, { signal: controller.signal, cache: "no-store" }),
        ])
        if (responses.some((response) => !response.ok)) throw new Error("Could not load front desk activity. Please retry.")
        const [appointments, payments] = await Promise.all(responses.map((response) => response.json()))
        if (!Array.isArray(appointments) || !Array.isArray(payments)) throw new Error("Unexpected dashboard response format.")
        if (!controller.signal.aborted) setData({ appointments, payments })
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message || "Unable to load dashboard")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [refresh])

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
  const todaysAppointments = data.appointments.filter((a) => localDate(appointmentDate(a)) === today)
  const counts = {
    today: todaysAppointments.length,
    pending: data.appointments.filter((a) => appointmentStatus(a) === "pending").length,
    payments: data.payments.filter((p) => p.payment_status === "Awaiting Verification").length,
    completed: todaysAppointments.filter((a) => appointmentStatus(a) === "completed").length,
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-purple-100 bg-gradient-to-r from-purple-50 via-white to-fuchsia-50 p-5 md:p-7">
        <p className="text-xs font-bold uppercase tracking-widest text-purple-700">Reception workspace</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-bold tracking-tight text-gray-900">Front Desk Dashboard</h1><p className="mt-1 text-sm text-gray-600">Manage today's salon activity and customer checkouts.</p></div>
          <button type="button" onClick={() => setRefresh((n) => n + 1)} className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-white px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50"><LuRefreshCw /> Refresh</button>
        </div>
      </section>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Front desk activity">
        {cards.map(({ label, icon: Icon, tint, key }) => (
          <article key={key} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className={`inline-flex rounded-xl p-3 ${tint}`}><Icon className="size-5" aria-hidden="true" /></div>
            <p className="mt-3 text-sm text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{loading || error ? "—" : counts[key]}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Quick actions</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[["Appointments", "/admin/appointments", LuCalendarDays], ["Payment review", "/admin/payment-review", LuCreditCard], ["Open POS", "/admin/transactions", LuReceiptText], ["Emergency mode", "/admin/emergency", LuClock3]].map(([label, href, Icon]) => (
              <Link key={href} to={href} className="flex items-center gap-3 rounded-xl border border-purple-100 bg-purple-50/50 p-4 text-sm font-semibold text-purple-800 transition hover:border-purple-300 hover:bg-purple-100"><Icon className="size-5 shrink-0" /> <span className="flex-1">{label}</span><LuArrowUpRight /></Link>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-gray-900">Today's appointments</h2><Link className="text-sm font-semibold text-purple-700 hover:underline" to="/admin/appointments">View all</Link></div>
          {loading ? <p className="mt-5 text-sm text-gray-500">Loading appointments…</p> : error ? <p className="mt-5 text-sm text-gray-500">Data unavailable.</p> : todaysAppointments.length === 0 ? <p className="mt-5 text-sm text-gray-500">No appointments scheduled for today.</p> : (
            <div className="mt-4 space-y-2">{todaysAppointments.slice(0, 5).map((a, i) => (
              <div key={a.appointment_id ?? a.id ?? i} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm">
                <span className="min-w-0 truncate font-medium text-gray-800">{a.customer_name ?? a.customer?.name ?? a.name ?? `Appointment ${a.appointment_id ?? i + 1}`}</span>
                <span className="shrink-0 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold capitalize text-purple-700">{a.status ?? "Scheduled"}</span>
              </div>
            ))}</div>
          )}
        </div>
      </section>
    </div>
  )
}

import { useEffect, useRef, useState } from "react"
import { LuRefreshCw } from "react-icons/lu"
import { API_URL, apiFetch } from "../lib/sessionApi"
import { Button } from "../components/ui/button"
const peso = (v) => Number(v || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" })
const field = "block text-sm font-medium text-purple-900"
export default function AdminPaymentReview() {
    const [rows, setRows] = useState([])
    const [chosen, setChosen] = useState(null)
    const [form, setForm] = useState({
        reference: "",
        amount: "",
        note: "",
        confirm_received: false,
    })
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const lock = useRef(false)
    async function load(signal) {
        setLoading(true)
        try {
            const r = await apiFetch(`${API_URL}/booking-payments/review`, { signal })
            const data = await r.json()
            if (!r.ok || !Array.isArray(data))
                throw new Error(data.error || "Cannot load payments.")
            setRows(data)
        } catch (err) {
            if (!signal?.aborted) setError(err.message)
        } finally {
            if (!signal?.aborted) setLoading(false)
        }
    }
    useEffect(() => {
        const c = new AbortController()
        load(c.signal)
        return () => c.abort()
    }, [])
    async function review(action) {
        if (lock.current || !chosen) return
        if (action === "verify" && !form.confirm_received) {
            setError("Check the receiving GCash account and confirm receipt first.")
            return
        }
        if (action === "reject" && !form.note.trim()) {
            setError("Enter a rejection reason.")
            return
        }
        lock.current = true
        setBusy(true)
        setError("")
        setMessage("")
        try {
            const r = await apiFetch(`${API_URL}/booking-payments/review/${chosen.deposit_id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, action }),
            })
            const data = await r.json()
            if (!r.ok) throw new Error(data.error || "Cannot review payment.")
            setChosen(null)
            setMessage(data.message)
            await load()
        } catch (err) {
            setError(err.message)
        } finally {
            lock.current = false
            setBusy(false)
        }
    }
    return (
        <div className="space-y-6">
            <header className="dashboard-heading">
                <div className="flex flex-wrap items-start justify-between gap-5">
                    <div>
                        <p className="eyebrow">DEPOSITS AWAITING YOU</p>
                        <h1>Confirm what has arrived.</h1>
                        <p className="dashboard-subtitle">
                            Check each deposit against your GCash account before approving the
                            appointment.
                        </p>
                    </div>
                    <Button
                        disabled={busy || loading}
                        onClick={() => load()}
                        variant="outline"
                        size="sm"
                        className="bg-white"
                    >
                        <LuRefreshCw /> Refresh
                    </Button>
                </div>
            </header>
            {error && (
                <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </p>
            )}
            {message && (
                <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">
                    {message}
                </p>
            )}
            {chosen && (
                <section className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm md:p-6">
                    <h2 className="text-lg font-bold text-purple-950">
                        Payment details for booking #{chosen.appointment_id} —{" "}
                        {chosen.customer_name}
                    </h2>
                    <p className="mt-2 text-sm text-gray-500">
                        Receiving account shown to customer: {chosen.receiving_name} ·{" "}
                        {chosen.receiving_number}
                    </p>
                    <div className="mb-5 mt-3 grid gap-2 rounded-xl bg-purple-50 p-4 text-sm text-gray-700 md:grid-cols-2">
                        <p>Required deposit: {peso(chosen.required_amount)}</p>
                        <p>Submitted amount: {peso(chosen.submitted_amount)}</p>
                        <p>
                            Customer reference: {chosen.submitted_reference || "Not provided"}
                        </p>
                        <p>
                            Payment status: <strong>{chosen.payment_status}</strong>
                        </p>
                    </div>
                    {chosen.payment_status === "Awaiting Verification" ? (
                    <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
                        <label className={field}>
                            Actual received reference
                            <input
                                className="input-field mt-2"
                                value={form.reference}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, reference: e.target.value }))
                                }
                            />
                        </label>
                        <label className={field}>
                            Actual received amount (₱)
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                className="input-field mt-2"
                                value={form.amount}
                                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                            />
                        </label>
                        <label className={`${field} md:col-span-2`}>
                            Review note / rejection reason
                            <textarea
                                className="input-field mt-2"
                                maxLength={500}
                                value={form.note}
                                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                            />
                        </label>
                        <label className="flex gap-3 text-sm text-gray-600 md:col-span-2">
                            <input
                                type="checkbox"
                                className="accent-purple-700"
                                checked={form.confirm_received}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, confirm_received: e.target.checked }))
                                }
                            />
                            I checked the receiving account and confirmed this payment was received.
                        </label>
                        <div className="flex flex-wrap gap-3 md:col-span-2">
                            <Button
                                type="button"
                                disabled={!form.confirm_received || busy}
                                onClick={() => review("verify")}
                            >
                                Verify payment
                            </Button>
                            <Button
                                type="button"
                                disabled={busy}
                                onClick={() => review("reject")}
                                className="bg-red-50 text-red-700 hover:bg-red-100"
                            >
                                Reject payment
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setChosen(null)}>
                                Close
                            </Button>
                        </div>
                    </fieldset>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-purple-100 p-4 text-sm text-gray-600">
                                <p className="font-medium text-purple-950">Review note</p>
                                <p className="mt-1">
                                    {chosen.review_note || "No review note was recorded."}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setChosen(null)}
                            >
                                Close details
                            </Button>
                        </div>
                    )}
                </section>
            )}
            <div className="overflow-x-auto rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
                <table className="w-full min-w-[750px] text-left text-sm">
                    <thead>
                        <tr>
                            {[
                                "Booking",
                                "Service / date",
                                "Deposit",
                                "Reference",
                                "Status",
                                "Payment Review",
                            ].map((h) => (
                                <th className="p-3 text-gray-500" key={h}>
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-100">
                        {rows.map((row) => (
                            <tr key={row.deposit_id}>
                                <td className="p-3">
                                    #{row.appointment_id} · {row.customer_name}
                                    <br />
                                    {row.contact_number}
                                </td>
                                <td className="p-3">
                                    {row.service}
                                    <br />
                                    {row.appointment_date}
                                </td>
                                <td className="p-3">{peso(row.required_amount)}</td>
                                <td className="p-3">{row.submitted_reference}</td>
                                <td className="p-3">{row.payment_status}</td>
                                <td className="p-3">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        disabled={busy || loading}
                                        onClick={() => {
                                            setChosen(row)
                                            setForm({
                                                reference: row.submitted_reference || "",
                                                amount: row.submitted_amount || "",
                                                note: row.review_note || "",
                                                confirm_received: false,
                                            })
                                            setError("")
                                            setMessage("")
                                        }}
                                    >
                                        {row.payment_status === "Awaiting Verification"
                                            ? "Review Payment"
                                            : "View Details"}
                                    </Button>
                                </td>
                            </tr>
                        ))}
                        {!rows.length && (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-gray-500">
                                    {loading ? "Loading…" : "No submitted payments yet."}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

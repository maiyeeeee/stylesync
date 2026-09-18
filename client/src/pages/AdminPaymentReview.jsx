import { useEffect, useRef, useState } from 'react'
import { API_URL, apiFetch } from '../lib/sessionApi'
const peso = v => Number(v || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
const input = 'mt-2 w-full rounded-xl border border-slate-200 px-4 py-3'
export default function AdminPaymentReview() {
  const [rows, setRows] = useState([])
  const [chosen, setChosen] = useState(null)
  const [form, setForm] = useState({ reference: '', amount: '', note: '', confirm_received: false })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  async function load(signal) {
    setLoading(true)
    try {
      const r = await apiFetch(`${API_URL}/booking-payments/review`, { signal })
      const data = await r.json()
      if (!r.ok || !Array.isArray(data)) throw new Error(data.error || 'Cannot load payments.')
      setRows(data)
    } catch (err) { if (!signal?.aborted) setError(err.message) }
    finally { if (!signal?.aborted) setLoading(false) }
  }
  useEffect(() => { const c = new AbortController(); load(c.signal); return () => c.abort() }, [])
  async function review(action) {
    if (lock.current || !chosen) return
    if (action === 'verify' && !form.confirm_received) { setError('Check the receiving GCash account and confirm receipt first.'); return }
    if (action === 'reject' && !form.note.trim()) { setError('Enter a rejection reason.'); return }
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const r = await apiFetch(`${API_URL}/booking-payments/review/${chosen.deposit_id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, action }) })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Cannot review payment.')
      setChosen(null); setMessage(data.message); await load()
    } catch (err) { setError(err.message) }
    finally { lock.current = false; setBusy(false) }
  }
  return <div className="space-y-6"><header className="flex flex-wrap justify-between gap-4"><div><h1 className="text-3xl font-bold text-purple-950">Payment review</h1><p className="mt-2 text-slate-500">Confirm received deposits before appointment approval.</p></div><button disabled={busy || loading} onClick={() => load()} className="rounded-xl border px-4 py-2">Refresh</button></header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}{message && <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{message}</p>}
    {chosen && <section className="rounded-2xl border border-purple-100 bg-white p-6"><h2 className="text-xl font-bold text-purple-900">Review booking #{chosen.appointment_id} — {chosen.customer_name}</h2><p className="my-3 text-sm">Receiving account shown to customer: {chosen.receiving_name} · {chosen.receiving_number}</p><p className="mb-4 text-sm">Requested: {peso(chosen.required_amount)} · Customer reference: {chosen.submitted_reference}</p>
      <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2"><label>Actual received reference<input className={input} value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} /></label><label>Actual received amount (₱)<input type="number" min="0.01" step="0.01" className={input} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></label><label className="md:col-span-2">Review note / rejection reason<textarea className={input} maxLength={500} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></label><label className="flex gap-3 md:col-span-2"><input type="checkbox" checked={form.confirm_received} onChange={e => setForm(f => ({ ...f, confirm_received: e.target.checked }))} />I checked the receiving account and confirmed this payment was received.</label><div className="flex flex-wrap gap-3 md:col-span-2"><button disabled={!form.confirm_received || busy} onClick={() => review('verify')} className="rounded-xl bg-purple-700 px-4 py-3 text-white disabled:opacity-50">Verify payment</button><button onClick={() => review('reject')} className="rounded-xl bg-red-50 px-4 py-3 text-red-700">Reject and release slot</button><button onClick={() => setChosen(null)} className="rounded-xl border px-4 py-3">Close</button></div></fieldset>
    </section>}
    <div className="overflow-x-auto rounded-2xl border border-purple-100 bg-white p-5"><table className="w-full min-w-[750px] text-left text-sm"><thead className="bg-slate-50"><tr>{['Booking', 'Service / date', 'Deposit', 'Reference', 'Status', 'Action'].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.deposit_id}><td className="p-3">#{row.appointment_id} · {row.customer_name}<br />{row.contact_number}</td><td className="p-3">{row.service}<br />{row.appointment_date}</td><td className="p-3">{peso(row.required_amount)}</td><td className="p-3">{row.submitted_reference}</td><td className="p-3">{row.payment_status}</td><td className="p-3">{row.payment_status === 'Awaiting Verification' && <button disabled={busy || loading} onClick={() => { setChosen(row); setForm({ reference: row.submitted_reference || '', amount: row.submitted_amount || '', note: '', confirm_received: false }); setError('') }} className="rounded-lg bg-purple-50 px-3 py-2 font-semibold text-purple-700">Review</button>}</td></tr>)}{!rows.length && <tr><td colSpan={6} className="p-8 text-center">{loading ? 'Loading…' : 'No submitted payments yet.'}</td></tr>}</tbody></table></div>
  </div>
}

import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')
const API = base.endsWith('/api') ? base : `${base}/api`
const input = 'w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-purple-200'
const button = 'rounded-xl bg-purple-700 px-5 py-3 font-semibold text-white disabled:opacity-50'
const peso = value => Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
const KEY = 'stylesync-payment-reservation-v1'
function readSaved() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') } catch { return null } }
async function call(path, { method = 'GET', body, token, signal } = {}) {
  const headers = {}
  if (token) headers['X-Booking-Token'] = token
  if (method !== 'GET') {
    let response = await fetch(`${API}/auth/session`, { credentials: 'include', cache: 'no-store' })
    if (response.status === 401) response = await fetch(`${API}/auth/session`, { credentials: 'include', cache: 'no-store' })
    const session = await response.json()
    if (!response.ok || !session.csrfToken) throw new Error('Refresh the page to prepare a secure booking.')
    headers['X-CSRF-Token'] = session.csrfToken
    headers['Content-Type'] = 'application/json'
  }
  const response = await fetch(`${API}${path}`, { method, credentials: 'include', cache: 'no-store', headers, body: body ? JSON.stringify(body) : undefined, signal })
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { status: response.status })
  return data
}
function Field({ label, children }) { return <label className="block"><span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>{children}</label> }
export default function Book() {
  const location = useLocation()
  const [services, setServices] = useState([])
  const [form, setForm] = useState({ customer_name: '', contact_number: '', email: '', gender: 'Prefer not to say', customer_type: 'Regular', service_id: '', appointment_date: '', appointment_time: '', notes: '' })
  const [entry, setEntry] = useState(readSaved)
  const [reservation, setReservation] = useState(null)
  const [availability, setAvailability] = useState(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reference, setReference] = useState('')
  const [clock, setClock] = useState(Date.now())
  const [offset, setOffset] = useState(0)
  const lock = useRef(false)
  const mutationVersion = useRef(0)
  const selected = services.find(s => String(s.service_id) === String(form.service_id))
  const availabilityKey = `${form.service_id}|${form.appointment_date}|${form.appointment_time}`
  const validAvailability = availability?.key === availabilityKey && Number(availability.available_count) > 0
  const seconds = reservation ? Math.max(0, Math.ceil((Date.parse(reservation.expires_at) - clock - offset) / 1000)) : 0
  function accept(data) { setReservation(data); setOffset(Date.parse(data.server_now) - Date.now()) }
  useEffect(() => {
    const controller = new AbortController()
    call('/services', { signal: controller.signal }).then(rows => {
      if (!Array.isArray(rows)) throw new Error('Cannot load services.')
      const list = rows.filter(s => s.status === 'Available')
      setServices(list)
      const chosen = list.find(s => s.service === location.state?.selectedService)
      if (chosen) setForm(f => ({ ...f, service_id: String(chosen.service_id) }))
    }).catch(err => { if (!controller.signal.aborted) setError(err.message) })
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [location.state?.selectedService])
  useEffect(() => {
    if (!entry?.token) return
    const controller = new AbortController()
    let running = false
    async function refresh() {
      if (running || lock.current) return
      const version = mutationVersion.current
      running = true
      try { const data = await call('/booking-payments/reservation', { token: entry.token, signal: controller.signal }); if (!controller.signal.aborted && version === mutationVersion.current && !lock.current) { accept(data); setError('') } }
      catch (err) { if (!controller.signal.aborted && version === mutationVersion.current && !lock.current) setError(err.status === 404 ? 'Reservation not confirmed yet. Use Retry reservation below.' : err.message) }
      finally { running = false }
    }
    refresh()
    const timer = setInterval(refresh, 10000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [entry])
  useEffect(() => {
    setAvailability(null)
    if (entry || !form.service_id || !form.appointment_date || !form.appointment_time) { setChecking(false); return }
    const controller = new AbortController()
    setChecking(true)
    const query = new URLSearchParams({ service_id: form.service_id, appointment_date: form.appointment_date, appointment_time: form.appointment_time })
    call(`/appointments/availability?${query}`, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setAvailability({ ...data, key: availabilityKey })
    }).catch(err => { if (!controller.signal.aborted) setError(err.message) }).finally(() => { if (!controller.signal.aborted) setChecking(false) })
    return () => controller.abort()
  }, [form.service_id, form.appointment_date, form.appointment_time, availabilityKey, entry])
  function change(event) { const { name, value } = event.target; setForm(f => ({ ...f, [name]: value })); setError('') }
  async function reserve(event) {
    event?.preventDefault()
    if (lock.current) return
    if (!entry && !validAvailability) { setError('Choose an available slot first.'); return }
    lock.current = true; mutationVersion.current++; setBusy(true); setError('')
    let saved = entry
    try {
      if (!saved) {
        const bytes = crypto.getRandomValues(new Uint8Array(32))
        saved = { token: Array.from(bytes, x => x.toString(16).padStart(2, '0')).join(''), payload: form }
        // Persist before reserving so a lost response can be safely retried.
        sessionStorage.setItem(KEY, JSON.stringify(saved))
        setEntry(saved)
      }
      accept(await call('/booking-payments/reserve', { method: 'POST', token: saved.token, body: saved.payload }))
    } catch (err) {
      setError(err.message)
      if (err.status === 400 || err.status === 409) {
        try { sessionStorage.removeItem(KEY) } catch { /* unchanged form remains available */ }
        setEntry(null)
      }
    } finally { lock.current = false; setBusy(false) }
  }
  async function submit(event) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; mutationVersion.current++; setBusy(true); setError('')
    try { accept(await call('/booking-payments/submit', { method: 'POST', token: entry.token, body: { reference, amount: reservation.required_amount } })) }
    catch (err) { setError(err.message) }
    finally { lock.current = false; setBusy(false) }
  }
  function newBooking() {
    sessionStorage.removeItem(KEY); setEntry(null); setReservation(null); setReference(''); setError(''); setAvailability(null)
  }
  const total = Math.round(Number(selected?.price || 0) * 100)
  const down = Math.round(total / 5)
  const dateParts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = key => dateParts.find(p => p.type === key)?.value
  const today = `${part('year')}-${part('month')}-${part('day')}`
  return <div className="min-h-screen bg-pink-50"><Navbar /><main className="mx-auto max-w-2xl px-4 py-12"><section className="rounded-3xl bg-white p-6 shadow-lg md:p-10">
    <h1 className="text-center text-3xl font-bold text-purple-800">Book an Appointment</h1>
    <p className="mb-6 mt-3 text-center text-sm text-slate-500">Reserve your slot, then submit your 20% GCash payment within 15 minutes.</p>
    {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {entry ? !reservation ? <div className="space-y-4"><p>Checking your reservation…</p><button disabled={busy} onClick={() => reserve()} className={button}>Retry reservation</button></div> : <div className="space-y-5">
      <div className="rounded-xl bg-purple-50 p-4 text-purple-900"><p className="font-bold">Booking #{reservation.appointment_id} · {reservation.service}</p><p>{reservation.appointment_date} · {reservation.start_time}–{reservation.end_time}</p></div>
      {reservation.payment_status === 'Awaiting Payment' ? <>
        <p className="text-center text-lg font-bold text-purple-800">Time remaining: {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>
        {seconds > 0 ? <>
          <p className="text-sm text-slate-600">Scan or save this QR and pay the exact amount below. Submit your reference before the countdown ends.</p>
          {reservation.qr_snapshot && <img src={reservation.qr_snapshot} alt="GCash payment QR" className="mx-auto max-h-[520px] max-w-full rounded-xl object-contain" />}
          <div className="rounded-xl border border-purple-100 p-4 text-center"><p className="font-semibold">{reservation.receiving_name}</p><p>{reservation.receiving_number}</p><p className="mt-3 text-3xl font-bold text-purple-800">{peso(reservation.required_amount)}</p><p className="mt-1 text-sm text-slate-500">20% down payment · Service total {peso(reservation.service_total)}</p></div>
          <form onSubmit={submit} className="space-y-4"><Field label="Reference number from the completed GCash payment"><input className={input} value={reference} onChange={e => setReference(e.target.value)} required minLength={6} maxLength={100} pattern="[A-Za-z0-9-]+" /></Field><button disabled={busy || !seconds} className={`${button} w-full`}>{busy ? 'Submitting…' : 'Submit payment for verification'}</button></form>
        </> : <p className="rounded-xl bg-amber-50 p-4">The payment window has ended. Checking the final reservation status… Do not send a new payment.</p>}
        <p className="text-xs text-slate-500">If no payment reference is submitted within 15 minutes, the reservation is cancelled. If you paid but could not submit in time, contact the salon and keep your receipt. Do not pay twice.</p>
      </> : <>
        <p role="status" className="rounded-xl bg-purple-50 p-4 text-purple-900">{reservation.payment_status === 'Awaiting Verification' ? 'Your payment details were submitted. The salon will verify receipt before reviewing your appointment.' : reservation.payment_status === 'Verified' ? `Payment verified. Appointment status: ${reservation.appointment_status}.` : 'This reservation is closed and its slot has been released. If you sent a payment, contact the salon with your receipt.'}</p>
        <p className="text-sm text-slate-500">Payment status: {reservation.payment_status}</p>
        <button className={button} onClick={newBooking}>Start another booking</button>
      </>}
    </div> : <form onSubmit={reserve}><fieldset disabled={busy} className="space-y-5">
      <Field label="Full name"><input className={input} name="customer_name" value={form.customer_name} onChange={change} required maxLength={100} autoComplete="name" /></Field>
      <Field label="Contact number"><input className={input} name="contact_number" value={form.contact_number} onChange={change} required pattern="09[0-9]{9}" type="tel" placeholder="09XXXXXXXXX" /></Field>
      <Field label="Email (optional)"><input className={input} name="email" value={form.email} onChange={change} type="email" maxLength={100} /></Field>
      <div className="grid gap-4 md:grid-cols-2"><Field label="Gender (optional)"><select className={input} name="gender" value={form.gender} onChange={change}><option>Prefer not to say</option><option>Female</option><option>Male</option></select></Field><Field label="Customer type"><select className={input} name="customer_type" value={form.customer_type} onChange={change}>{['Regular','Student','Senior Citizen','PWD'].map(s => <option key={s}>{s}</option>)}</select></Field></div>
      <Field label="Service"><select required className={input} name="service_id" value={form.service_id} onChange={change}><option value="">Select a service</option>{services.map(s => <option key={s.service_id} value={s.service_id}>{s.service} · {s.duration_minutes || 60} min · {peso(s.price)}</option>)}</select></Field>
      <div className="grid gap-4 md:grid-cols-2"><Field label="Appointment date"><input type="date" required min={today} className={input} name="appointment_date" value={form.appointment_date} onChange={change} /></Field><Field label="Start time"><input type="time" required className={input} name="appointment_time" value={form.appointment_time} onChange={change} /></Field></div>
      <p className="text-xs text-slate-500">Times use Philippine time. Choose a slot more than 15 minutes from now.</p>
      {checking && <p role="status">Checking availability…</p>}
      {availability?.key === availabilityKey && <p className="rounded-xl bg-purple-50 p-4 text-purple-800">{validAvailability ? `Available: ${availability.start_time}–${availability.end_time}` : 'Slot unavailable. Choose another time.'}</p>}
      {selected && <p className="rounded-xl bg-purple-50 p-4 text-purple-800">Required down payment (20%): <strong>{peso(down / 100)}</strong><br />Estimated salon balance: {peso((total - down) / 100)}</p>}
      <Field label="Additional notes"><textarea className={input} name="notes" value={form.notes} onChange={change} maxLength={4000} rows={3} /></Field>
      <button className={`${button} w-full`} disabled={busy || checking || !validAvailability || !total}>{busy ? 'Reserving…' : 'Reserve and pay 20%'}</button>
    </fieldset></form>}
  </section></main><Footer /></div>
}

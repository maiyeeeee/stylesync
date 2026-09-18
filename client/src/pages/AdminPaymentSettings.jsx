import { useEffect, useRef, useState } from 'react'
import { API_URL, apiFetch } from '../lib/sessionApi'
const input = 'w-full rounded-xl border border-slate-200 px-4 py-3'
export default function AdminPaymentSettings() {
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const lock = useRef(false)
  async function load(signal) {
    try {
      const response = await apiFetch(`${API_URL}/booking-payments/settings`, { signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Cannot load settings.')
      setSettings(data); setError('')
    } catch (err) { if (!signal?.aborted) setError(err.message) }
  }
  useEffect(() => { const c = new AbortController(); load(c.signal); return () => c.abort() }, [])
  function update(key, value) { setSettings(s => ({ ...s, [key]: value })); setMessage('') }
  async function fileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 1024 * 1024) { setError('Choose a PNG or JPG image no larger than 1 MB.'); return }
    setReading(true); setError('')
    try {
      const value = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('Cannot read image.')); r.readAsDataURL(file) })
      update('qr_data', value)
    } catch (err) { setError(err.message) }
    finally { setReading(false) }
  }
  async function save(event) {
    event.preventDefault()
    if (lock.current || reading) return
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const response = await apiFetch(`${API_URL}/booking-payments/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Cannot save settings.')
      setMessage(data.message)
      await load()
    } catch (err) { setError(err.message) }
    finally { lock.current = false; setBusy(false) }
  }
  return <div className="max-w-3xl space-y-6"><header><h1 className="text-3xl font-bold text-purple-950">GCash payment settings</h1><p className="mt-2 text-slate-500">Owner-only settings for new online reservations.</p></header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error} <button disabled={busy} onClick={() => load()} className="underline">Reload</button></p>}
    {message && <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{message}</p>}
    {settings && <form onSubmit={save} className="rounded-2xl border border-purple-100 bg-white p-6 shadow-sm"><fieldset disabled={busy || reading} className="space-y-5">
      <label className="block">Account name<input required maxLength={150} className={`${input} mt-2`} value={settings.receiving_name} onChange={e => update('receiving_name', e.target.value)} /></label>
      <label className="block">GCash number<input required pattern="09[0-9]{9}" className={`${input} mt-2`} value={settings.receiving_number} onChange={e => update('receiving_number', e.target.value)} /></label>
      <label className="block">Replace QR image<input type="file" accept="image/png,image/jpeg" className="mt-2 block w-full text-sm" onChange={fileChange} /></label>
      <p className="text-xs text-slate-500">PNG or JPG, up to 1 MB. Upload the actual receiving account’s QR.</p>
      <img src={settings.qr_data} alt="Receiving GCash QR preview" className="mx-auto max-h-96 max-w-full rounded-xl object-contain" />
      <label className="flex items-center gap-3"><input type="checkbox" checked={Boolean(settings.enabled)} onChange={e => update('enabled', e.target.checked)} />Accept new online payment reservations</label>
      <p className="rounded-xl bg-purple-50 p-4 text-sm text-purple-900">Changes apply to new reservations. Existing reservations retain their original QR, account name, and number. Verify that the QR and entered recipient details match before saving.</p>
      <button className="rounded-xl bg-purple-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : reading ? 'Reading image…' : 'Save payment settings'}</button>
    </fieldset></form>}
  </div>
}

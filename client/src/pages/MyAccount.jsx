import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

const configuredApi = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "")
const API_URL = configuredApi.endsWith("/api") ? configuredApi : `${configuredApi}/api`

const passwordFields = [
  { name: "currentPassword", label: "Current Password", autocomplete: "current-password" },
  { name: "newPassword", label: "New Password", autocomplete: "new-password" },
  { name: "confirmPassword", label: "Confirm New Password", autocomplete: "new-password" },
]

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: "include",
    cache: "no-store",
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.error || "Unable to complete the request.")
    error.status = response.status
    throw error
  }
  if (!data) throw new Error("Invalid server response. Check the API connection.")
  return data
}

function MyAccount() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" })

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError("")

    request("/auth/session", { signal: controller.signal })
      .then((data) => {
        if (!active) return
        if (!data.user) {
          navigate("/login", { replace: true })
          return
        }
        setUser(data.user)
      })
      .catch((err) => {
        if (!active || err.name === "AbortError") return
        if (err.status === 401) navigate("/login", { replace: true })
        else setError(err instanceof TypeError ? "Cannot connect to the server. Please try again." : err.message)
      })
      .finally(() => { if (active) setLoading(false) })

    return () => { active = false; controller.abort() }
  }, [navigate, retry])

  function returnToLogin(message) {
    try {
      localStorage.removeItem("user")
      localStorage.setItem("stylesync-logout-event", String(Date.now()))
    } catch {
      // Login navigation does not depend on browser storage.
    }
    window.dispatchEvent(new Event("auth-expired"))
    navigate("/login", { replace: true, state: { message } })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving) return
    setError("")

    if (form.newPassword !== form.confirmPassword) {
      setError("New passwords do not match.")
      return
    }
    if (form.newPassword.length < 8 || new TextEncoder().encode(form.newPassword).length > 72) {
      setError("New password must contain at least 8 characters and at most 72 bytes.")
      return
    }
    if (form.currentPassword === form.newPassword) {
      setError("Choose a password different from your current password.")
      return
    }

    setSaving(true)
    try {
      const session = await request("/auth/session")
      if (!session.user) {
        returnToLogin("Please log in again.")
        return
      }
      if (String(session.user.user_id) !== String(user.user_id)) {
        setError("The signed-in account changed. Reload this page before continuing.")
        return
      }
      if (!session.csrfToken) throw new Error("Unable to verify this request. Refresh and try again.")

      const data = await request("/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
        body: JSON.stringify(form),
      })
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
      returnToLogin(data.message)
    } catch (err) {
      if (err.status === 401) returnToLogin("Your session expired. Please log in again.")
      else setError(err instanceof TypeError
        ? "Could not confirm the update. Check your connection; if submitted, try signing in with your new password."
        : err.message)
    } finally { setSaving(false) }
  }

  if (loading) return <p role="status" className="p-6 text-gray-600">Loading your account…</p>

  if (!user) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow">
        <p role="alert" className="mb-4 text-red-600">{error || "Unable to load your account."}</p>
        <button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded-xl bg-purple-700 px-5 py-2 text-white">Retry</button>
      </div>
    )
  }

  return (
    <>
      <h2 className="mb-2 text-4xl font-bold text-purple-800">My Account</h2>
      <p className="mb-8 text-gray-600">Manage your account and password.</p>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <section className="rounded-2xl bg-white p-8 text-center shadow">
          <div aria-hidden="true" className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-purple-100 text-4xl font-bold text-purple-700">
            {user.username?.charAt(0).toUpperCase()}
          </div>
          <h3 className="break-words text-2xl font-bold">{user.username}</h3>
          <span className="mt-3 inline-block rounded-full bg-purple-100 px-4 py-1 font-semibold capitalize text-purple-700">{user.role}</span>
          <p className="mt-5 text-sm text-gray-500">Signed in account</p>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow md:p-8 xl:col-span-2">
          <h3 className="mb-2 text-2xl font-bold text-purple-700">Change Password</h3>
          <p className="mb-6 text-gray-600">Update the password for your own account.</p>
          {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}

          <form onSubmit={handleSubmit}>
            <fieldset disabled={saving} className="space-y-5">
              {passwordFields.map((field) => (
                <div key={field.name}>
                  <label htmlFor={field.name} className="mb-2 block font-semibold">{field.label}</label>
                  <input
                    id={field.name}
                    name={field.name}
                    type={showPasswords ? "text" : "password"}
                    autoComplete={field.autocomplete}
                    value={form[field.name]}
                    onChange={(event) => setForm((previous) => ({ ...previous, [field.name]: event.target.value }))}
                    minLength={field.name === "currentPassword" ? undefined : 8}
                    required
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                  />
                  {field.name === "newPassword" && <p className="mt-2 text-sm text-gray-500">Use at least 8 characters.</p>}
                </div>
              ))}

              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} className="accent-purple-700" />
                Show passwords
              </label>

              <div className="flex flex-wrap gap-3">
                <button type="submit" className="rounded-xl bg-pink-500 px-6 py-3 font-semibold text-white hover:bg-pink-600 disabled:opacity-60">
                  {saving ? "Updating…" : "Update Password"}
                </button>
                <button type="button" disabled={saving} onClick={() => navigate("/admin")} className="rounded-xl border border-purple-700 px-6 py-3 font-semibold text-purple-700 disabled:opacity-60">Cancel</button>
              </div>
            </fieldset>
          </form>

          <p className="mt-5 text-sm text-gray-500">After updating, sign in again with your new password. Other sessions for your account will also need to sign in again.</p>
          <Link to="/admin" className="mt-4 inline-block text-sm font-semibold text-purple-700">Back to Dashboard</Link>
        </section>
      </div>
    </>
  )
}

export default MyAccount

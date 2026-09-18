import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { LuArrowUpRight, LuKeyRound, LuShieldCheck } from "react-icons/lu"
import { Button } from "../components/ui/button"
import { API_URL } from "../lib/sessionApi"

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
                else
                    setError(
                        err instanceof TypeError
                            ? "Cannot connect to the server. Please try again."
                            : err.message,
                    )
            })
            .finally(() => {
                if (active) setLoading(false)
            })

        return () => {
            active = false
            controller.abort()
        }
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
            if (!session.csrfToken)
                throw new Error("Unable to verify this request. Refresh and try again.")

            const data = await request("/auth/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
                body: JSON.stringify(form),
            })
            setForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
            returnToLogin(data.message)
        } catch (err) {
            if (err.status === 401) returnToLogin("Your session expired. Please log in again.")
            else
                setError(
                    err instanceof TypeError
                        ? "Could not confirm the update. Check your connection; if submitted, try signing in with your new password."
                        : err.message,
                )
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div
                role="status"
                className="rounded-2xl border border-purple-100 bg-white p-8 text-purple-700"
            >
                Loading your account…
            </div>
        )
    }

    if (!user) {
        return (
            <div role="alert" className="rounded-2xl bg-red-50 p-6 text-red-800">
                <p>{error || "Unable to load your account."}</p>
                <Button
                    type="button"
                    onClick={() => setRetry((value) => value + 1)}
                    className="mt-4"
                >
                    Retry
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <header className="dashboard-heading">
                <p className="eyebrow">YOUR ACCOUNT</p>
                <h1>Keeping your account safe.</h1>
                <p className="dashboard-subtitle">
                    Review the account you are signed in with and update its password.
                </p>
            </header>

            <div className="grid items-start gap-6 xl:grid-cols-3">
                <section className="min-w-0 rounded-2xl border border-purple-100 bg-white p-6 text-center shadow-sm md:p-8">
                    <div
                        aria-hidden="true"
                        className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-purple-100 font-display text-4xl font-medium text-purple-700"
                    >
                        {user.username?.charAt(0).toUpperCase()}
                    </div>

                    <h2 className="break-words font-display text-3xl font-medium text-purple-950">
                        {user.username}
                    </h2>

                    <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-purple-50 px-4 py-1 text-xs font-semibold capitalize text-purple-700">
                        <LuShieldCheck aria-hidden="true" /> {user.role}
                    </span>

                    <p className="mt-5 text-xs text-gray-500">
                        This is the account currently signed in on this device.
                    </p>
                </section>

                <section className="min-w-0 rounded-2xl border border-purple-100 bg-white p-5 shadow-sm md:p-6 xl:col-span-2">
                    <div className="mb-5 flex items-center gap-3 border-b border-purple-100 pb-5">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-700">
                            <LuKeyRound aria-hidden="true" />
                        </span>

                        <div>
                            <h3 className="text-lg font-bold text-purple-950">Change password</h3>
                            <p className="mt-1 text-sm text-gray-500">
                                Update the password for your own account.
                            </p>
                        </div>
                    </div>

                    {error && (
                        <p
                            role="alert"
                            className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700"
                        >
                            {error}
                        </p>
                    )}

                    <form onSubmit={handleSubmit}>
                        <fieldset disabled={saving} className="space-y-5">
                            {passwordFields.map((field) => (
                                <div key={field.name}>
                                    <label
                                        htmlFor={field.name}
                                        className="mb-2 block text-sm font-medium text-purple-900"
                                    >
                                        {field.label}
                                    </label>
                                    <input
                                        id={field.name}
                                        name={field.name}
                                        type={showPasswords ? "text" : "password"}
                                        autoComplete={field.autocomplete}
                                        value={form[field.name]}
                                        onChange={(event) =>
                                            setForm((previous) => ({
                                                ...previous,
                                                [field.name]: event.target.value,
                                            }))
                                        }
                                        minLength={field.name === "currentPassword" ? undefined : 8}
                                        required
                                        className="input-field"
                                    />
                                    {field.name === "newPassword" && (
                                        <p className="mt-2 text-xs text-gray-500">
                                            Use at least 8 characters.
                                        </p>
                                    )}
                                </div>
                            ))}

                            <label className="flex items-center gap-2 text-sm text-gray-600">
                                <input
                                    type="checkbox"
                                    checked={showPasswords}
                                    onChange={(event) => setShowPasswords(event.target.checked)}
                                    className="accent-purple-700"
                                />
                                Show passwords
                            </label>

                            <div className="flex flex-wrap gap-3">
                                <Button type="submit">
                                    {saving ? "Updating…" : "Update password"}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={saving}
                                    onClick={() => navigate("/admin")}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </fieldset>
                    </form>

                    <p className="mt-5 text-xs leading-relaxed text-gray-500">
                        After updating, sign in again with your new password. Other sessions for
                        your account will also need to sign in again.
                    </p>

                    <Link
                        to="/admin"
                        className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-purple-700 hover:underline"
                    >
                        Back to dashboard <LuArrowUpRight aria-hidden="true" />
                    </Link>
                </section>
            </div>
        </div>
    )
}

export default MyAccount

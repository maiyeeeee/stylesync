import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import AuthLayout from "../components/AuthLayout"
import { API_URL } from "../lib/sessionApi"

export default function AdminRegister() {
    const location = useLocation()
    const navigate = useNavigate()

    // Owner invitation codes are read from the private link.
    const [initialToken] = useState(() => {
        const parameters = new URLSearchParams(location.hash.slice(1))
        return parameters.get("owner-invite") || ""
    })

    const [ownerMode, setOwnerMode] = useState(Boolean(initialToken))

    const [form, setForm] = useState({
        username: "",
        email: "",
        password: "",
        confirmPassword: "",
        token: initialToken,
    })

    const [showPassword, setShowPassword] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")

    const handleChange = (event) => {
        const { name, value } = event.target

        setForm((previous) => ({
            ...previous,
            [name]: value,
        }))
    }

    async function handleSubmit(event) {
        event.preventDefault()

        if (busy) return

        setError("")

        if (form.password !== form.confirmPassword) {
            setError("Passwords do not match.")
            return
        }

        if (new TextEncoder().encode(form.password).length > 72) {
            setError("Password must not exceed 72 bytes.")
            return
        }

        setBusy(true)

        try {
            // Start a session and obtain a CSRF token.
            // The visitor does not need to be logged in.
            let sessionResponse = await fetch(`${API_URL}/auth/session`, {
                credentials: "include",
                cache: "no-store",
            })

            if (sessionResponse.status === 401) {
                sessionResponse = await fetch(`${API_URL}/auth/session`, {
                    credentials: "include",
                    cache: "no-store",
                })
            }

            const session = await sessionResponse.json().catch(() => null)

            if (!sessionResponse.ok || !session?.csrfToken) {
                throw new Error("Unable to connect to registration. Please try again.")
            }

            const endpoint = ownerMode ? "owner-registration" : "signup"

            const response = await fetch(`${API_URL}/auth/${endpoint}`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": session.csrfToken,
                },
                body: JSON.stringify({
                    username: form.username.trim(),
                    email: form.email.trim(),
                    password: form.password,
                    confirmPassword: form.confirmPassword,
                    ...(ownerMode ? { token: form.token.trim() } : {}),
                }),
            })

            const data = await response.json().catch(() => null)

            if (!response.ok) {
                throw new Error(data?.error || "Registration failed. Please try again.")
            }

            setForm({
                username: "",
                email: "",
                password: "",
                confirmPassword: "",
                token: "",
            })

            // Registration does not automatically log the account in.
            navigate("/admin-login", {
                replace: true,
                state: {
                    message: data.message,
                },
            })
        } catch (err) {
            setError(
                err instanceof TypeError
                    ? "Cannot connect to the server. Please try again."
                    : err.message,
            )
        } finally {
            setBusy(false)
        }
    }

    return (
        <AuthLayout
            title={ownerMode ? "Your salon. Your account." : "Join the salon team."}
            subtitle={
                ownerMode
                    ? "Use your private owner invitation and choose your own login details."
                    : "Create your staff login. The salon owner will review your request."
            }
        >
            <div className="auth-tabs" aria-label="Registration type">
                <button
                    type="button"
                    disabled={busy}
                    aria-pressed={!ownerMode}
                    onClick={() => {
                        setOwnerMode(false)
                        setError("")
                    }}
                >
                    Staff registration
                </button>

                <button
                    type="button"
                    disabled={busy}
                    aria-pressed={ownerMode}
                    onClick={() => {
                        setOwnerMode(true)
                        setError("")
                    }}
                >
                    Owner invitation
                </button>
            </div>

            {error && (
                <p role="alert" className="auth-notice auth-error">
                    {error}
                </p>
            )}

            <form onSubmit={handleSubmit}>
                <fieldset disabled={busy} className="auth-fields">
                    {ownerMode && (
                        <div>
                            <label htmlFor="owner-token" className="auth-label">
                                Owner invitation code
                            </label>

                            <input
                                id="owner-token"
                                name="token"
                                type="text"
                                autoComplete="off"
                                className="auth-input"
                                value={form.token}
                                onChange={handleChange}
                                placeholder="Code from your private invitation"
                                required
                            />

                            <p className="auth-small">
                                An existing owner generates this in Accounts. This is not a public
                                owner sign-up.
                            </p>
                        </div>
                    )}

                    <div>
                        <label htmlFor="register-username" className="auth-label">
                            Username
                        </label>

                        <input
                            id="register-username"
                            name="username"
                            type="text"
                            autoComplete="username"
                            className="auth-input"
                            minLength={3}
                            maxLength={50}
                            pattern="[A-Za-z0-9_.\-]{3,50}"
                            title="3–50 letters, numbers, dots, underscores, or hyphens"
                            placeholder="Choose your username"
                            value={form.username}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="register-email" className="auth-label">
                            Email address
                        </label>

                        <input
                            id="register-email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            className="auth-input"
                            maxLength={254}
                            placeholder={
                                ownerMode ? "Email used for your invitation" : "you@example.com"
                            }
                            value={form.email}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="auth-pair">
                        <div>
                            <label htmlFor="register-password" className="auth-label">
                                Password
                            </label>

                            <div className="auth-password">
                                <input
                                    id="register-password"
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="new-password"
                                    className="auth-input"
                                    minLength={8}
                                    placeholder="8+ characters"
                                    value={form.password}
                                    onChange={handleChange}
                                    required
                                />

                                <button
                                    type="button"
                                    className="auth-reveal"
                                    aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? "Hide" : "Show"}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="register-confirm" className="auth-label">
                                Confirm password
                            </label>

                            <input
                                id="register-confirm"
                                name="confirmPassword"
                                type={showPassword ? "text" : "password"}
                                autoComplete="new-password"
                                className="auth-input"
                                minLength={8}
                                placeholder="Repeat password"
                                value={form.confirmPassword}
                                onChange={handleChange}
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className="auth-submit">
                        {busy
                            ? "Submitting…"
                            : ownerMode
                              ? "Create Owner Account"
                              : "Submit Registration Request"}
                    </button>
                </fieldset>
            </form>

            <hr className="auth-divider" />

            <p className="auth-switch">
                Already registered? <Link to="/admin-login">Back to Login</Link>
            </p>
        </AuthLayout>
    )
}

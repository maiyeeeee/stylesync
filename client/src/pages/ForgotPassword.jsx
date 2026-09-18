import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import AuthLayout from "../components/AuthLayout"
import { API_URL } from "../lib/sessionApi"

export default function ForgotPassword() {
    const location = useLocation()
    const navigate = useNavigate()

    const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get("token") || "")

    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")

    async function submit(event) {
        event.preventDefault()
        if (busy) return

        setError("")
        setMessage("")

        if (token && password !== confirmPassword) {
            setError("Passwords do not match.")
            return
        }

        if (token && new TextEncoder().encode(password).length > 72) {
            setError("Password must not exceed 72 bytes.")
            return
        }

        setBusy(true)

        try {
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
                throw new Error("Unable to connect. Refresh and try again.")
            }

            const endpoint = token ? "reset-password" : "forgot-password"

            const response = await fetch(`${API_URL}/auth/${endpoint}`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": session.csrfToken,
                },
                body: JSON.stringify(
                    token ? { token, password, confirmPassword } : { email: email.trim() },
                ),
            })

            const data = await response.json().catch(() => null)

            if (!response.ok) {
                throw new Error(data?.error || "Request failed. Please try again.")
            }

            if (token) {
                setPassword("")
                setConfirmPassword("")

                navigate("/admin-login", {
                    replace: true,
                    state: { message: data.message },
                })
            } else {
                setMessage(data.message)
            }
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
            title={token ? "Choose a new password." : "Forgot your password?"}
            subtitle={
                token
                    ? "Create a new password for your salon account."
                    : "Enter your registered email to receive a private reset link."
            }
        >
            {error && (
                <p role="alert" className="auth-notice auth-error">
                    {error}
                </p>
            )}

            {message && (
                <p role="status" className="auth-notice auth-success">
                    {message}
                </p>
            )}

            <form onSubmit={submit}>
                <fieldset disabled={busy} className="auth-fields">
                    {token ? (
                        <>
                            <div>
                                <label htmlFor="reset-password" className="auth-label">
                                    New password
                                </label>

                                <div className="auth-password">
                                    <input
                                        id="reset-password"
                                        type={showPassword ? "text" : "password"}
                                        autoComplete="new-password"
                                        required
                                        minLength={8}
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        className="auth-input"
                                    />

                                    <button
                                        type="button"
                                        className="auth-reveal"
                                        aria-label={
                                            showPassword ? "Hide passwords" : "Show passwords"
                                        }
                                        onClick={() => setShowPassword(!showPassword)}
                                    >
                                        {showPassword ? "Hide" : "Show"}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="reset-confirm" className="auth-label">
                                    Confirm new password
                                </label>

                                <input
                                    id="reset-confirm"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="new-password"
                                    required
                                    minLength={8}
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    className="auth-input"
                                />
                            </div>
                        </>
                    ) : (
                        <div>
                            <label htmlFor="recovery-email" className="auth-label">
                                Registered email
                            </label>

                            <input
                                id="recovery-email"
                                type="email"
                                autoComplete="email"
                                required
                                maxLength={254}
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                className="auth-input"
                                placeholder="you@example.com"
                            />
                        </div>
                    )}

                    <button type="submit" className="auth-submit">
                        {busy ? "Please wait..." : token ? "Save new password" : "Send reset link"}
                    </button>
                </fieldset>
            </form>

            <hr className="auth-divider" />

            <p className="auth-switch">
                <Link to="/admin-login">Back to Login</Link>
            </p>

            {token && (
                <p className="auth-small">
                    <a href="/forgot-password">Request a new reset link</a>
                </p>
            )}
        </AuthLayout>
    )
}

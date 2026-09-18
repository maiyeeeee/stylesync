import { useState } from "react"
import { LuArrowRight, LuEye, LuEyeOff } from "react-icons/lu"
import { Link, useLocation, useNavigate } from "react-router-dom"
import AuthLayout from "../components/AuthLayout"

const configuredApi = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "")

const API_URL = configuredApi.endsWith("/api") ? configuredApi : `${configuredApi}/api`

function AdminLogin() {
    const navigate = useNavigate()
    const location = useLocation()

    const [form, setForm] = useState({
        username: "",
        password: "",
    })

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [showPassword, setShowPassword] = useState(false)

    async function handleSubmit(event) {
        event.preventDefault()

        if (loading) return

        setLoading(true)
        setError("")

        try {
            let sessionResponse = await fetch(`${API_URL}/auth/session`, {
                credentials: "include",
                cache: "no-store",
            })

            // Retry after the server clears an expired session.
            if (sessionResponse.status === 401) {
                sessionResponse = await fetch(`${API_URL}/auth/session`, {
                    credentials: "include",
                    cache: "no-store",
                })
            }

            const session = await sessionResponse.json().catch(() => null)

            if (!sessionResponse.ok || !session?.csrfToken) {
                throw new Error("Unable to connect to the login service. Please try again.")
            }

            const response = await fetch(`${API_URL}/auth/login`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": session.csrfToken,
                },
                body: JSON.stringify({
                    username: form.username.trim(),
                    password: form.password,
                }),
            })

            const data = await response.json().catch(() => null)

            if (!response.ok) {
                throw new Error(data?.error || "Login failed. Please try again.")
            }

            if (!["owner", "admin"].includes(data?.user?.role)) {
                throw new Error("An owner or admin account is required.")
            }

            if (
                !data.csrfToken ||
                !Number.isFinite(data.expiresAt) ||
                data.expiresAt <= Date.now()
            ) {
                throw new Error("Unable to confirm your login session. Please try again.")
            }

            try {
                localStorage.removeItem("user")
            } catch {
                // Authentication uses the server session cookie.
            }

            navigate("/admin", { replace: true })
        } catch (err) {
            setError(
                err instanceof TypeError
                    ? "Cannot connect to the server. Please try again."
                    : err.message,
            )
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthLayout
            title="Welcome back."
            subtitle="Log in to your owner or approved staff account to manage your salon day."
        >
            {location.state?.message && (
                <p role="status" className="auth-notice auth-success">
                    {location.state.message}
                </p>
            )}

            {error && (
                <p role="alert" className="auth-notice auth-error">
                    {error}
                </p>
            )}

            <form onSubmit={handleSubmit}>
                <fieldset disabled={loading} className="auth-fields">
                    <div>
                        <label htmlFor="admin-username" className="auth-label">
                            Username or Email
                        </label>

                        <input
                            id="admin-username"
                            name="username"
                            type="text"
                            autoComplete="username"
                            placeholder="Enter your username or email"
                            required
                            value={form.username}
                            onChange={(event) =>
                                setForm((previous) => ({
                                    ...previous,
                                    username: event.target.value,
                                }))
                            }
                            className="auth-input"
                        />
                    </div>

                    <div>
                        <label htmlFor="admin-password" className="auth-label">
                            Password
                        </label>

                        <div className="auth-password">
                            <input
                                id="admin-password"
                                name="password"
                                type={showPassword ? "text" : "password"}
                                autoComplete="current-password"
                                placeholder="Enter your password"
                                required
                                value={form.password}
                                onChange={(event) =>
                                    setForm((previous) => ({
                                        ...previous,
                                        password: event.target.value,
                                    }))
                                }
                                className="auth-input"
                            />

                            <button
                                type="button"
                                className="auth-reveal"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? (
                                    <LuEyeOff aria-hidden="true" />
                                ) : (
                                    <LuEye aria-hidden="true" />
                                )}
                            </button>
                        </div>
                    </div>

                    <p className="auth-switch" style={{ textAlign: "right" }}>
                        <Link to="/forgot-password">Forgot password?</Link>
                    </p>

                    <button type="submit" className="auth-submit">
                        {loading ? (
                            "Logging in…"
                        ) : (
                            <>
                                Log in to workspace <LuArrowRight aria-hidden="true" />
                            </>
                        )}
                    </button>
                </fieldset>
            </form>

            <hr className="auth-divider" />

            <p className="auth-switch">
                New to the team? <Link to="/admin-register">Register Account</Link>
            </p>

            <p className="auth-small">
                Staff requests require owner approval. Owner registration requires a private
                invitation.
            </p>
        </AuthLayout>
    )
}

export default AdminLogin

import { useEffect, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { LuArrowLeft, LuLockKeyhole, LuTriangleAlert } from "react-icons/lu"
import Brand from "./Brand"
import { Button } from "./ui/button"
import { API_URL } from "../lib/sessionApi"

function ProtectedRoutes({ children, allowedRoles = ["admin", "owner"] }) {
    const [session, setSession] = useState({
        status: "checking",
        user: null,
    })

    const [retryCount, setRetryCount] = useState(0)

    useEffect(() => {
        let active = true
        let requestId = 0
        let expiryTimer
        let verifiedUntil = 0

        const clearSession = () => {
            requestId += 1
            verifiedUntil = 0
            clearTimeout(expiryTimer)

            if (active) {
                setSession({ status: "unauthenticated", user: null })
            }
        }

        const checkSession = async () => {
            // An already verified tab may continue during a connection loss,
            // but only until the expiry previously supplied by the server.
            if (!navigator.onLine && verifiedUntil > Date.now()) {
                return
            }

            const currentRequest = ++requestId

            try {
                const response = await fetch(`${API_URL}/auth/session`, {
                    credentials: "include",
                    cache: "no-store",
                })

                if (!active || currentRequest !== requestId) return

                if (response.status === 401) {
                    clearSession()
                    return
                }

                if (!response.ok) {
                    throw new Error("Session verification failed.")
                }

                const data = await response.json()

                if (!active || currentRequest !== requestId) return

                const expiresAt = Number(data.expiresAt)

                if (!data.user || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
                    clearSession()
                    return
                }

                verifiedUntil = expiresAt
                clearTimeout(expiryTimer)

                setSession({
                    status: "authenticated",
                    user: data.user,
                })

                expiryTimer = setTimeout(clearSession, Math.max(0, expiresAt - Date.now()))
            } catch {
                if (!active || currentRequest !== requestId) return

                verifiedUntil = 0
                clearTimeout(expiryTimer)
                setSession({ status: "error", user: null })
            }
        }

        const handleStorage = (event) => {
            if (event.key === "stylesync-logout-event") {
                clearSession()
            }
        }

        setSession({ status: "checking", user: null })
        checkSession()

        window.addEventListener("auth-expired", clearSession)
        window.addEventListener("storage", handleStorage)
        window.addEventListener("online", checkSession)
        window.addEventListener("focus", checkSession)

        return () => {
            active = false
            requestId += 1
            clearTimeout(expiryTimer)

            window.removeEventListener("auth-expired", clearSession)
            window.removeEventListener("storage", handleStorage)
            window.removeEventListener("online", checkSession)
            window.removeEventListener("focus", checkSession)
        }
    }, [retryCount])

    if (session.status === "checking") {
        return (
            <div
                role="status"
                className="grid min-h-screen place-items-center bg-background px-5 text-sm text-muted-foreground"
            >
                <div className="text-center">
                    <Brand className="justify-center" />
                    <p className="mt-6">Checking your session…</p>
                </div>
            </div>
        )
    }

    if (session.status === "unauthenticated") {
        return <Navigate to="/login" replace />
    }

    if (session.status === "error") {
        return (
            <SessionGate
                icon={LuTriangleAlert}
                title="We can’t reach your session."
                message="Check your connection and make sure the server is running, then try again."
            >
                <Button type="button" onClick={() => setRetryCount((count) => count + 1)}>
                    Try again
                </Button>
            </SessionGate>
        )
    }

    if (!allowedRoles.includes(session.user.role)) {
        return (
            <SessionGate
                icon={LuLockKeyhole}
                title="This page is kept private."
                message="Your account does not have permission to open this page. Sign in with an account that does."
            />
        )
    }

    return children
}

function SessionGate({ icon: Icon, title, message, children }) {
    return (
        <main className="grid min-h-screen place-items-center bg-background px-5 py-12">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm md:p-10">
                <Brand className="justify-center" />

                <span
                    aria-hidden="true"
                    className="mx-auto mt-8 grid size-12 place-items-center rounded-full bg-accent text-lg text-primary"
                >
                    <Icon />
                </span>

                <h1 className="mt-5 font-display text-3xl font-medium text-foreground">{title}</h1>

                <p role="alert" className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {message}
                </p>

                <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                    {children}

                    <Button asChild variant="outline">
                        <Link to="/login">
                            <LuArrowLeft aria-hidden="true" /> Back to login
                        </Link>
                    </Button>
                </div>
            </div>
        </main>
    )
}

export default ProtectedRoutes

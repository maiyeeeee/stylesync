import { useEffect, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import {
    LuArrowLeft,
    LuTriangleAlert,
} from "react-icons/lu"

import Brand from "./Brand"
import { Button } from "./ui/button"
import { API_URL } from "../lib/sessionApi"

const OFFLINE_SESSION_KEY = "stylesync-offline-session"

function saveOfflineSession(user, expiresAt) {
    try {
        localStorage.setItem(
            OFFLINE_SESSION_KEY,
            JSON.stringify({
                user,
                expiresAt,
            }),
        )
    } catch {
        // Ignore storage errors.
    }
}

function getOfflineSession() {
    try {
        const raw = localStorage.getItem(
            OFFLINE_SESSION_KEY,
        )

        if (!raw) {
            return null
        }

        const data = JSON.parse(raw)
        const expiresAt = Number(
            data?.expiresAt,
        )

        if (
            !data?.user ||
            !Number.isFinite(expiresAt)
        ) {
            return null
        }

        return {
            user: data.user,
            expiresAt,
        }
    } catch {
        return null
    }
}

function clearOfflineSession() {
    try {
        localStorage.removeItem(
            OFFLINE_SESSION_KEY,
        )
    } catch {
        // Ignore storage errors.
    }
}

function ProtectedRoutes({
    children,
    allowedRoles = ["admin", "owner"],
}) {
    const [session, setSession] = useState({
        status: "checking",
        user: null,
    })

    const [retryCount, setRetryCount] =
        useState(0)

    useEffect(() => {
        let active = true
        let requestId = 0
        let expiryTimer
        let verifiedUntil = 0

        const clearSession = () => {
            requestId += 1
            verifiedUntil = 0

            clearTimeout(expiryTimer)
            clearOfflineSession()

            if (active) {
                setSession({
                    status: "unauthenticated",
                    user: null,
                })
            }
        }

        const useOfflineSession = () => {
            const offlineSession =
                getOfflineSession()

            if (
                !offlineSession ||
                offlineSession.expiresAt <=
                    Date.now()
            ) {
                return false
            }

            verifiedUntil =
                offlineSession.expiresAt

            clearTimeout(expiryTimer)

            if (active) {
                setSession({
                    status: "authenticated",
                    user: offlineSession.user,
                })
            }

            expiryTimer = setTimeout(
                clearSession,
                Math.max(
                    0,
                    offlineSession.expiresAt -
                        Date.now(),
                ),
            )

            return true
        }

        const checkSession = async () => {
            if (!navigator.onLine) {
                const restored =
                    useOfflineSession()

                if (!restored && active) {
                    setSession({
                        status: "error",
                        user: null,
                    })
                }

                return
            }

            if (
                verifiedUntil >
                Date.now()
            ) {
                return
            }

            const currentRequest =
                ++requestId

            try {
                const response = await fetch(
                    `${API_URL}/auth/session`,
                    {
                        credentials: "include",
                        cache: "no-store",
                    },
                )

                if (
                    !active ||
                    currentRequest !== requestId
                ) {
                    return
                }

                if (response.status === 401) {
                    clearSession()
                    return
                }

                if (!response.ok) {
                    throw new Error(
                        "Session verification failed.",
                    )
                }

                const data =
                    await response.json()

                if (
                    !active ||
                    currentRequest !== requestId
                ) {
                    return
                }

                const expiresAt = Number(
                    data.expiresAt,
                )

                if (
                    !data.user ||
                    !Number.isFinite(
                        expiresAt,
                    ) ||
                    expiresAt <= Date.now()
                ) {
                    clearSession()
                    return
                }

                verifiedUntil = expiresAt

                clearTimeout(expiryTimer)

                saveOfflineSession(
                    data.user,
                    expiresAt,
                )

                setSession({
                    status: "authenticated",
                    user: data.user,
                })

                expiryTimer = setTimeout(
                    clearSession,
                    Math.max(
                        0,
                        expiresAt -
                            Date.now(),
                    ),
                )
            } catch {
                if (
                    !active ||
                    currentRequest !== requestId
                ) {
                    return
                }

                verifiedUntil = 0
                clearTimeout(expiryTimer)

                /*
                 * If the network request fails,
                 * try restoring the last verified
                 * session before showing an error.
                 */
                const restored =
                    useOfflineSession()

                if (!restored && active) {
                    setSession({
                        status: "error",
                        user: null,
                    })
                }
            }
        }

        const handleStorage = (event) => {
            if (
                event.key ===
                "stylesync-logout-event"
            ) {
                clearSession()
            }
        }

        const handleOffline = () => {
            const restored =
                useOfflineSession()

            if (!restored && active) {
                setSession({
                    status: "error",
                    user: null,
                })
            }
        }

        setSession({
            status: "checking",
            user: null,
        })

        checkSession()

        window.addEventListener(
            "auth-expired",
            clearSession,
        )

        window.addEventListener(
            "storage",
            handleStorage,
        )

        window.addEventListener(
            "online",
            checkSession,
        )

        window.addEventListener(
            "offline",
            handleOffline,
        )

        window.addEventListener(
            "focus",
            checkSession,
        )

        return () => {
            active = false
            requestId += 1

            clearTimeout(expiryTimer)

            window.removeEventListener(
                "auth-expired",
                clearSession,
            )

            window.removeEventListener(
                "storage",
                handleStorage,
            )

            window.removeEventListener(
                "online",
                checkSession,
            )

            window.removeEventListener(
                "offline",
                handleOffline,
            )

            window.removeEventListener(
                "focus",
                checkSession,
            )
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

                    <p className="mt-6">
                        Checking your session…
                    </p>
                </div>
            </div>
        )
    }

    if (
        session.status ===
        "unauthenticated"
    ) {
        return (
            <Navigate
                to="/login"
                replace
            />
        )
    }

    if (session.status === "error") {
        return (
            <SessionGate
                icon={LuTriangleAlert}
                title={
                    navigator.onLine
                        ? "We can’t reach your session."
                        : "Offline access is unavailable."
                }
                message={
                    navigator.onLine
                        ? "Check your connection and make sure the server is running, then try again."
                        : "Connect to the internet and sign in once before using emergency offline mode."
                }
            >
                <Button
                    type="button"
                    onClick={() =>
                        setRetryCount(
                            (count) =>
                                count + 1,
                        )
                    }
                >
                    Try again
                </Button>
            </SessionGate>
        )
    }

    if (
        !allowedRoles.includes(
            session.user.role,
        )
    ) {
        const destination =
            session.user.role === "user"
                ? "/admin/appointments"
                : "/admin"

        return (
            <Navigate
                to={destination}
                replace
            />
        )
    }

    return children
}

function SessionGate({
    icon: Icon,
    title,
    message,
    children,
}) {
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

                <h1 className="mt-5 font-display text-3xl font-medium text-foreground">
                    {title}
                </h1>

                <p
                    role="alert"
                    className="mt-3 text-sm leading-relaxed text-muted-foreground"
                >
                    {message}
                </p>

                <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                    {children}

                    <Button
                        asChild
                        variant="outline"
                    >
                        <Link to="/login">
                            <LuArrowLeft aria-hidden="true" />
                            Back to login
                        </Link>
                    </Button>
                </div>
            </div>
        </main>
    )
}

export default ProtectedRoutes

import { useEffect, useState } from "react"
import { Link, Navigate } from "react-router-dom"

const configuredApi = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/+$/, "")

const API_URL = configuredApi.endsWith("/api")
  ? configuredApi
  : `${configuredApi}/api`

function ProtectedRoutes({
  children,
  allowedRoles = ["admin", "owner"],
}) {
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

        if (
          !data.user ||
          !Number.isFinite(expiresAt) ||
          expiresAt <= Date.now()
        ) {
          clearSession()
          return
        }

        verifiedUntil = expiresAt
        clearTimeout(expiryTimer)

        setSession({
          status: "authenticated",
          user: data.user,
        })

        expiryTimer = setTimeout(
          clearSession,
          Math.max(0, expiresAt - Date.now())
        )
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
        className="min-h-screen flex items-center justify-center bg-gray-100 text-purple-700"
      >
        Checking your session...
      </div>
    )
  }

  if (session.status === "unauthenticated") {
    return <Navigate to="/login" replace />
  }

  if (session.status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
        <div className="bg-white rounded-2xl shadow p-8 text-center">
          <p role="alert" className="text-red-700 mb-4">
            Cannot verify your session. Check your connection and
            make sure the server is running.
          </p>

          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="bg-purple-700 text-white px-5 py-2 rounded-xl"
          >
            Try Again
          </button>

          <Link
            to="/login"
            className="block mt-4 text-purple-700"
          >
            Back to Login
          </Link>
        </div>
      </div>
    )
  }

  if (!allowedRoles.includes(session.user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
        <div className="bg-white rounded-2xl shadow p-8 text-center">
          <h1 className="text-2xl font-bold text-red-700 mb-3">
            Access Denied
          </h1>

          <p className="text-gray-600">
            Your account does not have permission to open this page.
          </p>

          <Link
            to="/login"
            className="inline-block mt-5 text-purple-700 font-semibold"
          >
            Back to Login
          </Link>
        </div>
      </div>
    )
  }

  return children
}

export default ProtectedRoutes
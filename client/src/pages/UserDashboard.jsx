import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"

const configuredApi = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/+$/, "")

const API_URL = configuredApi.endsWith("/api")
  ? configuredApi
  : `${configuredApi}/api`

function UserDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const finishLogout = () => {
    localStorage.removeItem("user")
    localStorage.setItem("stylesync-logout-event", String(Date.now()))
    window.dispatchEvent(new Event("auth-expired"))

    navigate("/login", {
      replace: true,
      state: { message: "You have been logged out." },
    })
  }

  const handleLogout = async () => {
    if (loading) return

    setLoading(true)
    setError("")

    try {
      const sessionResponse = await fetch(`${API_URL}/auth/session`, {
        credentials: "include",
        cache: "no-store",
      })

      if (sessionResponse.status === 401) {
        finishLogout()
        return
      }

      if (!sessionResponse.ok) {
        throw new Error("Cannot verify your session.")
      }

      const sessionData = await sessionResponse.json()

      if (!sessionData.csrfToken) {
        throw new Error("Cannot verify your session.")
      }

      const response = await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "X-CSRF-Token": sessionData.csrfToken,
        },
      })

      if (!response.ok && response.status !== 401) {
        throw new Error("Logout failed.")
      }

      finishLogout()
    } catch {
      setError(
        "Logout could not be completed. Check your connection and try again."
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-purple-700 text-white px-6 py-4 shadow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-bold">
            Dahling&apos;s Salon &amp; Spa
          </h1>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loading}
            className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg disabled:opacity-60"
          >
            {loading ? "Logging out..." : "Logout"}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-3xl font-bold text-purple-800 mb-3">
          User Dashboard
        </h2>

        <p className="text-gray-600 mb-8">
          Welcome! Explore our services and plan your next visit.
        </p>

        {error && (
          <p
            role="alert"
            className="mb-6 bg-red-50 text-red-700 p-4 rounded-xl"
          >
            {error}
          </p>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          {[
            ["/services", "View Services", "Browse our salon treatments."],
            ["/book", "Book an Appointment", "Choose an available schedule."],
            ["/contact", "Contact Us", "Get in touch with the salon."],
          ].map(([to, title, description]) => (
            <Link
              key={to}
              to={to}
              className="bg-white p-6 rounded-2xl shadow hover:shadow-lg"
            >
              <h3 className="text-xl font-bold text-purple-700 mb-2">
                {title}
              </h3>

              <p className="text-gray-600">{description}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}

export default UserDashboard
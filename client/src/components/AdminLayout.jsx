import { useEffect, useState } from "react"
import { NavLink, useLocation, useNavigate } from "react-router-dom"

const configuredApi = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "")
const API_URL = configuredApi.endsWith("/api") ? configuredApi : `${configuredApi}/api`

const menuGroups = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", path: "/admin" }],
  },
  {
    title: "Operations",
    items: [
      { label: "Appointments", path: "/admin/appointments" },
      { label: "Payment review", path: "/admin/payment-review" },
      { label: "Payment settings", path: "/admin/payment-settings" },
      { label: "Staff", path: "/admin/staff" },
      { label: "Services", path: "/admin/services" },
      { label: "Emergency", path: "/admin/emergency" },
    ],
  },
  {
    title: "Sales & Inventory",
    items: [
      { label: "Transactions", path: "/admin/transactions" },
      { label: "Inventory", path: "/admin/inventory" },
    ],
  },
  {
    title: "Reports & Insights",
    items: [
      { label: "Reports", path: "/admin/reports" },
      { label: "GAD", path: "/admin/gad" },
      { label: "Recommendations", path: "/admin/recommendations" },
    ],
  },
]

function AdminLayout({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState("")
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    setIsOpen(false)
  }, [location.pathname])

  function finishLogout() {
    try {
      localStorage.removeItem("user")
      localStorage.setItem("stylesync-logout-event", String(Date.now()))
    } catch {
      // Login navigation does not depend on browser storage.
    }
    window.dispatchEvent(new Event("auth-expired"))
    navigate("/login", {
      replace: true,
      state: { message: "You have been logged out." },
    })
  }

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError("")

    try {
      const sessionResponse = await fetch(`${API_URL}/auth/session`, {
        credentials: "include",
        cache: "no-store",
      })
      if (sessionResponse.status === 401) {
        finishLogout()
        return
      }

      const session = await sessionResponse.json().catch(() => null)
      if (!sessionResponse.ok || !session?.csrfToken) {
        throw new Error("Unable to verify your session. Please try again.")
      }

      const logoutResponse = await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "X-CSRF-Token": session.csrfToken },
      })
      if (!logoutResponse.ok && logoutResponse.status !== 401) {
        throw new Error("Logout could not be completed. Please try again.")
      }
      finishLogout()
    } catch (error) {
      setLogoutError(error instanceof TypeError
        ? "Cannot connect to the server. Please try logging out again."
        : error.message)
    } finally {
      setLoggingOut(false)
    }
  }

  function linkClasses({ isActive }) {
    return [
      "block rounded-xl px-4 py-2.5 text-sm font-medium",
      "transition-colors focus-visible:outline-2",
      "focus-visible:outline-offset-2 focus-visible:outline-white",
      isActive
        ? "bg-white text-purple-800 shadow-sm"
        : "text-purple-100 hover:bg-purple-800 hover:text-white",
    ].join(" ")
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-4 bg-purple-700 px-4 py-4 text-white shadow lg:hidden">
        <span className="font-bold">Dahling&apos;s Salon & Spa</span>
        <button
          type="button"
          onClick={() => setIsOpen((previous) => !previous)}
          aria-expanded={isOpen}
          aria-controls="admin-sidebar"
          className="rounded-lg border border-purple-400 px-3 py-2 text-sm font-semibold"
        >
          {isOpen ? "Close menu" : "Menu"}
        </button>
      </header>

      <aside
        id="admin-sidebar"
        className={[
          isOpen ? "flex" : "hidden",
          "w-full flex-col bg-purple-700 text-white",
          "lg:fixed lg:inset-y-0 lg:left-0 lg:z-40",
          "lg:flex lg:w-64 lg:overflow-y-auto",
        ].join(" ")}
      >
        <div className="border-b border-purple-500 px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-purple-200">StyleSync</p>
          <h1 className="mt-2 text-xl font-bold leading-tight">Dahling&apos;s<br />Salon & Spa</h1>
          <p className="mt-2 text-sm text-purple-200">Administration</p>
        </div>

        <nav aria-label="Admin navigation" className="flex-1 space-y-6 px-4 py-6">
          {menuGroups.map((group) => (
            <section key={group.title}>
              <h2 className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-purple-200">{group.title}</h2>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === "/admin"}
                      onClick={() => setIsOpen(false)}
                      className={linkClasses}
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section>
            <h2 className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-purple-200">Account</h2>
            <ul className="space-y-1">
              <li>
                <NavLink to="/admin/accounts" onClick={() => setIsOpen(false)} className={linkClasses}>
                  Accounts
                </NavLink>
              </li>
              <li>
                <NavLink to="/admin/my-account" onClick={() => setIsOpen(false)} className={linkClasses}>
                  My Account
                </NavLink>
              </li>
            </ul>
          </section>
        </nav>

        <div className="border-t border-purple-500 p-4">
          {logoutError && <p role="alert" className="mb-3 rounded-xl bg-white p-3 text-sm text-red-700">{logoutError}</p>}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full rounded-xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:cursor-wait disabled:opacity-60"
          >
            {loggingOut ? "Logging out…" : "Logout"}
          </button>
        </div>
      </aside>

      <div className="min-w-0 lg:ml-64">
        <main className="min-w-0 overflow-x-auto p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}

export default AdminLayout

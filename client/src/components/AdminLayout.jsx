import { useEffect, useRef, useState } from "react"
import {
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom"

import salonLogo from "../assets/dahling-logo.jpg"

const configuredApi = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/+$/, "")

const API_URL = configuredApi.endsWith("/api")
  ? configuredApi
  : `${configuredApi}/api`

const iconPaths = {
  dashboard: [
    "M3 3h7v7H3z",
    "M14 3h7v7h-7z",
    "M3 14h7v7H3z",
    "M14 14h7v7h-7z",
  ],
  calendar: [
    "M8 2v4M16 2v4",
    "M3 10h18",
    "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    "m8 15 2 2 5-5",
  ],
  payment: [
    "M5 3h14v18l-3-2-4 2-4-2-3 2Z",
    "M8 7h8M8 11h5",
    "m9 15 2 2 4-4",
  ],
  staff: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    "M22 21v-2a4 4 0 0 0-3-3.87",
    "M16 3.13a4 4 0 0 1 0 7.75",
  ],
  services: [
    "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "m8.5 8 12 13",
    "m8.5 16 12-13",
  ],
  emergency: [
    "m13 2-9 12h7l-1 8 10-12h-7z",
  ],
  transactions: [
    "M3 5h18v14H3z",
    "M3 9h18M7 15h4",
  ],
  inventory: [
    "m12 3 9 5-9 5-9-5z",
    "M3 8v10l9 5 9-5V8",
    "M12 13v10M7.5 5.5l9 5",
  ],
  reports: [
    "M4 3v18h17",
    "M8 17v-4M13 17V9M18 17V5",
  ],
  gad: [
    "M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M5 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    "M19 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    "M8 21v-6a4 4 0 0 1 8 0v6",
    "M2 21v-6a3 3 0 0 1 3-3M22 21v-6a3 3 0 0 0-3-3",
  ],
  recommendations: [
    "M9 18h6M10 22h4",
    "M8 14a7 7 0 1 1 8 0c-1 .8-1 2-1 2H9s0-1.2-1-2Z",
  ],
  account: [
    "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    "M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2",
  ],
  settings: [
    "M4 7h16M4 17h16",
    "M8 4v6M16 14v6",
  ],
  logout: [
    "M9 21H4V3h5",
    "M9 12h12",
    "m17 8 4 4-4 4",
  ],
  menu: ["M4 6h16M4 12h16M4 18h16"],
  close: ["m6 6 12 12M6 18 18 6"],
  chevron: ["m6 9 6 6 6-6"],
}

function Icon({ name, className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-5 w-5 shrink-0 ${className}`}
    >
      {(iconPaths[name] || iconPaths.dashboard).map(
        (path, index) => <path key={index} d={path} />
      )}
    </svg>
  )
}

const menuGroups = [
  {
    title: "Overview",
    items: [
      {
        label: "Dashboard",
        path: "/admin",
        icon: "dashboard",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        label: "Appointments",
        path: "/admin/appointments",
        icon: "calendar",
      },
      {
        label: "Payment review",
        path: "/admin/payment-review",
        icon: "payment",
      },
      {
        label: "Staff",
        path: "/admin/staff",
        icon: "staff",
      },
      {
        label: "Services",
        path: "/admin/services",
        icon: "services",
      },
      {
        label: "Emergency",
        path: "/admin/emergency",
        icon: "emergency",
      },
    ],
  },
  {
    title: "Sales & Inventory",
    items: [
      {
        label: "Transactions",
        path: "/admin/transactions",
        icon: "transactions",
      },
      {
        label: "Inventory",
        path: "/admin/inventory",
        icon: "inventory",
      },
    ],
  },
  {
    title: "Reports & Insights",
    items: [
      {
        label: "Reports",
        path: "/admin/reports",
        icon: "reports",
      },
      {
        label: "GAD",
        path: "/admin/gad",
        icon: "gad",
      },
      {
        label: "Recommendations",
        path: "/admin/recommendations",
        icon: "recommendations",
      },
    ],
  },
]

function readCachedUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null")
  } catch {
    return null
  }
}

function AdminLayout({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [user, setUser] = useState(readCachedUser)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState("")

  const accountRef = useRef(null)
  const accountButtonRef = useRef(null)
  const mobileButtonRef = useRef(null)
  const logoutLock = useRef(false)

  const navigate = useNavigate()
  const location = useLocation()

  const isOwner =
    String(user?.role || "").toLowerCase() === "owner"

  const displayName = user?.username || user?.name || "My account"

  useEffect(() => {
    setIsOpen(false)
    setAccountOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const controller = new AbortController()

    async function loadUser() {
      try {
        const response = await fetch(`${API_URL}/auth/session`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        })

        if (!response.ok) return

        const data = await response.json()
        const sessionUser = data?.user

        if (sessionUser && !controller.signal.aborted) {
          setUser(sessionUser)
        }
      } catch {
        // ProtectedRoutes handles authentication.
      }
    }

    loadUser()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    function handlePointerDown(event) {
      if (!accountRef.current?.contains(event.target)) {
        setAccountOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key !== "Escape") return

      if (accountOpen) {
        setAccountOpen(false)
        accountButtonRef.current?.focus()
      } else if (isOpen) {
        setIsOpen(false)
        mobileButtonRef.current?.focus()
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [accountOpen, isOpen])

  function finishLogout() {
    try {
      localStorage.removeItem("user")
      localStorage.setItem(
        "stylesync-logout-event",
        String(Date.now())
      )
    } catch {
      // Navigation does not depend on browser storage.
    }

    window.dispatchEvent(new Event("auth-expired"))

    navigate("/login", {
      replace: true,
      state: { message: "You have been logged out." },
    })
  }

  async function handleLogout() {
    if (logoutLock.current) return

    logoutLock.current = true
    setLoggingOut(true)
    setLogoutError("")

    try {
      const sessionResponse = await fetch(
        `${API_URL}/auth/session`,
        {
          credentials: "include",
          cache: "no-store",
        }
      )

      if (sessionResponse.status === 401) {
        finishLogout()
        return
      }

      const session = await sessionResponse
        .json()
        .catch(() => null)

      if (!sessionResponse.ok || !session?.csrfToken) {
        throw new Error(
          "Unable to verify your session. Please try again."
        )
      }

      const logoutResponse = await fetch(
        `${API_URL}/auth/logout`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "X-CSRF-Token": session.csrfToken,
          },
        }
      )

      if (
        !logoutResponse.ok &&
        logoutResponse.status !== 401
      ) {
        throw new Error(
          "Logout could not be completed. Please try again."
        )
      }

      finishLogout()
    } catch (error) {
      setLogoutError(
        error instanceof TypeError
          ? "Cannot connect to the server. Please try logging out again."
          : error.message
      )
    } finally {
      logoutLock.current = false
      setLoggingOut(false)
    }
  }

  function closeNavigation() {
    setIsOpen(false)
    setAccountOpen(false)
  }

  function linkClasses({ isActive }) {
    return [
      "flex items-center gap-3 rounded-xl px-3 py-2.5",
      "text-sm font-medium transition-colors",
      "focus-visible:outline-2 focus-visible:outline-offset-2",
      "focus-visible:outline-white",
      isActive
        ? "bg-white text-purple-800 shadow-sm"
        : "text-purple-100 hover:bg-white/10 hover:text-white",
    ].join(" ")
  }

  return (
    <div className="admin-shell min-h-screen bg-gray-100">
      <a
        href="#admin-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-purple-900"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 flex items-center justify-between gap-4 bg-purple-950 px-4 py-3 text-white lg:hidden print:hidden">
        <NavLink
          to="/admin"
          aria-label="StyleSync dashboard"
          className="flex items-center gap-3"
        >
          <img
            src={salonLogo}
            alt="Dahling's Salon and Spa"
            className="h-11 w-11 rounded-xl bg-white object-contain p-1"
          />
          <span className="text-sm font-semibold">StyleSync</span>
        </NavLink>

        <button
          ref={mobileButtonRef}
          type="button"
          onClick={() => setIsOpen((previous) => !previous)}
          aria-expanded={isOpen}
          aria-controls="admin-sidebar"
          className="flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold"
        >
          <Icon name={isOpen ? "close" : "menu"} />
          {isOpen ? "Close" : "Menu"}
        </button>
      </header>

      <aside
        id="admin-sidebar"
        aria-label="Administration sidebar"
        className={[
          isOpen ? "flex" : "hidden",
          "w-full flex-col bg-gradient-to-b",
          "from-purple-950 via-purple-900 to-purple-800 text-white",
          "lg:fixed lg:inset-y-0 lg:left-0 lg:z-40",
          "lg:flex lg:w-64 print:hidden",
        ].join(" ")}
      >
        <div className="hidden shrink-0 border-b border-white/10 px-5 py-5 lg:block">
          <NavLink
            to="/admin"
            aria-label="StyleSync dashboard"
            className="flex flex-col items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-white"
          >
            <img
              src={salonLogo}
              alt="Dahling's Salon and Spa"
              className="h-24 w-36 rounded-2xl bg-white object-contain p-2"
            />

            <span className="text-center">
              <span className="block text-xs font-semibold uppercase tracking-widest text-purple-100">
                StyleSync
              </span>
              <span className="mt-1 block text-xs text-purple-300">
                Administration
              </span>
            </span>
          </NavLink>
        </div>

        <nav
          aria-label="Admin navigation"
          className="min-h-0 flex-1 space-y-5 px-4 py-5 lg:overflow-y-auto"
        >
          {menuGroups.map((group) => (
            <section key={group.title}>
              <h2 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-purple-300">
                {group.title}
              </h2>

              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === "/admin"}
                      onClick={closeNavigation}
                      className={linkClasses}
                    >
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {isOwner && (
            <section>
              <h2 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-purple-300">
                Administration
              </h2>

              <NavLink
                to="/admin/accounts"
                onClick={closeNavigation}
                className={linkClasses}
              >
                <Icon name="staff" />
                <span>Manage accounts</span>
              </NavLink>
            </section>
          )}
        </nav>

        <div
          ref={accountRef}
          className="relative shrink-0 border-t border-white/10 p-4"
        >
          {accountOpen && (
            <div
              id="admin-account-options"
              className="mb-3 space-y-1 rounded-2xl border border-white/15 bg-purple-950 p-2 shadow-xl lg:absolute lg:bottom-full lg:left-4 lg:right-4"
            >
              <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-purple-300">
                Account & settings
              </p>

              <NavLink
                to="/admin/my-account"
                onClick={closeNavigation}
                className={linkClasses}
              >
                <Icon name="account" />
                <span>My account</span>
              </NavLink>

              <NavLink
                to="/admin/payment-settings"
                onClick={closeNavigation}
                className={linkClasses}
              >
                <Icon name="settings" />
                <span>Payment settings</span>
              </NavLink>

              <div className="my-2 border-t border-white/10" />

              {logoutError && (
                <p
                  role="alert"
                  className="mx-1 mb-2 rounded-xl bg-red-50 p-3 text-xs leading-relaxed text-red-800"
                >
                  {logoutError}
                </p>
              )}

              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-pink-200 transition hover:bg-pink-500/15 focus-visible:outline-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-60"
              >
                <Icon name="logout" />
                {loggingOut ? "Logging out…" : "Log out"}
              </button>
            </div>
          )}

          <button
            ref={accountButtonRef}
            type="button"
            onClick={() => setAccountOpen((previous) => !previous)}
            aria-expanded={accountOpen}
            aria-controls="admin-account-options"
            className="flex w-full items-center gap-3 rounded-2xl bg-white/10 p-3 text-left transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-purple-800">
              <Icon name="settings" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {displayName}
              </span>
              <span className="mt-0.5 block text-xs text-purple-200">
                Account & settings
              </span>
            </span>

            <Icon
              name="chevron"
              className={`transition-transform ${
                accountOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      </aside>

      <div className="min-w-0 lg:ml-64 print:ml-0">
        <main
          id="admin-content"
          tabIndex={-1}
          className="min-w-0 overflow-x-auto p-4 outline-none md:p-6 lg:p-8 print:p-0"
        >
          {children}
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
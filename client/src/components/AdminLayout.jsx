import { useEffect, useRef, useState } from "react"
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom"
import {
    LuLayoutDashboard,
    LuCalendarDays,
    LuReceiptText,
    LuUsers,
    LuScissors,
    LuWifiOff,
    LuCreditCard,
    LuPackage,
    LuChartNoAxesCombined,
    LuHeartHandshake,
    LuLightbulb,
    LuUserRound,
    LuSettings2,
    LuLogOut,
    LuMenu,
    LuChevronRight,
    LuChevronsUpDown,
    LuArrowUpRight,
} from "react-icons/lu"
import Brand from "./Brand"
import { Button } from "./ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "./ui/sheet"
import { API_URL } from "../lib/sessionApi"

const menuGroups = [
    {
        title: "Workspace",
        items: [
            ["Dashboard", "/admin", LuLayoutDashboard],
            ["Appointments", "/admin/appointments", LuCalendarDays],
            ["Payment review", "/admin/payment-review", LuReceiptText],
        ],
    },
    {
        title: "Salon management",
        items: [
            ["Staff", "/admin/staff", LuUsers],
            ["Services", "/admin/services", LuScissors],
            ["Transactions", "/admin/transactions", LuCreditCard],
            ["Inventory", "/admin/inventory", LuPackage],
        ],
    },
    {
        title: "Insights",
        items: [
            ["Reports", "/admin/reports", LuChartNoAxesCombined],
            ["GAD", "/admin/gad", LuHeartHandshake],
            ["Recommendations", "/admin/recommendations", LuLightbulb],
        ],
    },
    { title: "Tools", items: [["Emergency mode", "/admin/emergency", LuWifiOff]] },
]
const allItems = menuGroups.flatMap((group) => group.items)

function Sidebar({ user, onNavigate, handleLogout, loggingOut, logoutError }) {
    const displayName = user?.username || user?.name || "My account"
    return (
        <>
            <div className="admin-brand-block">
                <Link to="/admin" onClick={onNavigate} aria-label="StyleSync dashboard">
                    <Brand />
                </Link>
                <p className="admin-brand-caption">STYLESYNC · TEAM WORKSPACE</p>
            </div>
            <nav
                aria-label="Admin navigation"
                className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-6"
            >
                {menuGroups.map((group) => (
                    <section key={group.title}>
                        <h2 className="admin-group-label">{group.title}</h2>
                        <ul className="space-y-1">
                            {group.items.map(([label, path, Icon]) => (
                                <li key={path}>
                                    <NavLink
                                        to={path}
                                        end={path === "/admin"}
                                        onClick={onNavigate}
                                        className={({ isActive }) =>
                                            `admin-nav-link ${isActive ? "active" : ""}`
                                        }
                                    >
                                        <Icon className="size-[17px] shrink-0" aria-hidden="true" />
                                        <span>{label}</span>
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
                {user?.role === "owner" && (
                    <NavLink
                        to="/admin/accounts"
                        onClick={onNavigate}
                        className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}
                    >
                        <LuUsers className="size-[17px]" />
                        Manage accounts
                    </NavLink>
                )}
            </nav>
            <div className="shrink-0 border-t border-border p-3">
                <details className="group relative">
                    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg bg-muted p-3 [&::-webkit-details-marker]:hidden">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-primary">
                            {displayName.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold">
                                {displayName}
                            </span>
                            <span className="mt-1 block text-[10px] capitalize text-muted-foreground">
                                {user?.role || "Team member"}
                            </span>
                        </span>
                        <LuChevronsUpDown className="size-4 text-muted-foreground" />
                    </summary>
                    <div className="absolute bottom-full left-0 right-0 z-10 mb-2 rounded-xl border border-border bg-white p-2 shadow-lg">
                        <NavLink
                            to="/admin/my-account"
                            onClick={onNavigate}
                            className="admin-nav-link"
                        >
                            <LuUserRound />
                            My account
                        </NavLink>
                        <NavLink
                            to="/admin/payment-settings"
                            onClick={onNavigate}
                            className="admin-nav-link"
                        >
                            <LuSettings2 />
                            Payment settings
                        </NavLink>
                        {logoutError && (
                            <p
                                role="alert"
                                className="rounded-lg bg-red-50 p-3 text-xs text-red-700"
                            >
                                {logoutError}
                            </p>
                        )}
                        <button
                            onClick={handleLogout}
                            disabled={loggingOut}
                            className="admin-nav-link w-full text-left text-red-700"
                        >
                            <LuLogOut />
                            {loggingOut ? "Logging out…" : "Log out"}
                        </button>
                    </div>
                </details>
            </div>
        </>
    )
}

export default function AdminLayout({ children }) {
    const [isOpen, setIsOpen] = useState(false)
    const [user, setUser] = useState(null)
    const [loggingOut, setLoggingOut] = useState(false)
    const [logoutError, setLogoutError] = useState("")
    const logoutLock = useRef(false)
    const navigate = useNavigate()
    const location = useLocation()
    const currentPage =
        allItems.find((item) => item[1] === location.pathname)?.[0] ||
        {
            "/admin/my-account": "My account",
            "/admin/payment-settings": "Payment settings",
            "/admin/accounts": "Manage accounts",
        }[location.pathname] ||
        "Workspace"
    useEffect(() => {
        const controller = new AbortController()
        fetch(`${API_URL}/auth/session`, {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
        })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
                if (!controller.signal.aborted && data?.user) setUser(data.user)
            })
            .catch(() => {
                /* ProtectedRoutes verifies the session. */
            })
        return () => controller.abort()
    }, [])
    function finishLogout() {
        try {
            localStorage.removeItem("user")
            localStorage.setItem("stylesync-logout-event", String(Date.now()))
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
                headers: {
                    "X-CSRF-Token": session.csrfToken,
                },
            })

            if (!logoutResponse.ok && logoutResponse.status !== 401) {
                throw new Error("Logout could not be completed. Please try again.")
            }

            finishLogout()
        } catch (error) {
            setLogoutError(
                error instanceof TypeError
                    ? "Cannot connect to the server. Please try logging out again."
                    : error.message,
            )
        } finally {
            logoutLock.current = false
            setLoggingOut(false)
        }
    }

    const sidebarProps = {
        user,
        handleLogout,
        loggingOut,
        logoutError,
        onNavigate: () => setIsOpen(false),
    }
    return (
        <div className="admin-shell min-h-screen">
            <a href="#admin-content" className="skip-link">
                Skip to content
            </a>
            <aside
                aria-label="Administration sidebar"
                className="admin-sidebar fixed inset-y-0 left-0 z-40 hidden w-60 flex-col lg:flex print:hidden"
            >
                <Sidebar {...sidebarProps} />
            </aside>
            <div className="min-w-0 lg:ml-60 print:ml-0">
                <header className="admin-topbar print:hidden">
                    <div className="flex items-center gap-3">
                        <Sheet open={isOpen} onOpenChange={setIsOpen}>
                            <SheetTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="size-9 lg:hidden"
                                    aria-label="Open admin navigation"
                                >
                                    <LuMenu />
                                </Button>
                            </SheetTrigger>
                            <SheetContent className="p-0 pt-10">
                                <SheetTitle className="sr-only">
                                    Team workspace navigation
                                </SheetTitle>
                                <SheetDescription className="sr-only">
                                    Navigate salon management and your account.
                                </SheetDescription>
                                <Sidebar {...sidebarProps} />
                            </SheetContent>
                        </Sheet>
                        <p className="admin-breadcrumb">
                            <span>Workspace</span>
                            <LuChevronRight className="size-3" />
                            <strong>{currentPage}</strong>
                        </p>
                    </div>
                    <div className="flex items-center gap-6">
                        <span className="admin-topbar-date">
                            {new Date().toLocaleDateString("en-PH", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                timeZone: "Asia/Manila",
                            })}
                        </span>
                        <Link to="/" className="text-link">
                            View website <LuArrowUpRight />
                        </Link>
                    </div>
                </header>
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

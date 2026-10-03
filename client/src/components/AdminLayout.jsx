import {
    useEffect,
    useRef,
    useState,
} from "react"

import {
    Link,
    NavLink,
    useLocation,
    useNavigate,
} from "react-router-dom"

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
    LuBell,
} from "react-icons/lu"

import Brand from "./Brand"

import {
    Button,
} from "./ui/button"

import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
    SheetTrigger,
} from "./ui/sheet"

import {
    API_URL,
} from "../lib/sessionApi"

const menuGroups = [
    {
        title: "Workspace",

        items: [
            [
                "Dashboard",
                "/admin",
                LuLayoutDashboard,
            ],

            [
                "Appointments",
                "/admin/appointments",
                LuCalendarDays,
            ],

            [
                "Payment review",
                "/admin/payment-review",
                LuReceiptText,
            ],
        ],
    },

    {
        title: "Salon management",

        items: [
            [
                "Staff",
                "/admin/staff",
                LuUsers,
            ],

            [
                "Services",
                "/admin/services",
                LuScissors,
            ],

            [
                "Transactions",
                "/admin/transactions",
                LuCreditCard,
            ],

            [
                "Inventory",
                "/admin/inventory",
                LuPackage,
            ],
        ],
    },

    {
        title: "Insights",

        items: [
            [
                "Reports",
                "/admin/reports",
                LuChartNoAxesCombined,
            ],

            [
                "GAD",
                "/admin/gad",
                LuHeartHandshake,
            ],

            [
                "Recommendations",
                "/admin/recommendations",
                LuLightbulb,
            ],
        ],
    },

    {
        title: "Tools",

        items: [
            [
                "Emergency mode",
                "/admin/emergency",
                LuWifiOff,
            ],
        ],
    },
]

const allItems =
    menuGroups.flatMap(
        (group) =>
            group.items,
    )

/*
 * Staff can still VIEW Inventory.
 * Add/edit/delete permissions remain
 * enforced separately.
 */
const staffPaths =
    new Set([
        "/admin/appointments",
        "/admin/payment-review",
        "/admin/services",
        "/admin/transactions",
        "/admin/inventory",
        "/admin/emergency",
    ])

function notificationLabel(
    count,
) {
    if (count > 99) {
        return "99+"
    }

    return String(count)
}

function NotificationBadge({
    count,
    label,
}) {
    if (!count) {
        return null
    }

    return (
        <span
            className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
            aria-label={`${count} ${label}`}
        >
            {notificationLabel(
                count,
            )}
        </span>
    )
}

function Sidebar({
    user,

    appointmentCount,

    paymentReviewCount,

    onNavigate,

    handleLogout,

    loggingOut,

    logoutError,
}) {
    const displayName =
        user?.username ||
        user?.name ||
        "My account"

    const homePath =
        user?.role === "user"
            ? "/admin/appointments"
            : "/admin"

    const visibleMenuGroups =
        user
            ? menuGroups
                  .map(
                      (
                          group,
                      ) => ({
                          ...group,

                          items:
                              user.role ===
                              "user"
                                  ? group.items.filter(
                                        (
                                            [
                                                ,
                                                path,
                                            ],
                                        ) =>
                                            staffPaths.has(
                                                path,
                                            ),
                                    )
                                  : group.items,
                      }),
                  )
                  .filter(
                      (
                          group,
                      ) =>
                          group
                              .items
                              .length >
                          0,
                  )
            : []

    return (
        <>
            <div className="admin-brand-block">
                <Link
                    to={
                        homePath
                    }
                    onClick={
                        onNavigate
                    }
                    aria-label="StyleSync workspace"
                >
                    <Brand />
                </Link>

                <p className="admin-brand-caption">
                    STYLESYNC · TEAM
                    WORKSPACE
                </p>
            </div>

            <nav
                aria-label="Admin navigation"
                className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-6"
            >
                {visibleMenuGroups.map(
                    (
                        group,
                    ) => (
                        <section
                            key={
                                group.title
                            }
                        >
                            <h2 className="admin-group-label">
                                {
                                    group.title
                                }
                            </h2>

                            <ul className="space-y-1">
                                {group.items.map(
                                    (
                                        [
                                            label,
                                            path,
                                            Icon,
                                        ],
                                    ) => {
                                        const appointmentBadge =
                                            path ===
                                            "/admin/appointments"
                                                ? appointmentCount
                                                : 0

                                        const paymentBadge =
                                            path ===
                                            "/admin/payment-review"
                                                ? paymentReviewCount
                                                : 0

                                        return (
                                            <li
                                                key={
                                                    path
                                                }
                                            >
                                                <NavLink
                                                    to={
                                                        path
                                                    }
                                                    end={
                                                        path ===
                                                        "/admin"
                                                    }
                                                    onClick={
                                                        onNavigate
                                                    }
                                                    className={({
                                                        isActive,
                                                    }) =>
                                                        `admin-nav-link ${
                                                            isActive
                                                                ? "active"
                                                                : ""
                                                        }`
                                                    }
                                                >
                                                    <Icon
                                                        className="size-[17px] shrink-0"
                                                        aria-hidden="true"
                                                    />

                                                    <span className="min-w-0 flex-1">
                                                        {
                                                            label
                                                        }
                                                    </span>

                                                    <NotificationBadge
                                                        count={
                                                            appointmentBadge
                                                        }
                                                        label="pending appointment requests"
                                                    />

                                                    <NotificationBadge
                                                        count={
                                                            paymentBadge
                                                        }
                                                        label="payments awaiting verification"
                                                    />
                                                </NavLink>
                                            </li>
                                        )
                                    },
                                )}
                            </ul>
                        </section>
                    ),
                )}

                {user?.role ===
                    "owner" && (
                    <NavLink
                        to="/admin/accounts"
                        onClick={
                            onNavigate
                        }
                        className={({
                            isActive,
                        }) =>
                            `admin-nav-link ${
                                isActive
                                    ? "active"
                                    : ""
                            }`
                        }
                    >
                        <LuUsers className="size-[17px]" />

                        Manage
                        accounts
                    </NavLink>
                )}
            </nav>

            <div className="shrink-0 border-t border-border p-3">
                <details className="group relative">
                    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg bg-muted p-3 [&::-webkit-details-marker]:hidden">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-primary">
                            {displayName
                                .slice(
                                    0,
                                    1,
                                )
                                .toUpperCase()}
                        </span>

                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold">
                                {
                                    displayName
                                }
                            </span>

                            <span className="mt-1 block text-[10px] capitalize text-muted-foreground">
                                {user?.role ||
                                    "Team member"}
                            </span>
                        </span>

                        <LuChevronsUpDown className="size-4 text-muted-foreground" />
                    </summary>

                    <div className="absolute bottom-full left-0 right-0 z-10 mb-2 rounded-xl border border-border bg-white p-2 shadow-lg">
                        <NavLink
                            to="/admin/my-account"
                            onClick={
                                onNavigate
                            }
                            className="admin-nav-link"
                        >
                            <LuUserRound />

                            My account
                        </NavLink>

                        {user?.role ===
                            "owner" && (
                            <NavLink
                                to="/admin/payment-settings"
                                onClick={
                                    onNavigate
                                }
                                className="admin-nav-link"
                            >
                                <LuSettings2 />

                                Payment
                                settings
                            </NavLink>
                        )}

                        {logoutError && (
                            <p
                                role="alert"
                                className="rounded-lg bg-red-50 p-3 text-xs text-red-700"
                            >
                                {
                                    logoutError
                                }
                            </p>
                        )}

                        <button
                            type="button"
                            onClick={
                                handleLogout
                            }
                            disabled={
                                loggingOut
                            }
                            className="admin-nav-link w-full text-left text-red-700"
                        >
                            <LuLogOut />

                            {loggingOut
                                ? "Logging out…"
                                : "Log out"}
                        </button>
                    </div>
                </details>
            </div>
        </>
    )
}

export default function AdminLayout({
    children,
}) {
    const [
        isOpen,
        setIsOpen,
    ] = useState(false)

    const [
        user,
        setUser,
    ] = useState(null)

    /*
     * Appointment badge:
     * only appointments that have
     * completed payment verification
     * and are waiting for approval.
     */
    const [
        appointmentCount,
        setAppointmentCount,
    ] = useState(0)

    /*
     * Payment review badge:
     * deposits submitted by customers
     * that still need verification.
     */
    const [
        paymentReviewCount,
        setPaymentReviewCount,
    ] = useState(0)

    const [
        loggingOut,
        setLoggingOut,
    ] = useState(false)

    const [
        logoutError,
        setLogoutError,
    ] = useState("")

    const logoutLock =
        useRef(false)

    const navigate =
        useNavigate()

    const location =
        useLocation()

    const currentPage =
        allItems.find(
            (
                item,
            ) =>
                item[1] ===
                location.pathname,
        )?.[0] ||
        {
            "/admin/my-account":
                "My account",

            "/admin/payment-settings":
                "Payment settings",

            "/admin/accounts":
                "Manage accounts",
        }[
            location
                .pathname
        ] ||
        "Workspace"

    /*
     * Load current authenticated
     * user.
     */
    useEffect(() => {
        const controller =
            new AbortController()

        fetch(
            `${API_URL}/auth/session`,
            {
                credentials:
                    "include",

                cache:
                    "no-store",

                signal:
                    controller.signal,
            },
        )
            .then(
                (
                    response,
                ) =>
                    response.ok
                        ? response.json()
                        : null,
            )
            .then(
                (
                    data,
                ) => {
                    if (
                        !controller
                            .signal
                            .aborted &&
                        data?.user
                    ) {
                        setUser(
                            data.user,
                        )
                    }
                },
            )
            .catch(
                () => {
                    /*
                     * ProtectedRoutes
                     * already verifies
                     * the session.
                     */
                },
            )

        return () =>
            controller.abort()
    }, [])

    /*
     * Refresh both notification
     * counters.
     *
     * Appointments:
     * status === Pending
     *
     * Payment review:
     * payment_status ===
     * Awaiting Verification
     */
    useEffect(() => {
        if (!user) {
            return
        }

        let active = true

        let running = false

        let controller =
            new AbortController()

        async function refreshNotifications() {
            if (
                running ||
                !active
            ) {
                return
            }

            running = true

            /*
             * Each refresh gets a
             * fresh controller.
             */
            if (
                controller
                    .signal
                    .aborted
            ) {
                controller =
                    new AbortController()
            }

            try {
                const [
                    appointmentsResponse,

                    paymentsResponse,
                ] =
                    await Promise.all(
                        [
                            fetch(
                                `${API_URL}/appointments`,
                                {
                                    credentials:
                                        "include",

                                    cache:
                                        "no-store",

                                    signal:
                                        controller.signal,
                                },
                            ),

                            fetch(
                                `${API_URL}/booking-payments/review`,
                                {
                                    credentials:
                                        "include",

                                    cache:
                                        "no-store",

                                    signal:
                                        controller.signal,
                                },
                            ),
                        ],
                    )

                if (
                    appointmentsResponse.ok
                ) {
                    const appointments =
                        await appointmentsResponse
                            .json()
                            .catch(
                                () =>
                                    null,
                            )

                    if (
                        active &&
                        Array.isArray(
                            appointments,
                        )
                    ) {
                        const pendingAppointments =
                            appointments.filter(
                                (
                                    appointment,
                                ) =>
                                    appointment.status ===
                                    "Pending",
                            )
                                .length

                        setAppointmentCount(
                            pendingAppointments,
                        )
                    }
                }

                if (
                    paymentsResponse.ok
                ) {
                    const payments =
                        await paymentsResponse
                            .json()
                            .catch(
                                () =>
                                    null,
                            )

                    if (
                        active &&
                        Array.isArray(
                            payments,
                        )
                    ) {
                        const awaitingVerification =
                            payments.filter(
                                (
                                    payment,
                                ) =>
                                    payment.payment_status ===
                                    "Awaiting Verification",
                            )
                                .length

                        setPaymentReviewCount(
                            awaitingVerification,
                        )
                    }
                }
            } catch (
                error
            ) {
                if (
                    error?.name !==
                    "AbortError"
                ) {
                    /*
                     * Notification
                     * polling must
                     * never interrupt
                     * the workspace.
                     */
                }
            } finally {
                running = false
            }
        }

        refreshNotifications()

        const timer =
            window.setInterval(
                refreshNotifications,
                15000,
            )

        function handleFocus() {
            refreshNotifications()
        }

        window.addEventListener(
            "focus",
            handleFocus,
        )

        return () => {
            active = false

            controller.abort()

            window.clearInterval(
                timer,
            )

            window.removeEventListener(
                "focus",
                handleFocus,
            )
        }
    }, [user])

    /*
     * Refresh shortly after route
     * navigation.
     *
     * Useful after:
     * - verifying payment
     * - approving appointment
     * - rejecting payment
     * - declining appointment
     */
    useEffect(() => {
        if (!user) {
            return
        }

        const controller =
            new AbortController()

        const timer =
            window.setTimeout(
                async () => {
                    try {
                        const [
                            appointmentsResponse,

                            paymentsResponse,
                        ] =
                            await Promise.all(
                                [
                                    fetch(
                                        `${API_URL}/appointments`,
                                        {
                                            credentials:
                                                "include",

                                            cache:
                                                "no-store",

                                            signal:
                                                controller.signal,
                                        },
                                    ),

                                    fetch(
                                        `${API_URL}/booking-payments/review`,
                                        {
                                            credentials:
                                                "include",

                                            cache:
                                                "no-store",

                                            signal:
                                                controller.signal,
                                        },
                                    ),
                                ],
                            )

                        if (
                            appointmentsResponse.ok
                        ) {
                            const appointments =
                                await appointmentsResponse
                                    .json()
                                    .catch(
                                        () =>
                                            null,
                                    )

                            if (
                                Array.isArray(
                                    appointments,
                                )
                            ) {
                                setAppointmentCount(
                                    appointments.filter(
                                        (
                                            appointment,
                                        ) =>
                                            appointment.status ===
                                            "Pending",
                                    )
                                        .length,
                                )
                            }
                        }

                        if (
                            paymentsResponse.ok
                        ) {
                            const payments =
                                await paymentsResponse
                                    .json()
                                    .catch(
                                        () =>
                                            null,
                                    )

                            if (
                                Array.isArray(
                                    payments,
                                )
                            ) {
                                setPaymentReviewCount(
                                    payments.filter(
                                        (
                                            payment,
                                        ) =>
                                            payment.payment_status ===
                                            "Awaiting Verification",
                                    )
                                        .length,
                                )
                            }
                        }
                    } catch (
                        error
                    ) {
                        if (
                            error?.name !==
                            "AbortError"
                        ) {
                            // Silent refresh.
                        }
                    }
                },
                400,
            )

        return () => {
            controller.abort()

            window.clearTimeout(
                timer,
            )
        }
    }, [
        location.pathname,
        user,
    ])

    function finishLogout() {
        try {
            localStorage.removeItem(
                "user",
            )

            localStorage.setItem(
                "stylesync-logout-event",
                String(
                    Date.now(),
                ),
            )
        } catch {
            /*
             * Navigation does not
             * depend on browser
             * storage.
             */
        }

        window.dispatchEvent(
            new Event(
                "auth-expired",
            ),
        )

        navigate(
            "/login",
            {
                replace:
                    true,

                state: {
                    message:
                        "You have been logged out.",
                },
            },
        )
    }

    async function handleLogout() {
        if (
            logoutLock
                .current
        ) {
            return
        }

        logoutLock.current =
            true

        setLoggingOut(
            true,
        )

        setLogoutError(
            "",
        )

        try {
            const sessionResponse =
                await fetch(
                    `${API_URL}/auth/session`,
                    {
                        credentials:
                            "include",

                        cache:
                            "no-store",
                    },
                )

            if (
                sessionResponse.status ===
                401
            ) {
                finishLogout()

                return
            }

            const session =
                await sessionResponse
                    .json()
                    .catch(
                        () =>
                            null,
                    )

            if (
                !sessionResponse.ok ||
                !session?.csrfToken
            ) {
                throw new Error(
                    "Unable to verify your session. Please try again.",
                )
            }

            const logoutResponse =
                await fetch(
                    `${API_URL}/auth/logout`,
                    {
                        method:
                            "POST",

                        credentials:
                            "include",

                        cache:
                            "no-store",

                        headers: {
                            "X-CSRF-Token":
                                session.csrfToken,
                        },
                    },
                )

            if (
                !logoutResponse.ok &&
                logoutResponse.status !==
                    401
            ) {
                throw new Error(
                    "Logout could not be completed. Please try again.",
                )
            }

            finishLogout()
        } catch (
            error
        ) {
            setLogoutError(
                error instanceof
                    TypeError
                    ? "Cannot connect to the server. Please try logging out again."
                    : error.message,
            )
        } finally {
            logoutLock.current =
                false

            setLoggingOut(
                false,
            )
        }
    }

    const totalNotifications =
        appointmentCount +
        paymentReviewCount

    /*
     * Payments come first in the
     * workflow, so the bell opens
     * Payment Review when there are
     * unverified deposits.
     */
    const notificationPath =
        paymentReviewCount > 0
            ? "/admin/payment-review"
            : "/admin/appointments"

    const notificationText = [
        paymentReviewCount >
        0
            ? `${paymentReviewCount} payment${
                  paymentReviewCount ===
                  1
                      ? ""
                      : "s"
              } awaiting verification`
            : "",

        appointmentCount >
        0
            ? `${appointmentCount} appointment${
                  appointmentCount ===
                  1
                      ? ""
                      : "s"
              } awaiting approval`
            : "",
    ]
        .filter(
            Boolean,
        )
        .join(", ")

    const sidebarProps = {
        user,

        appointmentCount,

        paymentReviewCount,

        handleLogout,

        loggingOut,

        logoutError,

        onNavigate: () =>
            setIsOpen(
                false,
            ),
    }

    return (
        <div className="admin-shell min-h-screen">
            <a
                href="#admin-content"
                className="skip-link"
            >
                Skip to
                content
            </a>

            <aside
                aria-label="Administration sidebar"
                className="admin-sidebar fixed inset-y-0 left-0 z-40 hidden w-60 flex-col lg:flex print:hidden"
            >
                <Sidebar
                    {...sidebarProps}
                />
            </aside>

            <div className="min-w-0 lg:ml-60 print:ml-0">
                <header className="admin-topbar print:hidden">
                    <div className="flex items-center gap-3">
                        <Sheet
                            open={
                                isOpen
                            }
                            onOpenChange={
                                setIsOpen
                            }
                        >
                            <SheetTrigger
                                asChild
                            >
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
                                    Team
                                    workspace
                                    navigation
                                </SheetTitle>

                                <SheetDescription className="sr-only">
                                    Navigate
                                    salon
                                    management
                                    and your
                                    account.
                                </SheetDescription>

                                <Sidebar
                                    {...sidebarProps}
                                />
                            </SheetContent>
                        </Sheet>

                        <p className="admin-breadcrumb">
                            <span>
                                Workspace
                            </span>

                            <LuChevronRight className="size-3" />

                            <strong>
                                {
                                    currentPage
                                }
                            </strong>
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <Link
                            to={
                                notificationPath
                            }
                            className="relative inline-flex size-9 items-center justify-center rounded-lg border border-border bg-white text-gray-600 transition hover:bg-purple-50 hover:text-purple-800"
                            aria-label={
                                totalNotifications >
                                0
                                    ? notificationText
                                    : "No pending payment reviews or appointment requests"
                            }
                            title={
                                totalNotifications >
                                0
                                    ? notificationText
                                    : "No pending payment reviews or appointment requests"
                            }
                        >
                            <LuBell className="size-4" />

                            {totalNotifications >
                                0 && (
                                <span className="absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-1 text-[9px] font-bold leading-none text-white">
                                    {notificationLabel(
                                        totalNotifications,
                                    )}
                                </span>
                            )}
                        </Link>

                        <span className="admin-topbar-date">
                            {new Date().toLocaleDateString(
                                "en-PH",
                                {
                                    month:
                                        "short",

                                    day:
                                        "numeric",

                                    year:
                                        "numeric",

                                    timeZone:
                                        "Asia/Manila",
                                },
                            )}
                        </span>

                        <Link
                            to="/"
                            className="text-link"
                        >
                            View website{" "}

                            <LuArrowUpRight />
                        </Link>
                    </div>
                </header>

                <main
                    id="admin-content"
                    tabIndex={
                        -1
                    }
                    className="min-w-0 overflow-x-auto p-4 outline-none md:p-6 lg:p-8 print:p-0"
                >
                    {
                        children
                    }
                </main>
            </div>
        </div>
    )
}

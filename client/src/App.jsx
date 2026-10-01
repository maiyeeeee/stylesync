import { lazy, Suspense, useEffect } from "react"
import {
    BrowserRouter,
    useLocation,
    Routes,
    Route,
    Navigate,
} from "react-router-dom"

import Home from "./pages/Home"
import Services from "./pages/Services"
import Book from "./pages/Book"
import Contact from "./pages/Contact"

const AdminPaymentSettings = lazy(() =>
    import("./pages/AdminPaymentSettings"),
)
const AdminPaymentReview = lazy(() =>
    import("./pages/AdminPaymentReview"),
)
const AdminDashboard = lazy(() =>
    import("./pages/AdminDashboard"),
)
const AdminRegister = lazy(() =>
    import("./pages/AdminRegister"),
)
const AdminAppointments = lazy(() =>
    import("./pages/AdminAppointments"),
)
const AdminStaff = lazy(() =>
    import("./pages/AdminStaff"),
)
const EmergencyMode = lazy(() =>
    import("./pages/EmergencyMode"),
)
const AdminInventory = lazy(() =>
    import("./pages/AdminInventory"),
)
const AdminServices = lazy(() =>
    import("./pages/AdminServices"),
)
const AdminTransactions = lazy(() =>
    import("./pages/AdminTransactions"),
)
const AdminReports = lazy(() =>
    import("./pages/AdminReports"),
)
const AdminRecommendations = lazy(() =>
    import("./pages/AdminRecommendations"),
)
const AdminGAD = lazy(() =>
    import("./pages/AdminGAD"),
)
const AdminAccounts = lazy(() =>
    import("./pages/AdminAccounts"),
)
const AdminLogin = lazy(() =>
    import("./pages/AdminLogin"),
)
const MyAccount = lazy(() =>
    import("./pages/MyAccount"),
)

import ForgotPassword from "./pages/ForgotPassword"
import ProtectedRoutes from "./components/ProtectedRoutes"
import AdminLayout from "./components/AdminLayout"

const adminPages = [
    {
        path: "/admin/payment-settings",
        Page: AdminPaymentSettings,
        roles: ["owner"],
    },
    {
        path: "/admin/payment-review",
        Page: AdminPaymentReview,
        roles: ["owner", "admin", "user"],
    },
    {
        path: "/admin",
        Page: AdminDashboard,
        roles: ["owner", "admin"],
    },
    {
        path: "/admin/appointments",
        Page: AdminAppointments,
        roles: ["owner", "admin", "user"],
    },
    {
        path: "/admin/staff",
        Page: AdminStaff,
        roles: ["owner", "admin"],
    },
    {
        path: "/admin/emergency",
        Page: EmergencyMode,
        roles: ["owner", "admin", "user"],
    },
    {
        path: "/admin/inventory",
        Page: AdminInventory,
        roles: ["owner", "admin", "user"],
    },
    {
        path: "/admin/services",
        Page: AdminServices,
        roles: ["owner", "admin", "user"],
    },
    {
        path: "/admin/transactions",
        Page: AdminTransactions,
        roles: ["owner", "admin", "user"],
    },
    {
        path: "/admin/reports",
        Page: AdminReports,
        roles: ["owner", "admin"],
    },
    {
        path: "/admin/recommendations",
        Page: AdminRecommendations,
        roles: ["owner", "admin"],
    },
    {
        path: "/admin/gad",
        Page: AdminGAD,
        roles: ["owner", "admin"],
    },
    {
        path: "/admin/accounts",
        Page: AdminAccounts,
        roles: ["owner"],
    },
    {
        path: "/admin/my-account",
        Page: MyAccount,
        roles: ["owner", "admin", "user"],
    },
]

function RouteScroll() {
    const { pathname } = useLocation()

    useEffect(() => {
        window.scrollTo({
            top: 0,
            behavior: "instant",
        })
    }, [pathname])

    return null
}

function App() {
    return (
        <BrowserRouter>
            <RouteScroll />

            <Suspense
                fallback={
                    <div
                        role="status"
                        className="grid min-h-screen place-items-center text-sm text-muted-foreground"
                    >
                        Preparing your space…
                    </div>
                }
            >
                <Routes>
                    <Route
                        path="/"
                        element={<Home />}
                    />

                    <Route
                        path="/login"
                        element={<AdminLogin />}
                    />

                    <Route
                        path="/register"
                        element={
                            <Navigate
                                to="/admin-login"
                                replace
                            />
                        }
                    />

                    <Route
                        path="/admin-login"
                        element={<AdminLogin />}
                    />

                    <Route
                        path="/forgot-password"
                        element={<ForgotPassword />}
                    />

                    <Route
                        path="/admin-register"
                        element={<AdminRegister />}
                    />

                    <Route
                        path="/home"
                        element={
                            <Navigate
                                to="/"
                                replace
                            />
                        }
                    />

                    <Route
                        path="/services"
                        element={<Services />}
                    />

                    <Route
                        path="/book"
                        element={<Book />}
                    />

                    <Route
                        path="/contact"
                        element={<Contact />}
                    />

                    <Route
                        path="/dashboard"
                        element={
                            <Navigate
                                to="/"
                                replace
                            />
                        }
                    />

                    {adminPages.map(
                        ({
                            path,
                            Page,
                            roles,
                        }) => (
                            <Route
                                key={path}
                                path={path}
                                element={
                                    <ProtectedRoutes
                                        allowedRoles={
                                            roles
                                        }
                                    >
                                        <AdminLayout>
                                            <Page />
                                        </AdminLayout>
                                    </ProtectedRoutes>
                                }
                            />
                        ),
                    )}

                    <Route
                        path="/staff/*"
                        element={
                            <Navigate
                                to="/admin/appointments"
                                replace
                            />
                        }
                    />

                    <Route
                        path="/admin/*"
                        element={
                            <Navigate
                                to="/admin"
                                replace
                            />
                        }
                    />

                    <Route
                        path="*"
                        element={
                            <Navigate
                                to="/"
                                replace
                            />
                        }
                    />
                </Routes>
            </Suspense>
        </BrowserRouter>
    )
}

export default App

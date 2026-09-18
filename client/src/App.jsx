import { lazy, Suspense, useEffect } from "react"
const AdminPaymentSettings = lazy(() => import("./pages/AdminPaymentSettings"))
const AdminPaymentReview = lazy(() => import("./pages/AdminPaymentReview"))
import { BrowserRouter, useLocation, Routes, Route, Navigate } from "react-router-dom"

import Home from "./pages/Home"
import Services from "./pages/Services"
import Book from "./pages/Book"
import Contact from "./pages/Contact"

const AdminDashboard = lazy(() => import("./pages/AdminDashboard"))
const AdminRegister = lazy(() => import("./pages/AdminRegister"))
const AdminAppointments = lazy(() => import("./pages/AdminAppointments"))
const AdminStaff = lazy(() => import("./pages/AdminStaff"))
const EmergencyMode = lazy(() => import("./pages/EmergencyMode"))
const AdminInventory = lazy(() => import("./pages/AdminInventory"))
const AdminServices = lazy(() => import("./pages/AdminServices"))
const AdminTransactions = lazy(() => import("./pages/AdminTransactions"))
const AdminReports = lazy(() => import("./pages/AdminReports"))
const AdminRecommendations = lazy(() => import("./pages/AdminRecommendations"))
const AdminGAD = lazy(() => import("./pages/AdminGAD"))
const AdminAccounts = lazy(() => import("./pages/AdminAccounts"))
const AdminLogin = lazy(() => import("./pages/AdminLogin"))
import ForgotPassword from "./pages/ForgotPassword"
const MyAccount = lazy(() => import("./pages/MyAccount"))

import ProtectedRoutes from "./components/ProtectedRoutes"
import AdminLayout from "./components/AdminLayout"

const adminPages = [
    { path: "/admin/payment-settings", Page: AdminPaymentSettings },
    { path: "/admin/payment-review", Page: AdminPaymentReview },
    { path: "/admin", Page: AdminDashboard },
    { path: "/admin/appointments", Page: AdminAppointments },
    { path: "/admin/staff", Page: AdminStaff },
    { path: "/admin/emergency", Page: EmergencyMode },
    { path: "/admin/inventory", Page: AdminInventory },
    { path: "/admin/services", Page: AdminServices },
    { path: "/admin/transactions", Page: AdminTransactions },
    { path: "/admin/reports", Page: AdminReports },
    { path: "/admin/recommendations", Page: AdminRecommendations },
    { path: "/admin/gad", Page: AdminGAD },
    { path: "/admin/accounts", Page: AdminAccounts },
    { path: "/admin/my-account", Page: MyAccount },
]

function RouteScroll() {
    const { pathname } = useLocation()
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: "instant" })
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
                    <Route path="/" element={<Home />} />

                    <Route path="/login" element={<AdminLogin />} />

                    <Route path="/register" element={<Navigate to="/admin-login" replace />} />

                    <Route path="/admin-login" element={<AdminLogin />} />

                    <Route path="/forgot-password" element={<ForgotPassword />} />

                    <Route path="/admin-register" element={<AdminRegister />} />

                    <Route path="/home" element={<Navigate to="/" replace />} />

                    <Route path="/services" element={<Services />} />
                    <Route path="/book" element={<Book />} />
                    <Route path="/contact" element={<Contact />} />

                    <Route path="/dashboard" element={<Navigate to="/" replace />} />

                    {adminPages.map(({ path, Page }) => (
                        <Route
                            key={path}
                            path={path}
                            element={
                                <ProtectedRoutes allowedRoles={["owner", "admin"]}>
                                    <AdminLayout>
                                        <Page />
                                    </AdminLayout>
                                </ProtectedRoutes>
                            }
                        />
                    ))}

                    <Route path="/admin/*" element={<Navigate to="/admin" replace />} />

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Suspense>
        </BrowserRouter>
    )
}

export default App

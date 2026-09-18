import AdminPaymentSettings from "./pages/AdminPaymentSettings"
import AdminPaymentReview from "./pages/AdminPaymentReview"
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom"

import Home from "./pages/Home"
import Services from "./pages/Services"
import Book from "./pages/Book"
import Contact from "./pages/Contact"

import AdminDashboard from "./pages/AdminDashboard"
import AdminRegister from "./pages/AdminRegister"
import AdminAppointments from "./pages/AdminAppointments"
import AdminStaff from "./pages/AdminStaff"
import EmergencyMode from "./pages/EmergencyMode"
import AdminInventory from "./pages/AdminInventory"
import AdminServices from "./pages/AdminServices"
import AdminTransactions from "./pages/AdminTransactions"
import AdminReports from "./pages/AdminReports"
import AdminRecommendations from "./pages/AdminRecommendations"
import AdminGAD from "./pages/AdminGAD"
import AdminAccounts from "./pages/AdminAccounts"
import AdminLogin from "./pages/AdminLogin"
import ForgotPassword from "./pages/ForgotPassword"
import MyAccount from "./pages/MyAccount"

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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/login" element={<AdminLogin />} />

        <Route
          path="/register"
          element={<Navigate to="/admin-login" replace />}
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
          element={<Navigate to="/" replace />}
        />

        <Route path="/services" element={<Services />} />
        <Route path="/book" element={<Book />} />
        <Route path="/contact" element={<Contact />} />

        <Route
          path="/dashboard"
          element={<Navigate to="/" replace />}
        />

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

        <Route
          path="/admin/*"
          element={<Navigate to="/admin" replace />}
        />

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
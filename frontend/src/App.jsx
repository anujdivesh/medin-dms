import { ThemeProvider } from "@/components/theme-provider"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
const baseName = import.meta.env.VITE_BASE_PATH || "/"
import Layout from "@/components/Layout"
import Home from "@/pages/Home"
import CartPage from "@/pages/CartPage"
import MyRequestsPage from "@/pages/MyRequestsPage"
import RequestDetailPage from "@/pages/RequestDetailPage"
import LoginPage from "@/pages/auth/LoginPage"
import RegisterPage from "@/pages/auth/RegisterPage"
import VerifyEmailPage from "@/pages/auth/VerifyEmailPage"
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage"
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage"
import AccountPage from "@/pages/AccountPage"
import MagicLinkPage from "@/pages/auth/MagicLinkPage"
import OwnerDashboardPage from "@/pages/OwnerDashboardPage"
import SharesPage from "@/pages/SharesPage"
import UploadRequestsPage from "@/pages/UploadRequestsPage"
import ShareDownloadPage from "@/pages/ShareDownloadPage"
import ProtectedRoute from "@/components/auth/ProtectedRoute"
import { AuthProvider } from "@/context/AuthContext"
import { CartProvider } from "@/context/CartContext"
import { Toaster } from "@/components/ui/sonner"

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <AuthProvider>
        <CartProvider>
          <BrowserRouter basename={baseName === "/" ? undefined : baseName}>
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/Home" replace />} />
                <Route path="/Home" element={<Home />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
                <Route path="/my-requests" element={<ProtectedRoute><MyRequestsPage /></ProtectedRoute>} />
                <Route path="/my-requests/:id" element={<ProtectedRoute><RequestDetailPage /></ProtectedRoute>} />
                <Route path="/auth/link" element={<MagicLinkPage />} />
                <Route path="/owner" element={<ProtectedRoute role="owner"><OwnerDashboardPage /></ProtectedRoute>} />
                <Route path="/shares" element={<ProtectedRoute><SharesPage /></ProtectedRoute>} />
                <Route path="/uploads" element={<ProtectedRoute><UploadRequestsPage /></ProtectedRoute>} />
                <Route path="/s/:token" element={<ShareDownloadPage />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
      <Toaster />
    </ThemeProvider>
  )
}

export default App

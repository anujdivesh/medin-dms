import { Navigate, useLocation } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"

/**
 * Renders children only for logged-in users; others go to /login?next=...
 * `role` optionally requires a role from /auth/me's `roles`, e.g.
 * <ProtectedRoute role="owner"> for the (phase 2) owner dashboard.
 */
export default function ProtectedRoute({ children, role }) {
  const { status, roles } = useAuth()
  const location = useLocation()

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
      </div>
    )
  }
  if (status !== "authenticated") {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (role && !roles[role]) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <h2 className="text-lg font-semibold mb-2">Access restricted</h2>
        <p className="text-muted-foreground">Your account doesn't have access to this page.</p>
      </div>
    )
  }
  return children
}

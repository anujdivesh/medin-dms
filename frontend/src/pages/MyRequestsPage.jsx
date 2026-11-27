import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronRight, Loader2, MailWarning } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import StatusBadge from "@/components/datarequests/StatusBadge"
import { API_ENDPOINTS } from "@/config/apiEndpoints"
import { useAuth } from "@/context/AuthContext"
import { apiService } from "@/lib/apiClient"
import { resendVerification } from "@/lib/auth"
import { formatDate } from "@/lib/format"

function VerifyEmailNotice() {
  const { user } = useAuth()
  const [sent, setSent] = useState(false)
  if (!user || user.profile?.email_verified) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm">
      <MailWarning className="h-4 w-4 text-amber-600" />
      <span className="flex-1">Please verify your email address ({user.email}).</span>
      <Button
        size="sm"
        variant="outline"
        disabled={sent}
        onClick={async () => {
          try {
            await resendVerification()
            setSent(true)
            toast.success("Verification email sent.")
          } catch (err) {
            toast.error(err.message)
          }
        }}
      >
        {sent ? "Sent" : "Resend link"}
      </Button>
    </div>
  )
}

export default function MyRequestsPage() {
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    apiService
      .get(`${API_ENDPOINTS.DATA_REQUESTS.BASE}?page_size=100`)
      .then((data) => setRequests(data.results || data))
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div className="max-w-4xl mx-auto py-6 px-2 space-y-4">
      <VerifyEmailNotice />
      <Card>
        <CardHeader>
          <CardTitle>My data requests</CardTitle>
          <CardDescription>Track the status of each request you have submitted.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!error && requests === null && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
            </div>
          )}
          {requests?.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              You haven't requested any data yet. <Link to="/Home" className="text-primary hover:underline">Browse the catalogue</Link>
            </p>
          )}
          {requests?.length > 0 && (
            <ul className="divide-y">
              {requests.map((req) => (
                <li key={req.id}>
                  <Link to={`/my-requests/${req.id}`} className="flex items-center gap-3 py-3 hover:bg-muted/50 rounded px-2 -mx-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{req.reference}</span>
                        <StatusBadge status={req.status} />
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {formatDate(req.created_at)} · {req.item_count} dataset{req.item_count === 1 ? "" : "s"} · {req.purpose}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

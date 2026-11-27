import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import StatusBadge from "@/components/datarequests/StatusBadge"
import ItemShareLinks from "@/components/shares/ItemShareLinks"
import { API_ENDPOINTS } from "@/config/apiEndpoints"
import { apiService } from "@/lib/apiClient"
import { formatDate } from "@/lib/format"

const CANCELLABLE = ["submitted", "in_review"]

export default function RequestDetailPage() {
  const { id } = useParams()
  const [request, setRequest] = useState(null)
  const [error, setError] = useState("")
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    apiService
      .get(API_ENDPOINTS.DATA_REQUESTS.BY_ID(id))
      .then(setRequest)
      .catch((err) => setError(err.status === 404 ? "Request not found." : err.message))
  }, [id])

  const cancel = async () => {
    if (!window.confirm("Cancel this request? Datasets not yet decided on will be withdrawn.")) return
    setCancelling(true)
    try {
      setRequest(await apiService.post(API_ENDPOINTS.DATA_REQUESTS.CANCEL(id)))
      toast.success("Request cancelled.")
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-2 space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/my-requests"><ArrowLeft className="h-4 w-4" /> My requests</Link>
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && !request && (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
        </div>
      )}

      {request && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {request.reference} <StatusBadge status={request.status} />
              </CardTitle>
              <CardDescription>Submitted {formatDate(request.created_at)}</CardDescription>
            </div>
            {CANCELLABLE.includes(request.status) && (
              <Button variant="outline" size="sm" onClick={cancel} disabled={cancelling}>
                {cancelling && <Loader2 className="h-4 w-4 animate-spin" />} Cancel request
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-sm">
              <div className="text-muted-foreground text-xs mb-1">Purpose</div>
              <p className="whitespace-pre-wrap">{request.purpose}</p>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Datasets</div>
              <ul className="divide-y border rounded-md">
                {request.items.map((item) => (
                  <li key={item.id} className="p-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{item.record_title || `Record #${item.record}`}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.organisation ? `Owner: ${item.organisation}` : "Data owner being identified by SPC"}
                        {item.decided_at && ` · decided ${formatDate(item.decided_at)}`}
                      </div>
                      {item.decision_note && (
                        <p className="text-xs mt-1 whitespace-pre-wrap">“{item.decision_note}”</p>
                      )}
                      <ItemShareLinks shares={item.shares} />
                    </div>
                    <StatusBadge status={item.status} />
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

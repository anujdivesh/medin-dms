import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Check, Copy, FolderUp, Loader2, Upload } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import ShareUploadDialog from "@/components/shares/ShareUploadDialog"
import { API_ENDPOINTS } from "@/config/apiEndpoints"
import { useAuth } from "@/context/AuthContext"
import { apiService } from "@/lib/apiClient"
import { copyText } from "@/lib/clipboard"
import { formatDate } from "@/lib/format"

const { SHARES } = API_ENDPOINTS

/**
 * Datasets a data owner asked this user to upload (shares.UploadRequest).
 * Uploading here publishes a share for the request item: the requester is
 * emailed the download link and the owner is told it's done.
 */
export default function UploadRequestsPage() {
  const { refreshUser } = useAuth()
  const [params] = useSearchParams()
  const focusItem = params.get("item")
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState("")
  const [uploadFor, setUploadFor] = useState(null) // {id, title} - the request item

  const load = useCallback(async () => {
    setError("")
    try {
      setRequests(await apiService.get(SHARES.UPLOAD_REQUESTS))
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Deep link from the email: scroll to that dataset once it's on screen.
  useEffect(() => {
    if (!focusItem || !requests) return
    document.getElementById(`upload-${focusItem}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [focusItem, requests])

  const open = (requests || []).filter((r) => r.status === "open")
  const done = (requests || []).filter((r) => r.status === "completed")

  return (
    <div className="max-w-4xl mx-auto py-6 px-2 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Data to upload</h1>
        <p className="text-sm text-muted-foreground">
          Data owners asked you to send these datasets. Upload the files and the requester is emailed a download link
          (kept for 7 days).
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && requests === null && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
        </div>
      )}
      {requests && open.length === 0 && (
        <div className="flex flex-col items-center py-12 gap-2 text-muted-foreground">
          <FolderUp className="h-10 w-10" />
          <p>Nothing to upload right now.</p>
        </div>
      )}

      {open.map((r) => (
        <Card
          key={r.id}
          id={`upload-${r.item.id}`}
          className={String(r.item.id) === focusItem ? "ring-2 ring-primary" : ""}
        >
          <CardHeader>
            <CardTitle className="text-base">{r.item.record_title || `Record #${r.item.record}`}</CardTitle>
            <CardDescription>
              {r.request.reference} · asked by {r.requested_by.name}
              {r.requested_by.organisation && ` (${r.requested_by.organisation})`} on {formatDate(r.created_at)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {r.message && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Message from {r.requested_by.name}</div>
                <p className="whitespace-pre-wrap">{r.message}</p>
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Requested by</div>
              <p>
                {r.requester.name}
                {r.requester.affiliation && `, ${r.requester.affiliation}`}
                {r.requester.country && ` (${r.requester.country})`}
              </p>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Purpose</div>
              <p className="whitespace-pre-wrap">{r.request.purpose}</p>
            </div>
            <Button
              onClick={() => setUploadFor({ id: r.item.id, title: r.item.record_title || `Record #${r.item.record}` })}
            >
              <Upload className="h-4 w-4" /> Upload files
            </Button>
          </CardContent>
        </Card>
      ))}

      {done.length > 0 && (
        <div className="space-y-2 pt-2">
          <h2 className="text-sm font-medium text-muted-foreground">Uploaded (last 30 days)</h2>
          <ul className="divide-y border rounded-md">
            {done.map((r) => (
              <li key={r.id} className="p-3 flex flex-wrap items-center gap-2 justify-between text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.item.record_title || `Record #${r.item.record}`}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.request.reference} · uploaded {formatDate(r.completed_at)}
                  </div>
                </div>
                {r.share_url ? (
                  <Button size="sm" variant="outline" onClick={() => copyText(r.share_url)}>
                    <Copy className="h-4 w-4" /> Copy download link
                  </Button>
                ) : (
                  <Badge variant="outline">
                    <Check className="h-3 w-3" /> Link expired
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ShareUploadDialog
        open={Boolean(uploadFor)}
        requestItem={uploadFor}
        onOpenChange={(isOpen) => !isOpen && setUploadFor(null)}
        onPublished={() => {
          load()
          refreshUser()
        }}
      />
    </div>
  )
}

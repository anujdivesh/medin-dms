import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Copy, FolderUp, Loader2, Plus, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import ShareUploadDialog from "@/components/shares/ShareUploadDialog"
import { API_ENDPOINTS } from "@/config/apiEndpoints"
import { useAuth } from "@/context/AuthContext"
import { apiService } from "@/lib/apiClient"
import { copyText } from "@/lib/clipboard"
import { formatBytes, formatDate, formatDateTime } from "@/lib/format"

const { SHARES } = API_ENDPOINTS

const STATUS = {
  draft: ["Unfinished upload", "secondary"],
  ready: ["Live", "default"],
  expired: ["Expired", "outline"],
  revoked: ["Revoked", "outline"],
}

/** File shares the user made (SPC staff: everyone's). */
export default function SharesPage() {
  const { roles } = useAuth()
  const [shares, setShares] = useState(null)
  const [error, setError] = useState("")
  const [dialog, setDialog] = useState({ open: false, share: null })

  const load = useCallback(async () => {
    try {
      const data = await apiService.get(`${SHARES.BASE}?page_size=200`)
      setShares(data.results || data)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const revoke = async (share) => {
    const what = share.status === "draft" ? "Delete this unfinished upload?" : "Revoke this link and delete the files now?"
    if (!window.confirm(what)) return
    try {
      await apiService.delete(SHARES.DETAIL(share.id))
      toast.success(share.status === "draft" ? "Upload deleted." : "Link revoked and files deleted.")
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-2 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">File shares</h1>
          <p className="text-sm text-muted-foreground">
            Download links for large files. Each link works for 7 days, then the files are deleted.
          </p>
        </div>
        {(roles.admin || roles.owner) && (
          <Button onClick={() => setDialog({ open: true, share: null })}>
            <Plus className="h-4 w-4" /> New share
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && shares === null && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
        </div>
      )}
      {shares?.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-2 text-muted-foreground text-center">
          <FolderUp className="h-10 w-10" />
          <p>No file shares yet.</p>
          {roles.owner && (
            <p className="text-sm">
              Use “New share” to send files to anyone. To send data for an approved request, use “Share files” on{" "}
              <Link to="/owner" className="text-primary hover:underline">Review requests</Link> instead, so the
              requester is emailed automatically.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {shares?.map((share) => {
          const [label, variant] = STATUS[share.status] || [share.status, "outline"]
          return (
            <Card key={share.id}>
              <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium truncate">{share.title}</span>
                    <Badge variant={variant}>{label}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {share.files.length} file(s), {formatBytes(share.total_size)}
                    {share.request_reference && (
                      <> · for {share.request_reference}{share.record_title ? ` (${share.record_title})` : ""}</>
                    )}
                    {share.recipient_email && <> · to {share.recipient_email}</>}
                    {roles.admin && share.created_by && <> · by {share.created_by}</>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created {formatDate(share.created_at)}
                    {share.status === "ready" && <> · expires {formatDateTime(share.expires_at)}</>}
                    {share.status !== "draft" && <> · downloaded {share.download_count}×</>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {share.status === "ready" && (
                    <Button size="sm" variant="outline" onClick={() => copyText(share.url)}>
                      <Copy className="h-4 w-4" /> Copy link
                    </Button>
                  )}
                  {share.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, share })}>
                      <Upload className="h-4 w-4" /> Continue
                    </Button>
                  )}
                  {(share.status === "ready" || share.status === "draft") && (
                    <Button size="sm" variant="ghost" onClick={() => revoke(share)} title="Revoke">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <ShareUploadDialog
        open={dialog.open}
        initialShare={dialog.share}
        onOpenChange={(open) => {
          setDialog((d) => ({ ...d, open }))
          if (!open) load()
        }}
        onPublished={load}
      />
    </div>
  )
}

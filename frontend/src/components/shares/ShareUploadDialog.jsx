import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Copy, FileUp, Loader2, Trash2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { API_ENDPOINTS } from "@/config/apiEndpoints"
import { apiService } from "@/lib/apiClient"
import { copyText } from "@/lib/clipboard"
import { formatBytes, formatDateTime, formatDuration } from "@/lib/format"
import { createShareUpload } from "@/lib/shareUpload"

const { SHARES } = API_ENDPOINTS
const fileKey = (file) => `${file.name}:${file.size}:${file.lastModified}`

/**
 * Upload files and publish a share link. For a data owner it's tied to an
 * approved request item (`requestItem`, the requester is emailed the link);
 * SPC staff can also make standalone shares (title + optional recipient).
 * Re-opening for the same item (or passing a draft as `initialShare`) picks
 * up the unfinished share, and re-adding a partly uploaded file resumes it.
 */
export default function ShareUploadDialog({ open, onOpenChange, requestItem = null, initialShare = null, onPublished }) {
  const [share, setShare] = useState(null)
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [recipient, setRecipient] = useState("")
  const [queue, setQueue] = useState([]) // {key, file, sent, status: queued|uploading|done|error, error}
  const [phase, setPhase] = useState("select") // select | uploading | publishing | done
  const [error, setError] = useState("")
  const [published, setPublished] = useState(null)
  const [speed, setSpeed] = useState(0)
  const [dragging, setDragging] = useState(false)
  const controller = useRef(null)
  const sample = useRef(null)

  const forItem = Boolean(requestItem || initialShare?.request_item)
  const busy = phase === "uploading" || phase === "publishing"

  // Fresh state each time it opens; resume an unfinished share if there is one.
  useEffect(() => {
    if (!open) return
    setQueue([])
    setPhase("select")
    setError("")
    setPublished(null)
    setSpeed(0)
    const adopt = (draft) => {
      setShare(draft)
      setTitle(draft?.title || "")
      setMessage(draft?.message || "")
      setRecipient(draft?.recipient_email || "")
    }
    adopt(initialShare)
    if (!initialShare && requestItem) {
      apiService
        .get(`${SHARES.BASE}?request_item=${requestItem.id}`)
        .then((data) => adopt((data.results || data).find((s) => s.status === "draft") || null))
        .catch(() => {})
    }
  }, [open, initialShare, requestItem])

  // Leaving the page mid-upload loses the tab's progress (it can resume later).
  useEffect(() => {
    if (!busy) return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [busy])

  const addFiles = (fileList) => {
    const incoming = [...fileList].filter((f) => f.size > 0)
    setQueue((current) => {
      const known = new Set(current.map((q) => q.key))
      const added = incoming
        .filter((f) => !known.has(fileKey(f)))
        .map((file) => ({ key: fileKey(file), file, sent: 0, status: "queued", error: "" }))
      return [...current, ...added]
    })
  }

  const updateEntry = (key, changes) =>
    setQueue((current) => current.map((q) => (q.key === key ? { ...q, ...changes } : q)))

  const uploadOne = (shareId, entry) =>
    new Promise((resolve, reject) => {
      updateEntry(entry.key, { status: "uploading", error: "" })
      controller.current = createShareUpload(shareId, entry.file, {
        onProgress: (sent) => {
          updateEntry(entry.key, { sent })
          const now = Date.now()
          const last = sample.current
          if (last && now - last.time >= 2000) {
            const rate = (sent - last.sent) / ((now - last.time) / 1000)
            if (rate >= 0) setSpeed((prev) => (prev ? prev * 0.7 + rate * 0.3 : rate))
            sample.current = { time: now, sent }
          } else if (!last) {
            sample.current = { time: now, sent }
          }
        },
        onSuccess: () => {
          updateEntry(entry.key, { status: "done", sent: entry.file.size })
          sample.current = null
          resolve()
        },
        onError: (err) => {
          updateEntry(entry.key, { status: "error", error: err.message })
          sample.current = null
          reject(err)
        },
      })
      controller.current.start().catch(reject)
    })

  const removeServerFile = async (file) => {
    try {
      await apiService.delete(SHARES.UPLOAD(share.id, file.id))
      setShare((s) => ({ ...s, files: s.files.filter((f) => f.id !== file.id) }))
    } catch (err) {
      setError(err.message)
    }
  }

  const start = async () => {
    setError("")
    if (!forItem && !title.trim()) {
      setError("Give the share a title.")
      return
    }
    const pendingCount = queue.filter((q) => q.status !== "done").length
    const serverFiles = share?.files || []
    if (!pendingCount && !serverFiles.length) {
      setError("Add at least one file.")
      return
    }
    setPhase("uploading")
    try {
      let current = share
      const details = { message, ...(forItem ? {} : { title, recipient_email: recipient }) }
      current = current
        ? await apiService.patch(SHARES.DETAIL(current.id), details)
        : await apiService.post(SHARES.BASE, { ...details, request_item: requestItem?.id ?? null })
      setShare(current)

      for (const entry of queue) {
        if (entry.status === "done") continue
        await uploadOne(current.id, entry)
      }
      current = await apiService.get(SHARES.DETAIL(current.id))
      setShare(current)
      const partial = current.files.filter((f) => !f.complete)
      if (partial.length) {
        setError(
          `${partial.map((f) => f.name).join(", ")} ${partial.length > 1 ? "are" : "is"} only partly uploaded. ` +
            "Add the same file again to resume it, or remove it.",
        )
        setPhase("select")
        return
      }
      setPhase("publishing")
      const done = await apiService.post(SHARES.PUBLISH(current.id))
      setPublished(done)
      setPhase("done")
      onPublished?.(done)
    } catch (err) {
      setError(err.message || "Upload failed.")
      setPhase("select")
    } finally {
      controller.current = null
    }
  }

  const close = useCallback(
    (nextOpen) => {
      if (nextOpen) return onOpenChange(true)
      if (busy && !window.confirm("Stop uploading? You can resume later by adding the same files again.")) return
      controller.current?.abort()
      onOpenChange(false)
    },
    [busy, onOpenChange],
  )

  const totalBytes = queue.reduce((sum, q) => sum + q.file.size, 0)
  const sentBytes = queue.reduce((sum, q) => sum + q.sent, 0)
  const percent = totalBytes ? Math.floor((sentBytes / totalBytes) * 100) : 0
  const eta = speed > 0 ? (totalBytes - sentBytes) / speed : NaN

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{phase === "done" ? "Files shared" : "Share files"}</DialogTitle>
          <DialogDescription>
            {requestItem?.title || share?.record_title || share?.title || "Upload files and get a download link."}
          </DialogDescription>
        </DialogHeader>

        {phase === "done" && published ? (
          <div className="space-y-3">
            <p className="text-sm">
              {forItem
                ? "The requester has been emailed this download link."
                : published.recipient_email
                  ? `${published.recipient_email} has been emailed this download link.`
                  : "Send this link to the recipient."}{" "}
              It works until <strong>{formatDateTime(published.expires_at)}</strong>; then the files are deleted.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={published.url} onFocus={(e) => e.target.select()} />
              <Button type="button" variant="outline" onClick={() => copyText(published.url)}>
                <Copy className="h-4 w-4" /> Copy
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!forItem && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="share-title">Title <span className="text-destructive">*</span></Label>
                  <Input id="share-title" value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="share-recipient">Recipient email (optional)</Label>
                  <Input
                    id="share-recipient"
                    type="email"
                    value={recipient}
                    disabled={busy}
                    onChange={(e) => setRecipient(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="share-message">Message to the recipient (optional)</Label>
              <Textarea
                id="share-message"
                rows={3}
                value={message}
                disabled={busy}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. File format notes, licence, citation."
              />
            </div>

            <label
              className={`flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-6 text-sm cursor-pointer text-center ${
                dragging ? "border-primary bg-primary/5" : "border-border"
              } ${busy ? "pointer-events-none opacity-60" : ""}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                addFiles(e.dataTransfer.files)
              }}
            >
              <FileUp className="h-6 w-6 text-muted-foreground" />
              <span>Drop files here or <span className="text-primary underline">choose files</span></span>
              <span className="text-xs text-muted-foreground">
                Up to 250 GB per file. Links last 7 days, then files are deleted.
              </span>
              <input
                type="file"
                multiple
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ""
                }}
              />
            </label>

            {(share?.files?.length > 0 || queue.length > 0) && (
              <ul className="divide-y border rounded-md text-sm">
                {(share?.files || [])
                  .filter((f) => !queue.some((q) => q.file.name === f.name && q.file.size === f.size))
                  .map((f) => (
                    <li key={`server-${f.id}`} className="p-2 flex items-center gap-2">
                      {f.complete ? (
                        <Check className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <Upload className="h-4 w-4 text-amber-600 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{f.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {f.complete
                            ? `${formatBytes(f.size)} · uploaded`
                            : `${formatBytes(f.offset)} of ${formatBytes(f.size)} · add the same file again to resume`}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => removeServerFile(f)}
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                {queue.map((q) => (
                  <li key={q.key} className="p-2 space-y-1">
                    <div className="flex items-center gap-2">
                      {q.status === "done" && <Check className="h-4 w-4 text-green-600 shrink-0" />}
                      {q.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
                      <div className="min-w-0 flex-1 truncate">{q.file.name}</div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {q.status === "queued" ? formatBytes(q.file.size) : `${formatBytes(q.sent)} / ${formatBytes(q.file.size)}`}
                      </span>
                      {!busy && q.status !== "done" && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          title="Remove"
                          onClick={() => setQueue((current) => current.filter((x) => x.key !== q.key))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {q.status !== "queued" && <Progress value={(q.sent / q.file.size) * 100} />}
                    {q.error && <p className="text-xs text-destructive">{q.error}</p>}
                  </li>
                ))}
              </ul>
            )}

            {phase === "uploading" && totalBytes > 0 && (
              <div className="space-y-1">
                <Progress value={percent} />
                <p className="text-xs text-muted-foreground">
                  {percent}% · {formatBytes(sentBytes)} of {formatBytes(totalBytes)}
                  {speed > 0 && ` · ${formatBytes(speed)}/s · about ${formatDuration(eta)} left`}
                  {" · "}Keep this tab open until it finishes.
                </p>
              </div>
            )}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {phase === "done" ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                {busy ? "Stop" : "Cancel"}
              </Button>
              <Button onClick={start} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {phase === "publishing" ? "Creating link..." : busy ? "Uploading..." : "Upload and create link"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

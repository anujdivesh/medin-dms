import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Check, FolderUp, Hourglass, Inbox, Loader2, UserPlus, X } from "lucide-react"
import ItemShareLinks from "@/components/shares/ItemShareLinks"
import ShareUploadDialog from "@/components/shares/ShareUploadDialog"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import StatusBadge from "@/components/datarequests/StatusBadge"
import { API_ENDPOINTS } from "@/config/apiEndpoints"
import { useAuth } from "@/context/AuthContext"
import { apiService } from "@/lib/apiClient"
import { formatDate } from "@/lib/format"

const { OWNER } = API_ENDPOINTS

// Group request items under their request, keeping server order (newest first).
const groupByRequest = (items) => {
  const groups = new Map()
  for (const item of items) {
    const key = item.request.id
    if (!groups.has(key)) groups.set(key, { request: item.request, items: [] })
    groups.get(key).items.push(item)
  }
  return [...groups.values()]
}

const DELIVERY = [
  ["upload", "Upload files now", "Approve, then pick the files to send. The requester is emailed a download link."],
  ["delegate", "Ask someone else to upload", "We email them a link; they sign in and upload. The requester gets the download link."],
  ["later", "Later", "Approve only. You can share files or ask someone from this page any time."],
]

function UploaderFields({ email, setEmail, message, setMessage, disabled }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="uploader-email">Their email <span className="text-destructive">*</span></Label>
        <Input
          id="uploader-email"
          type="email"
          value={email}
          disabled={disabled}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. data.manager@organisation.org"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="uploader-message">Message to them (optional)</Label>
        <Textarea
          id="uploader-message"
          rows={2}
          value={message}
          disabled={disabled}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. Please send the 2020-2024 files from the archive."
        />
      </div>
    </div>
  )
}

const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

function DecisionDialog({ pending, onClose, onDone, onShare }) {
  const [note, setNote] = useState("")
  const [delivery, setDelivery] = useState("upload")
  const [uploaderEmail, setUploaderEmail] = useState("")
  const [uploaderMessage, setUploaderMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const declining = pending?.decision === "declined"

  useEffect(() => {
    setNote("")
    setDelivery("upload")
    setUploaderEmail("")
    setUploaderMessage("")
    setError("")
  }, [pending])

  const submit = async () => {
    if (declining && !note.trim()) {
      setError("Please tell the requester why.")
      return
    }
    const delegating = !declining && delivery === "delegate"
    if (delegating && !looksLikeEmail(uploaderEmail)) {
      setError("Enter the email address of the person who will upload the data.")
      return
    }
    setBusy(true)
    try {
      const item = pending.item
      await apiService.post(OWNER.DECISION(item.id), {
        decision: pending.decision,
        note,
        ...(delegating && { upload_request: { email: uploaderEmail.trim(), message: uploaderMessage } }),
      })
      if (declining) toast.success("Request declined.")
      else if (delegating) toast.success(`Approved. We've asked ${uploaderEmail.trim()} to upload the data.`)
      else toast.success("Request approved.")
      onDone()
      if (!declining && delivery === "upload") onShare(item)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{declining ? "Decline" : "Approve"} request</DialogTitle>
          <DialogDescription>{pending?.item.record_title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="decision-note">
              {declining ? "Reason (sent to the requester)" : "Message to the requester (optional)"}
              {declining && <span className="text-destructive"> *</span>}
            </Label>
            <Textarea
              id="decision-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={declining ? "e.g. This dataset is under embargo until 2027." : "e.g. Please cite the dataset as..."}
            />
          </div>

          {!declining && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium mb-1">How will the data be sent?</legend>
              {DELIVERY.map(([value, label, hint]) => (
                <label
                  key={value}
                  className={`flex gap-3 rounded-md border p-3 cursor-pointer ${
                    delivery === value ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="delivery"
                    value={value}
                    checked={delivery === value}
                    onChange={() => setDelivery(value)}
                    className="mt-1 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
              {delivery === "delegate" && (
                <UploaderFields
                  email={uploaderEmail}
                  setEmail={setUploaderEmail}
                  message={uploaderMessage}
                  setMessage={setUploaderMessage}
                  disabled={busy}
                />
              )}
            </fieldset>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={declining ? "destructive" : "default"} onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {declining ? "Decline" : delivery === "upload" ? "Approve and choose files" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Ask someone (any email) to upload the data for an approved item. */
function AskUploaderDialog({ item, onClose, onDone }) {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setEmail("")
    setMessage("")
    setError("")
  }, [item])

  const submit = async () => {
    if (!looksLikeEmail(email)) {
      setError("Enter the email address of the person who will upload the data.")
      return
    }
    setBusy(true)
    try {
      await apiService.post(OWNER.UPLOAD_REQUEST(item.id), { email: email.trim(), message })
      toast.success(`We've asked ${email.trim()} to upload the data.`)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask someone to upload the data</DialogTitle>
          <DialogDescription>
            {item?.record_title}. We'll email them a sign-in link; when they upload the files, the requester gets the
            download link and you get an email.
            {item?.upload_request && ` This replaces the request to ${item.upload_request.email}.`}
          </DialogDescription>
        </DialogHeader>
        <UploaderFields email={email} setEmail={setEmail} message={message} setMessage={setMessage} disabled={busy} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function OwnerDashboardPage() {
  const { user, refreshUser } = useAuth()
  const [params, setParams] = useSearchParams()
  const focusRequest = params.get("request")
  const [tab, setTab] = useState("pending")
  const [items, setItems] = useState(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(null) // {item, decision}
  const [shareItem, setShareItem] = useState(null) // {id, title} - share-files dialog target
  const [askItem, setAskItem] = useState(null) // item - "ask someone to upload" dialog target
  const openShare = useCallback(
    (item) => setShareItem({ id: item.id, title: item.record_title || `Record #${item.record}` }),
    [],
  )

  const load = useCallback(async () => {
    setError("")
    try {
      const data = await apiService.get(`${OWNER.REQUEST_ITEMS}?status=${tab}&page_size=200`)
      setItems(data.results || data)
    } catch (err) {
      setError(err.message)
    }
  }, [tab])

  useEffect(() => {
    setItems(null)
    load()
  }, [load])

  // Deep link from the email: scroll to that request once it's on screen.
  useEffect(() => {
    if (!focusRequest || !items) return
    document.getElementById(`request-${focusRequest}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [focusRequest, items])

  const groups = useMemo(() => groupByRequest(items || []), [items])
  const orgNames = (user?.owned_organisations || []).map((o) => o.name).join(", ")

  const onDecided = async () => {
    setPending(null)
    await Promise.all([load(), refreshUser()])
  }

  const cancelUpload = async (item) => {
    if (!window.confirm(`Cancel the request for ${item.upload_request.email} to upload this data?`)) return
    try {
      await apiService.delete(OWNER.UPLOAD_REQUEST(item.id))
      toast.success("Upload request cancelled.")
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-2 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Review data requests</h1>
        <p className="text-sm text-muted-foreground">
          Requests for datasets owned by {orgNames || "your organisation"}.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Awaiting decision</TabsTrigger>
          <TabsTrigger value="decided">Decided</TabsTrigger>
        </TabsList>
      </Tabs>

      {user?.profile?.account_finished === false ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Finish setting up your account</CardTitle>
            <CardDescription>Set a password for your account before you review requests.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/account">Go to account settings</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        error && <p className="text-sm text-destructive">{error}</p>
      )}
      {!error && items === null && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
        </div>
      )}
      {items?.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-2 text-muted-foreground">
          <Inbox className="h-10 w-10" />
          <p>{tab === "pending" ? "Nothing is waiting for your decision." : "No decided requests yet."}</p>
        </div>
      )}

      {groups.map(({ request, items: requestItems }) => {
        const highlighted = String(request.id) === focusRequest
        const requester = request.requester
        return (
          <Card
            key={request.id}
            id={`request-${request.id}`}
            className={highlighted ? "ring-2 ring-primary" : ""}
          >
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {request.reference}
                <span className="text-xs font-normal text-muted-foreground">submitted {formatDate(request.created_at)}</span>
              </CardTitle>
              <CardDescription>
                <span className="font-medium text-foreground">{requester.name || requester.email}</span>
                {requester.name && <> · <a className="hover:underline" href={`mailto:${requester.email}`}>{requester.email}</a></>}
                {requester.affiliation && <> · {requester.affiliation}</>}
                {requester.country && <> · {requester.country}</>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm">
                <div className="text-xs text-muted-foreground mb-1">Purpose</div>
                <p className="whitespace-pre-wrap">{request.purpose}</p>
              </div>
              <ul className="divide-y border rounded-md">
                {requestItems.map((item) => (
                  <li key={item.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{item.record_title || `Record #${item.record}`}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.organisation}
                        {item.decided_at && ` · decided ${formatDate(item.decided_at)}${item.decided_by ? ` by ${item.decided_by}` : ""}`}
                      </div>
                      {item.decision_note && <p className="text-xs mt-1 whitespace-pre-wrap">“{item.decision_note}”</p>}
                      <ItemShareLinks shares={item.shares} mode="manage" />
                      {item.upload_request && (
                        <p className="text-xs mt-2 flex flex-wrap items-center gap-1 text-amber-700 dark:text-amber-400">
                          <Hourglass className="h-3.5 w-3.5" />
                          Waiting for {item.upload_request.email} to upload (asked {formatDate(item.upload_request.created_at)})
                          <span>·</span>
                          <button type="button" className="underline hover:no-underline" onClick={() => cancelUpload(item)}>
                            Cancel
                          </button>
                        </p>
                      )}
                    </div>
                    {item.status === "pending" ? (
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" onClick={() => setPending({ item, decision: "approved" })}>
                          <Check className="h-4 w-4" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setPending({ item, decision: "declined" })}>
                          <X className="h-4 w-4" /> Decline
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {item.status === "approved" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openShare(item)}>
                              <FolderUp className="h-4 w-4" /> Share files
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setAskItem(item)}>
                              <UserPlus className="h-4 w-4" /> {item.upload_request ? "Ask someone else" : "Ask someone to upload"}
                            </Button>
                          </>
                        )}
                        <StatusBadge status={item.status} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )
      })}

      {focusRequest && items?.length > 0 && !groups.some((g) => String(g.request.id) === focusRequest) && (
        <p className="text-sm text-muted-foreground">
          The request from your email isn't in this list - it may already have been decided.{" "}
          <button type="button" className="text-primary hover:underline" onClick={() => setParams({})}>
            Clear
          </button>
        </p>
      )}

      <DecisionDialog pending={pending} onClose={() => setPending(null)} onDone={onDecided} onShare={openShare} />
      <AskUploaderDialog
        item={askItem}
        onClose={() => setAskItem(null)}
        onDone={() => {
          setAskItem(null)
          load()
        }}
      />
      <ShareUploadDialog
        open={Boolean(shareItem)}
        requestItem={shareItem}
        onOpenChange={(open) => !open && setShareItem(null)}
        onPublished={load}
      />
    </div>
  )
}

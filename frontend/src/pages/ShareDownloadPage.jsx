import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { Copy, Download, FileDown, Loader2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { API_ENDPOINTS } from "@/config/apiEndpoints"
import { apiService } from "@/lib/apiClient"
import { copyText } from "@/lib/clipboard"
import { formatBytes, formatDateTime } from "@/lib/format"

const { SHARES } = API_ENDPOINTS

// Literal (no expansion) quoting: bash/zsh '...' with ' as '\'', PowerShell '...' with ' as ''.
const shQuote = (s) => `'${s.replace(/'/g, `'\\''`)}'`
const psQuote = (s) => `'${s.replace(/'/g, "''")}'`

const daysLeft =(iso) => Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 86400000))

/** Public page behind a share link (/s/:token) - no login needed. */
export default function ShareDownloadPage() {
  const { token } = useParams()
  const [share, setShare] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    apiService
      .get(SHARES.PUBLIC(token))
      .then(setShare)
      .catch((err) => setError(err.message || "This link can't be opened."))
  }, [token])

  // Absolute, so it works pasted into a terminal (the API base may be relative in dev).
  const fileUrl = (file) => new URL(`${apiService.baseURL}${SHARES.PUBLIC_FILE(token, file.id)}`, window.location.origin).href
  // -C - resumes; -o names the file (curl won't combine -C - with -J).
  // Single-quoted so nothing in a name is expanded by the shell.
  const commands = (os) =>
    (share?.files || [])
      .map((file) =>
        os === "windows"
          ? // curl.exe, not curl: in Windows PowerShell "curl" is Invoke-WebRequest (no resume).
            `curl.exe -C - -o ${psQuote(file.name)} ${psQuote(fileUrl(file))}`
          : `curl -C - -o ${shQuote(file.name)} ${shQuote(fileUrl(file))}`,
      )
      .join("\n")
  const [os, setOs] = useState(() => (/windows/i.test(navigator.userAgent) ? "windows" : "unix"))
  const curlCommands = commands(os)

  return (
    <div className="max-w-2xl mx-auto py-10 px-2">
      <Card>
        {error ? (
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" /> Files not available
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        ) : !share ? (
          <CardContent className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileDown className="h-5 w-5" /> {share.title}
              </CardTitle>
              <CardDescription>
                {share.files.length} file(s), {formatBytes(share.total_size)} in total. Available until{" "}
                {formatDateTime(share.expires_at)} ({daysLeft(share.expires_at)} day(s) left), then deleted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {share.message && (
                <div className="text-sm">
                  <div className="text-xs text-muted-foreground mb-1">Message</div>
                  <p className="whitespace-pre-wrap">{share.message}</p>
                </div>
              )}
              <ul className="divide-y border rounded-md">
                {share.files.map((file) => (
                  <li key={file.id} className="p-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{file.name}</div>
                      <div className="text-xs text-muted-foreground">{formatBytes(file.size)}</div>
                    </div>
                    <Button asChild size="sm">
                      {/* Plain link: the browser (or a download manager) streams it and can resume. */}
                      <a href={fileUrl(file)} download>
                        <Download className="h-4 w-4" /> Download
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">
                  Command line - run it in the folder to save to; run it again to resume an interrupted download.
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Tabs value={os} onValueChange={setOs}>
                    <TabsList>
                      <TabsTrigger value="unix">Linux / macOS</TabsTrigger>
                      <TabsTrigger value="windows">Windows PowerShell</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Button type="button" size="sm" variant="ghost" onClick={() => copyText(curlCommands, "Command copied.")}>
                    <Copy className="h-4 w-4" /> Copy
                  </Button>
                </div>
                <pre className="text-xs bg-muted rounded-md p-2 whitespace-pre-wrap break-all">{curlCommands}</pre>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}

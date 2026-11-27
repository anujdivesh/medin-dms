import { Copy, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { copyText } from "@/lib/clipboard"
import { formatBytes, formatDateTime } from "@/lib/format"

/**
 * Live share links on a data request item (`item.shares`).
 * `mode="download"` for the requester, `mode="manage"` for the owner
 * (copy link + download count).
 */
export default function ItemShareLinks({ shares, mode = "download" }) {
  if (!shares?.length) return null
  return (
    <ul className="mt-2 space-y-1">
      {shares.map((share) => (
        <li key={share.id} className="flex flex-wrap items-center gap-2 text-xs">
          {mode === "download" ? (
            <Button asChild size="sm">
              <a href={share.url} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" /> Download data
              </a>
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => copyText(share.url)}>
              <Copy className="h-4 w-4" /> Copy download link
            </Button>
          )}
          <span className="text-muted-foreground">
            {share.file_count} file(s), {formatBytes(share.total_size)} · available until {formatDateTime(share.expires_at)}
            {mode === "manage" && ` · downloaded ${share.download_count}×`}
          </span>
        </li>
      ))}
    </ul>
  )
}

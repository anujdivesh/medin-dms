// Resumable uploads for file shares (backend: shares/tus.py, tus protocol).
// Files go up in 16 MB chunks; a dropped connection is retried, and picking
// the same file again for the same share (even after a reload) resumes from
// the last chunk the server has instead of starting over.
import * as tus from "tus-js-client"
import { API_ENDPOINTS } from "@/config/apiEndpoints"
import { apiService } from "@/lib/apiClient"
import { refreshAccessToken, tokenStore } from "@/lib/tokenStore"

export const CHUNK_SIZE = 16 * 1024 * 1024

// Seconds until a JWT expires (0 if unreadable).
const secondsLeft = (token) => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    return payload.exp - Date.now() / 1000
  } catch {
    return 0
  }
}

// Access tokens last 30 minutes and a big upload takes hours: refresh
// shortly before each chunk if the token is about to run out.
const freshAccessToken = async () => {
  const token = tokenStore.getAccessToken()
  if (token && secondsLeft(token) > 120) return token
  return (await refreshAccessToken()) || tokenStore.getAccessToken()
}

const absolute = (url) => new URL(url, window.location.origin).href

/**
 * Upload one file into a draft share. Returns a controller {start, abort}.
 * Callbacks: onProgress(bytesSent, bytesTotal), onSuccess(), onError(error).
 */
export function createShareUpload(shareId, file, { onProgress, onSuccess, onError }) {
  const upload = new tus.Upload(file, {
    // Trailing slash matters: the server answers with upload URLs relative to it.
    endpoint: absolute(`${apiService.baseURL}${API_ENDPOINTS.SHARES.UPLOADS(shareId)}`),
    chunkSize: CHUNK_SIZE,
    retryDelays: [0, 3000, 10000, 30000, 60000, 120000, 300000],
    metadata: { filename: file.name },
    storeFingerprintForResuming: true,
    removeFingerprintOnSuccess: true,
    onBeforeRequest: async (req) => {
      req.setHeader("Authorization", `Bearer ${await freshAccessToken()}`)
    },
    onShouldRetry: (err) => {
      const status = err?.originalResponse?.getStatus?.()
      if (status === 401) {
        refreshAccessToken()
        return true
      }
      // Network errors (no status), server errors, and offset conflicts
      // (the client re-reads the offset) are worth retrying.
      return !status || status >= 500 || status === 409 || status === 423
    },
    onProgress,
    onSuccess,
    onError: (err) => {
      // Show the server's message (e.g. "Not enough storage space...") when there is one.
      const body = err?.originalResponse?.getBody?.()
      onError(new Error(body && body.length < 300 ? body : err.message))
    },
  })

  return {
    start: async () => {
      const previous = await upload.findPreviousUploads()
      if (previous.length) upload.resumeFromPreviousUpload(previous[0])
      upload.start()
    },
    abort: () => upload.abort(),
  }
}

// JWT storage + refresh, shared by apiClient (attaches/refreshes tokens) and
// lib/auth.js (login/logout). Kept dependency-free to avoid import cycles.
import { getApiBaseURL } from "@/config/app"

const STORAGE_KEY = "dms-auth"
export const AUTH_CHANGED_EVENT = "dms-auth-changed"

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null
  } catch {
    return null
  }
}

const notify = () => window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))

export const tokenStore = {
  get: read,
  getAccessToken: () => read()?.access_token || null,
  getRefreshToken: () => read()?.refresh_token || null,
  set: ({ access_token, refresh_token }) => {
    const current = read() || {}
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        access_token: access_token ?? current.access_token,
        refresh_token: refresh_token ?? current.refresh_token,
      }))
    } catch {
      // Storage unavailable (private mode etc.) - session just won't persist.
    }
    notify()
  },
  clear: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    notify()
  },
}

// One refresh at a time: concurrent 401s all wait on the same promise.
let refreshing = null

export const refreshAccessToken = () => {
  if (refreshing) return refreshing
  const refreshToken = tokenStore.getRefreshToken()
  if (!refreshToken) return Promise.resolve(null)

  refreshing = (async () => {
    try {
      const res = await fetch(`${getApiBaseURL()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      const body = await res.json().catch(() => null)
      // Legacy envelope: {status, msg, data: {access_token}}
      const access = body?.status === "success" ? body.data?.access_token : null
      if (!access) {
        tokenStore.clear()
        return null
      }
      tokenStore.set({ access_token: access })
      return access
    } catch {
      return null
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

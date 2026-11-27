// Fetch wrapper for the Django API. Attaches the logged-in user's JWT and,
// on a 401, refreshes it once and retries.
import { getApiBaseURL } from "@/config/app"
import { tokenStore, refreshAccessToken } from "@/lib/tokenStore"

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

// Turn a DRF error body into one readable message.
const errorMessage = (data, status) => {
  if (!data) return `Request failed (${status})`
  if (typeof data === "string") return data
  if (data.detail) return data.detail
  if (data.msg) return data.msg
  const first = Object.entries(data)[0]
  if (first) {
    const [field, value] = first
    const text = Array.isArray(value) ? value.join(" ") : String(value)
    return field === "non_field_errors" ? text : `${field}: ${text}`
  }
  return `Request failed (${status})`
}

const doFetch = (url, options, token) => {
  const isFormData = options.body instanceof FormData
  const headers = {
    ...(!isFormData && { "Content-Type": "application/json" }),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  }
  return fetch(`${apiService.baseURL}${url}`, { ...options, headers })
}

export const apiService = {
  baseURL: getApiBaseURL(),

  // Returns the raw Response (kept for existing callers).
  request: async (url, options = {}) => {
    const token = tokenStore.getAccessToken()
    let res = await doFetch(url, options, token)
    if (res.status === 401 && token) {
      const fresh = await refreshAccessToken()
      if (fresh) res = await doFetch(url, options, fresh)
    }
    return res
  },

  // Parses JSON and throws ApiError (with .status/.data) on non-2xx.
  json: async (url, { body, ...options } = {}) => {
    const res = await apiService.request(url, {
      ...options,
      ...(body !== undefined && { body: body instanceof FormData ? body : JSON.stringify(body) }),
    })
    const data = res.status === 204 ? null : await res.json().catch(() => null)
    if (!res.ok) throw new ApiError(errorMessage(data, res.status), res.status, data)
    return data
  },

  get: (url) => apiService.json(url),
  post: (url, body) => apiService.json(url, { method: "POST", body }),
  patch: (url, body) => apiService.json(url, { method: "PATCH", body }),
  delete: (url) => apiService.json(url, { method: "DELETE" }),
}

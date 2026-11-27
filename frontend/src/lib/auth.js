// Auth API calls. State lives in context/AuthContext.jsx; tokens in tokenStore.
import { getAdminURL } from "@/config/app"
import { API_ENDPOINTS } from "@/config/apiEndpoints"
import { apiService, ApiError } from "@/lib/apiClient"
import { tokenStore } from "@/lib/tokenStore"

const { AUTH } = API_ENDPOINTS

export const loginWithPassword = async (email, password) => {
  // Legacy endpoint: always 200, success/failure in the {status, msg, data} envelope.
  const body = await apiService.post(AUTH.LOGIN, { username: email, password })
  if (body?.status !== "success") {
    // body.code === "google_account": the account has no password and signs in with Google.
    throw new ApiError(body?.msg || "Login failed", 401, body)
  }
  tokenStore.set(body.data)
}

export const register = async (payload) => {
  const body = await apiService.post(AUTH.REGISTER, payload)
  tokenStore.set(body)
  return body.user
}

export const loginWithGoogle = async (credential) => {
  const body = await apiService.post(AUTH.GOOGLE, { credential })
  tokenStore.set(body)
  return body.user
}

// One-time emailed sign-in link (data owners reviewing a request, or someone
// asked to upload data). Returns {user, next, purpose} when signed in, or
// {needsAccount: {email, first_name, last_name}, next, purpose} when the
// address has no finished account yet - then call registerWithMagicLink (or
// sign up with Google for that address). purpose: "owner_review" | "upload_request".
export const loginWithMagicLink = async (token) => {
  const body = await apiService.post(AUTH.MAGIC_LINK, { token })
  if (body.needs_account) {
    const { email, first_name, last_name, next, purpose } = body
    return { needsAccount: { email, first_name, last_name }, next, purpose }
  }
  tokenStore.set(body)
  return { user: body.user, next: body.next, purpose: body.purpose }
}

// Create the account for a sign-in link's address. Returns {user, next, purpose}.
export const registerWithMagicLink = async (token, details) => {
  const body = await apiService.post(AUTH.MAGIC_LINK_REGISTER, { token, ...details })
  tokenStore.set(body)
  return { user: body.user, next: body.next, purpose: body.purpose }
}

export const fetchMe = () => apiService.get(AUTH.ME)

export const updateMe = (changes) => apiService.patch(AUTH.ME, changes)

export const logout = async () => {
  try {
    if (tokenStore.getAccessToken()) await apiService.post(AUTH.LOGOUT)
  } catch {
    // Server-side logout is a no-op; dropping the tokens is what matters.
  } finally {
    tokenStore.clear()
  }
}

export const verifyEmail = (uid, token) => apiService.post(AUTH.VERIFY_EMAIL, { uid, token })

export const resendVerification = () => apiService.post(AUTH.RESEND_VERIFICATION)

// Set a first password (Google-only accounts, no current_password needed) or
// change an existing one. Returns the updated /auth/me payload.
export const changePassword = ({ current_password, new_password }) =>
  apiService.post(AUTH.PASSWORD, { current_password, new_password })

// Staff only: turn the SPA's JWT into a Django admin session cookie so the
// admin opens without a second login. Same-origin fetch stores the cookie.
export const startAdminSession = () => apiService.post(AUTH.ADMIN_SESSION)

// Open the Django admin already signed in. If the session can't be started
// the admin simply shows its own login page.
export const openAdmin = async () => {
  try {
    await startAdminSession()
  } catch {
    // fall through to the admin's login page
  }
  window.location.href = getAdminURL()
}

export const requestPasswordReset = (email) => apiService.post(AUTH.PASSWORD_RESET, { email })

export const confirmPasswordReset = ({ uid, token, new_password }) =>
  apiService.post(AUTH.PASSWORD_RESET_CONFIRM, { uid, token, new_password })

export const isLoggedIn = () => Boolean(tokenStore.getAccessToken())

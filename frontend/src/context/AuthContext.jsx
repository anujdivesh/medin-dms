import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import * as authApi from "@/lib/auth"
import { tokenStore, AUTH_CHANGED_EVENT } from "@/lib/tokenStore"

const AuthContext = createContext(null)

/**
 * status: "loading" (checking a stored token) | "authenticated" | "anonymous"
 * user:   /auth/me payload - includes `roles` ({requester, owner, admin}),
 *         `profile` and `owned_organisations`. Gate UI on `roles`, so new
 *         login levels only need a backend change (accounts/roles.py).
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(() => (authApi.isLoggedIn() ? "loading" : "anonymous"))

  const loadMe = useCallback(async () => {
    if (!authApi.isLoggedIn()) {
      setUser(null)
      setStatus("anonymous")
      return null
    }
    try {
      const me = await authApi.fetchMe()
      setUser(me)
      setStatus("authenticated")
      return me
    } catch (err) {
      if (err?.status === 401) tokenStore.clear()
      setUser(null)
      setStatus("anonymous")
      return null
    }
  }, [])

  useEffect(() => {
    loadMe()
  }, [loadMe])

  // Tokens dropped elsewhere (failed refresh, logout in another tab).
  useEffect(() => {
    const onChange = () => {
      if (!authApi.isLoggedIn()) {
        setUser(null)
        setStatus("anonymous")
      }
    }
    const onStorage = (e) => {
      if (e.key === "dms-auth") loadMe()
    }
    window.addEventListener(AUTH_CHANGED_EVENT, onChange)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, onChange)
      window.removeEventListener("storage", onStorage)
    }
  }, [loadMe])

  const login = useCallback(async (email, password) => {
    await authApi.loginWithPassword(email, password)
    return loadMe()
  }, [loadMe])

  const register = useCallback(async (payload) => {
    const me = await authApi.register(payload)
    setUser(me)
    setStatus("authenticated")
    return me
  }, [])

  const loginWithGoogle = useCallback(async (credential) => {
    const me = await authApi.loginWithGoogle(credential)
    setUser(me)
    setStatus("authenticated")
    return me
  }, [])

  const loginWithMagicLink = useCallback(async (token) => {
    const result = await authApi.loginWithMagicLink(token)
    if (result.user) {
      setUser(result.user)
      setStatus("authenticated")
    }
    return result
  }, [])

  const registerWithMagicLink = useCallback(async (token, details) => {
    const result = await authApi.registerWithMagicLink(token, details)
    setUser(result.user)
    setStatus("authenticated")
    return result
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
    setStatus("anonymous")
  }, [])

  const value = useMemo(() => ({
    user,
    status,
    isAuthenticated: status === "authenticated",
    roles: user?.roles || {},
    login,
    register,
    loginWithGoogle,
    loginWithMagicLink,
    registerWithMagicLink,
    logout,
    refreshUser: loadMe,
  }), [user, status, login, register, loginWithGoogle, loginWithMagicLink, registerWithMagicLink, logout, loadMe])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}

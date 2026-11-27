import { useEffect, useRef, useState } from "react"
import { GOOGLE_CLIENT_ID as CLIENT_ID } from "@/lib/google"

// Google Identity Services, loaded straight from Google - no npm dependency.
// The button hands back an ID token (`credential`) that the backend verifies
// (POST /api/auth/google). Renders nothing when VITE_GOOGLE_CLIENT_ID isn't set.

const SCRIPT_SRC = "https://accounts.google.com/gsi/client"

let scriptPromise = null
const loadScript = () => {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      script.onload = resolve
      script.onerror = () => {
        scriptPromise = null
        reject(new Error("Couldn't load Google sign-in."))
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

export default function GoogleSignInButton({ onCredential, onError, text = "signin_with" }) {
  const containerRef = useRef(null)
  const callbackRef = useRef(onCredential)
  const [failed, setFailed] = useState(false)
  callbackRef.current = onCredential

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current) return
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => callbackRef.current?.(response.credential),
        })
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "outline",
          size: "large",
          text,
          shape: "rectangular",
          width: Math.min(containerRef.current.offsetWidth || 320, 400),
        })
      })
      .catch((err) => {
        setFailed(true)
        onError?.(err)
      })
    return () => {
      cancelled = true
    }
  }, [text, onError])

  if (!CLIENT_ID) return null
  if (failed) {
    return <p className="text-sm text-muted-foreground text-center">Google sign-in is unavailable right now.</p>
  }
  return <div ref={containerRef} className="flex justify-center w-full" />
}

import { useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/context/AuthContext"
import { verifyEmail } from "@/lib/auth"

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const { isAuthenticated, refreshUser } = useAuth()
  const [state, setState] = useState({ status: "loading", message: "" })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // StrictMode double-run: tokens are single-use
    started.current = true
    const uid = params.get("uid")
    const token = params.get("token")
    if (!uid || !token) {
      setState({ status: "error", message: "This verification link is incomplete." })
      return
    }
    verifyEmail(uid, token)
      .then(() => {
        setState({ status: "ok", message: "Your email address has been verified." })
        if (isAuthenticated) refreshUser()
      })
      .catch((err) => setState({ status: "error", message: err.message }))
  }, [params, isAuthenticated, refreshUser])

  return (
    <div className="max-w-md mx-auto py-16 px-2">
      <Card>
        <CardContent className="py-10 flex flex-col items-center text-center gap-3">
          {state.status === "loading" && <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}
          {state.status === "ok" && <CheckCircle2 className="h-8 w-8 text-green-600" />}
          {state.status === "error" && <XCircle className="h-8 w-8 text-destructive" />}
          <p>{state.status === "loading" ? "Verifying your email..." : state.message}</p>
          {state.status !== "loading" && (
            <Button asChild variant="outline">
              <Link to="/Home">Back to the catalogue</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

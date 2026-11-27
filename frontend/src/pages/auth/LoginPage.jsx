import { useEffect, useState } from "react"
import { Link, Navigate, useSearchParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Info, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import GoogleSignInButton from "@/components/auth/GoogleSignInButton"
import { isGoogleSignInEnabled } from "@/lib/google"
import { useAuth } from "@/context/AuthContext"
import { openAdmin } from "@/lib/auth"
import { safeNext } from "@/lib/navigation"

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email"),
  password: z.string().min(1, "Enter your password"),
})

export default function LoginPage() {
  const { status, roles, login, loginWithGoogle } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get("next"))
  // Admins land in the Django admin after logging in, unless they were sent
  // here for something specific (e.g. ?next=/cart from checkout).
  const sendToAdmin = status === "authenticated" && roles.admin && !params.get("next")
  const [formError, setFormError] = useState("")
  const [googleBusy, setGoogleBusy] = useState(false)
  // Set when the email belongs to a Google-created account with no password.
  const [googleAccount, setGoogleAccount] = useState(false)

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  })

  useEffect(() => {
    if (sendToAdmin) openAdmin()
  }, [sendToAdmin])

  // Successful logins (password or Google) land here via the auth state change.
  if (sendToAdmin) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Opening the admin...
      </div>
    )
  }
  if (status === "authenticated") return <Navigate to={next} replace />

  const onSubmit = async ({ email, password }) => {
    setFormError("")
    setGoogleAccount(false)
    try {
      await login(email, password)
    } catch (err) {
      if (err.data?.code === "google_account") setGoogleAccount(true)
      else setFormError(err.message || "Login failed")
    }
  }

  const forgotHref = () => {
    const email = (watch("email") || "").trim()
    return email ? `/forgot-password?email=${encodeURIComponent(email)}` : "/forgot-password"
  }

  const onGoogle = async (credential) => {
    setFormError("")
    setGoogleBusy(true)
    try {
      await loginWithGoogle(credential)
      toast.success("Signed in with Google")
    } catch (err) {
      setFormError(err.message || "Google sign-in failed")
    } finally {
      setGoogleBusy(false)
    }
  }

  return (
    <div className="max-w-md mx-auto py-10 px-2">
      <Card>
        <CardHeader>
          <CardTitle>Log in</CardTitle>
          <CardDescription>Log in to request data and track your requests.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {googleAccount && (
            <div role="alert" className="flex gap-3 rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-500/10 px-4 py-3 text-sm">
              <Info className="h-4 w-4 mt-0.5 text-blue-600 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">This account uses Google sign-in.</p>
                <p className="text-muted-foreground">
                  {isGoogleSignInEnabled
                    ? "Use “Sign in with Google” below. "
                    : ""}
                  To also log in with a password,{" "}
                  <Link to={forgotHref()} className="text-primary hover:underline">set one by email</Link>
                  {isGoogleSignInEnabled ? " or from Account settings after signing in with Google." : "."}
                </p>
              </div>
            </div>
          )}
          {isGoogleSignInEnabled && (
            <>
              <div className={googleAccount ? "rounded-md ring-2 ring-blue-400 ring-offset-2 ring-offset-background p-1" : ""}>
                <GoogleSignInButton onCredential={onGoogle} />
              </div>
              {googleBusy && (
                <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Signing in...
                </p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to={forgotHref()} className="text-xs text-primary underline-offset-4 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Log in
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground">
            New here?{" "}
            <Link to={`/register?next=${encodeURIComponent(next)}`} className="text-primary underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

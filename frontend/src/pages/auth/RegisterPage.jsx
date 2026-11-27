import { useState } from "react"
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import GoogleSignInButton from "@/components/auth/GoogleSignInButton"
import { isGoogleSignInEnabled } from "@/lib/google"
import { useAuth } from "@/context/AuthContext"
import { safeNext } from "@/lib/navigation"

const schema = z
  .object({
    first_name: z.string().trim().min(1, "Required"),
    last_name: z.string().trim().min(1, "Required"),
    email: z.string().trim().email("Enter a valid email"),
    affiliation: z.string().trim().optional(),
    country: z.string().trim().optional(),
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" })

const FIELDS = [
  ["first_name", "First name", "text", "given-name"],
  ["last_name", "Last name", "text", "family-name"],
  ["email", "Email", "email", "email"],
  ["affiliation", "Organisation / institution (optional)", "text", "organization"],
  ["country", "Country (optional)", "text", "country-name"],
  ["password", "Password", "password", "new-password"],
  ["confirm", "Confirm password", "password", "new-password"],
]

export default function RegisterPage() {
  const { status, register: registerAccount, loginWithGoogle } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = safeNext(params.get("next"))
  const [formError, setFormError] = useState("")

  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(FIELDS.map(([name]) => [name, ""])),
  })

  if (status === "authenticated") return <Navigate to={next} replace />

  const onSubmit = async (values) => {
    const payload = { ...values }
    delete payload.confirm
    setFormError("")
    try {
      await registerAccount(payload)
      toast.success("Account created. Check your email for a verification link.")
      navigate(next, { replace: true })
    } catch (err) {
      // Map DRF field errors onto the form.
      const data = err.data || {}
      let mapped = false
      for (const [field, messages] of Object.entries(data)) {
        if (FIELDS.some(([name]) => name === field)) {
          setError(field, { message: Array.isArray(messages) ? messages.join(" ") : String(messages) })
          mapped = true
        }
      }
      if (!mapped) setFormError(err.message || "Registration failed")
    }
  }

  const onGoogle = async (credential) => {
    try {
      await loginWithGoogle(credential)
      navigate(next, { replace: true })
    } catch (err) {
      setFormError(err.message || "Google sign-in failed")
    }
  }

  return (
    <div className="max-w-md mx-auto py-10 px-2">
      <Card>
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>You need an account to submit data requests.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {isGoogleSignInEnabled && (
            <>
              <GoogleSignInButton onCredential={onGoogle} text="signup_with" />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {FIELDS.map(([name, label, type, autoComplete]) => (
              <div key={name} className="space-y-1.5">
                <Label htmlFor={name}>{label}</Label>
                <Input id={name} type={type} autoComplete={autoComplete} {...register(name)} />
                {errors[name] && <p className="text-sm text-destructive">{errors[name].message}</p>}
              </div>
            ))}
            {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Create account
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground">
            Already have an account?{" "}
            <Link to={`/login?next=${encodeURIComponent(next)}`} className="text-primary underline-offset-4 hover:underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

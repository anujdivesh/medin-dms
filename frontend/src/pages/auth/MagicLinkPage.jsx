import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ClipboardCheck, Loader2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import GoogleSignInButton from "@/components/auth/GoogleSignInButton"
import { useAuth } from "@/context/AuthContext"
import { isGoogleSignInEnabled } from "@/lib/google"
import { safeNext } from "@/lib/navigation"
import { applyFieldErrors } from "@/lib/passwordSchema"

const schema = z
  .object({
    first_name: z.string().trim().min(1, "Required"),
    last_name: z.string().trim().min(1, "Required"),
    affiliation: z.string().trim().optional(),
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" })

const FIELDS = [
  ["first_name", "First name", "text", "given-name"],
  ["last_name", "Last name", "text", "family-name"],
  ["affiliation", "Organisation / institution (optional)", "text", "organization"],
  ["password", "Password", "password", "new-password"],
  ["confirm", "Confirm password", "password", "new-password"],
]

// Wording and destination per link purpose (accounts.MagicLink.Purpose).
const COPY = {
  owner_review: {
    title: "Review data requests",
    intro: "This link from your email signs you in so you can approve or decline requests for your organisation's datasets.",
    invited: "You've been asked to review data requests for your organisation's datasets.",
    formLead: "Create your account to review requests. You'll use it to sign in from now on.",
    home: "/owner",
    homeName: "Review requests",
  },
  upload_request: {
    title: "Upload requested data",
    intro: "This link from your email signs you in so you can upload the data a data owner asked you to send.",
    invited: "A data owner has asked you to upload data for a request.",
    formLead: "Create your account to upload the data. You'll use it to sign in from now on.",
    home: "/uploads",
    homeName: "Data to upload",
  },
}

/** Shown when the link's address has no finished account: create one
 *  (name + password, or Google with that same address) before going on. */
function CreateAccountForm({ token, account, next, copy }) {
  const { registerWithMagicLink, loginWithGoogle, logout } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState("")

  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: account.first_name || "",
      last_name: account.last_name || "",
      affiliation: "",
      password: "",
      confirm: "",
    },
  })

  const onSubmit = async (values) => {
    const details = { ...values }
    delete details.confirm
    setFormError("")
    try {
      const result = await registerWithMagicLink(token, details)
      toast.success("Account created.")
      navigate(safeNext(result.next, copy.home), { replace: true })
    } catch (err) {
      const fields = FIELDS.map(([name]) => name)
      if (!applyFieldErrors(err, setError, fields)) setFormError(err.message || "Couldn't create your account.")
    }
  }

  const onGoogle = async (credential) => {
    setFormError("")
    try {
      const me = await loginWithGoogle(credential)
      if (me.email.toLowerCase() !== account.email.toLowerCase()) {
        await logout()
        setFormError(
          `That Google account is ${me.email}. Use the Google account for ${account.email}, or create a password below.`
        )
        return
      }
      navigate(safeNext(next, copy.home), { replace: true })
    } catch (err) {
      setFormError(err.message || "Google sign-in failed.")
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {copy.formLead}
      </p>

      {isGoogleSignInEnabled && (
        <>
          <GoogleSignInButton onCredential={onGoogle} text="signup_with" />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={account.email} readOnly disabled />
        </div>
        {FIELDS.map(([name, label, type, autoComplete]) => (
          <div key={name} className="space-y-1.5">
            <Label htmlFor={name}>{label}</Label>
            <Input id={name} type={type} autoComplete={autoComplete} {...register(name)} />
            {errors[name] && <p className="text-sm text-destructive">{errors[name].message}</p>}
          </div>
        ))}
        {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Create account and continue
        </Button>
      </form>
    </div>
  )
}

/**
 * Landing page for one-time sign-in links in "please review" and "please
 * upload" emails (/auth/link?token=...&for=upload). Signing in needs a click on purpose: email link
 * scanners (e.g. Outlook Safe Links) open URLs automatically and would
 * otherwise use up the single-use link before the person does.
 * People without a finished account must create one before going on.
 */
export default function MagicLinkPage() {
  const [params] = useSearchParams()
  const token = params.get("token")
  const { loginWithMagicLink } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(token ? "" : "This sign-in link is incomplete.")
  const [pendingAccount, setPendingAccount] = useState(null) // {account, next}
  // From the email link until the server tells us the link's real purpose.
  const [purpose, setPurpose] = useState(params.get("for") === "upload" ? "upload_request" : "owner_review")
  const copy = COPY[purpose] || COPY.owner_review

  const onContinue = async () => {
    setBusy(true)
    setError("")
    try {
      const result = await loginWithMagicLink(token)
      if (result.purpose && COPY[result.purpose]) setPurpose(result.purpose)
      if (result.needsAccount) {
        setPendingAccount({ account: result.needsAccount, next: result.next })
        setBusy(false)
        return
      }
      navigate(safeNext(result.next, (COPY[result.purpose] || copy).home), { replace: true })
    } catch (err) {
      setError(err.message || "This sign-in link can't be used.")
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md mx-auto py-12 px-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" /> {pendingAccount ? "Create your account" : copy.title}
          </CardTitle>
          <CardDescription>
            {pendingAccount ? copy.invited : copy.intro}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingAccount && !error && (
            <CreateAccountForm token={token} account={pendingAccount.account} next={pendingAccount.next} copy={copy} />
          )}
          {!pendingAccount && !error && (
            <Button className="w-full" onClick={onContinue} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Continue
            </Button>
          )}
          {error && (
            <div className="space-y-3">
              <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
              </p>
              <p className="text-sm text-muted-foreground">
                Log in, or create an account, with the email address the request was sent to - you'll
                find it under “{copy.homeName}”.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link to={`/login?next=${copy.home}`}>Log in</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to={`/register?next=${copy.home}`}>Create account</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

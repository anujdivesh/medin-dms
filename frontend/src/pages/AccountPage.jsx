import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CheckCircle2, KeyRound, Loader2, MailWarning } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import PasswordField from "@/components/auth/PasswordField"
import { useAuth } from "@/context/AuthContext"
import { changePassword, resendVerification, updateMe } from "@/lib/auth"
import { applyFieldErrors, matchConfirm, newPasswordFields } from "@/lib/passwordSchema"

const profileSchema = z.object({
  first_name: z.string().trim().min(1, "Required"),
  last_name: z.string().trim().min(1, "Required"),
  affiliation: z.string().trim().optional(),
  country: z.string().trim().optional(),
})

const PROFILE_FIELDS = [
  ["first_name", "First name", "given-name"],
  ["last_name", "Last name", "family-name"],
  ["affiliation", "Organisation / institution", "organization"],
  ["country", "Country", "country-name"],
]

function ProfileCard() {
  const { user, refreshUser } = useAuth()
  const [sent, setSent] = useState(false)
  const verified = user.profile?.email_verified

  const { register, handleSubmit, setError, formState: { errors, isSubmitting, isDirty }, reset } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      affiliation: user.profile?.affiliation || "",
      country: user.profile?.country || "",
    },
  })

  const onSubmit = async (values) => {
    try {
      await updateMe(values)
      await refreshUser()
      reset(values)
      toast.success("Profile updated.")
    } catch (err) {
      if (!applyFieldErrors(err, setError, PROFILE_FIELDS.map(([n]) => n))) toast.error(err.message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Shown to data owners when you request data.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-5 space-y-1.5">
          <Label>Email</Label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{user.email}</span>
            {verified ? (
              <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" /> Verified
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 text-xs">
                  <MailWarning className="h-3.5 w-3.5" /> Not verified
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sent}
                  onClick={async () => {
                    try {
                      await resendVerification()
                      setSent(true)
                      toast.success("Verification email sent.")
                    } catch (err) {
                      toast.error(err.message)
                    }
                  }}
                >
                  {sent ? "Sent" : "Resend link"}
                </Button>
              </>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
          {PROFILE_FIELDS.map(([name, label, autoComplete]) => (
            <div key={name} className="space-y-1.5">
              <Label htmlFor={name}>{label}</Label>
              <Input id={name} autoComplete={autoComplete} {...register(name)} />
              {errors[name] && <p className="text-sm text-destructive">{errors[name].message}</p>}
            </div>
          ))}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Save profile
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function PasswordCard() {
  const { user, refreshUser } = useAuth()
  const hasPassword = Boolean(user.profile?.has_password)
  const viaGoogle = user.profile?.auth_provider === "google"

  // Current password is only asked for when one already exists.
  const schema = matchConfirm(
    z.object({
      current_password: hasPassword ? z.string().min(1, "Enter your current password") : z.string().optional(),
      ...newPasswordFields,
    })
  )

  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { current_password: "", new_password: "", confirm: "" },
  })

  const onSubmit = async ({ current_password, new_password }) => {
    try {
      await changePassword({ current_password: hasPassword ? current_password : undefined, new_password })
      reset({ current_password: "", new_password: "", confirm: "" })
      await refreshUser()
      toast.success(hasPassword ? "Password changed." : "Password set. You can now log in with your email and password.")
    } catch (err) {
      if (!applyFieldErrors(err, setError, ["current_password", "new_password"])) toast.error(err.message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in &amp; security</CardTitle>
        <CardDescription>How you log in to this site.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="text-sm space-y-1">
          {viaGoogle && (
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" /> Google: {user.email}
            </li>
          )}
          <li className="flex items-center gap-2">
            {hasPassword ? (
              <><CheckCircle2 className="h-4 w-4 text-green-600" /> Password: set</>
            ) : (
              <><KeyRound className="h-4 w-4 text-muted-foreground" /> Password: not set</>
            )}
          </li>
        </ul>

        <div>
          <h3 className="text-sm font-medium mb-1">{hasPassword ? "Change password" : "Set a password"}</h3>
          {!hasPassword && (
            <p className="text-sm text-muted-foreground mb-3">
              You signed up with Google. Set a password to also log in with your email address. Google sign-in keeps
              working.
            </p>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-sm" noValidate>
            {hasPassword && (
              <PasswordField
                name="current_password"
                label="Current password"
                autoComplete="current-password"
                register={register}
                errors={errors}
              />
            )}
            <PasswordField name="new_password" label="New password" register={register} errors={errors} />
            <PasswordField name="confirm" label="Confirm new password" register={register} errors={errors} />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {hasPassword ? "Change password" : "Set password"}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AccountPage() {
  const { user } = useAuth()
  return (
    <div className="max-w-3xl mx-auto py-6 px-2 space-y-6">
      <h1 className="text-xl font-semibold">Account settings</h1>
      <ProfileCard />
      {/* key: remount with a fresh form/schema when "set" turns into "change" */}
      <PasswordCard key={user.profile?.has_password ? "change" : "set"} />
    </div>
  )
}

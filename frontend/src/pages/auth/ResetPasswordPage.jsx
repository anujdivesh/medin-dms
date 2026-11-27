import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import PasswordField from "@/components/auth/PasswordField"
import { confirmPasswordReset } from "@/lib/auth"
import { applyFieldErrors, matchConfirm, newPasswordFields } from "@/lib/passwordSchema"

const schema = matchConfirm(z.object(newPasswordFields))

/** Landing page for the emailed /reset-password?uid=...&token=... link. */
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const uid = params.get("uid")
  const token = params.get("token")
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState("")

  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { new_password: "", confirm: "" },
  })

  const onSubmit = async ({ new_password }) => {
    setFormError("")
    try {
      await confirmPasswordReset({ uid, token, new_password })
      setDone(true)
    } catch (err) {
      if (!applyFieldErrors(err, setError, ["new_password"])) {
        setFormError(err.message || "Couldn't set your password.")
      }
    }
  }

  const linkBroken = !uid || !token

  return (
    <div className="max-w-md mx-auto py-10 px-2">
      <Card>
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>After this you can log in with your email and this password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {done ? (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <p>Your password has been set.</p>
              <Button asChild>
                <Link to="/login">Log in</Link>
              </Button>
            </div>
          ) : linkBroken ? (
            <div className="space-y-3 text-sm">
              <p className="text-destructive">This link is incomplete. Please request a new one.</p>
              <Button asChild variant="outline">
                <Link to="/forgot-password">Request a new link</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <PasswordField name="new_password" label="New password" register={register} errors={errors} />
              <PasswordField name="confirm" label="Confirm new password" register={register} errors={errors} />
              {formError && (
                <p className="text-sm text-destructive" role="alert">
                  {formError}{" "}
                  <Link to="/forgot-password" className="underline">Request a new link</Link>
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Set password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

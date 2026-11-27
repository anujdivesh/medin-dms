import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestPasswordReset } from "@/lib/auth"

const schema = z.object({ email: z.string().trim().email("Enter a valid email") })

/** Request a reset link. Also how a Google-created account sets a first password. */
export default function ForgotPasswordPage() {
  const [params] = useSearchParams()
  const [sentTo, setSentTo] = useState("")
  const [formError, setFormError] = useState("")

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: params.get("email") || "" },
  })

  const onSubmit = async ({ email }) => {
    setFormError("")
    try {
      await requestPasswordReset(email)
      setSentTo(email)
    } catch (err) {
      setFormError(err.message || "Something went wrong. Please try again.")
    }
  }

  return (
    <div className="max-w-md mx-auto py-10 px-2">
      <Card>
        <CardHeader>
          <CardTitle>Reset or set your password</CardTitle>
          <CardDescription>
            Enter your account email and we'll send you a link to choose a password. This also works if you
            signed up with Google and want to log in with a password too.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {sentTo ? (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <MailCheck className="h-8 w-8 text-green-600" />
              <p>
                If an account exists for <span className="font-medium">{sentTo}</span>, a link to set a new password
                is on its way. It expires in 3 days.
              </p>
              <Button asChild variant="outline">
                <Link to="/login">Back to log in</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" {...register("email")} />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
              {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Send link
              </Button>
              <p className="text-sm text-center">
                <Link to="/login" className="text-primary underline-offset-4 hover:underline">Back to log in</Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

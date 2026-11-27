import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** Labelled password input wired to react-hook-form's register(). */
export default function PasswordField({ name, label, register, errors, autoComplete = "new-password" }) {
  const error = errors?.[name]
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} type="password" autoComplete={autoComplete} aria-invalid={Boolean(error)} {...register(name)} />
      {error && <p className="text-sm text-destructive">{error.message}</p>}
    </div>
  )
}

import { z } from "zod"

// Shared client-side rules for choosing a password (the backend's Django
// password validators have the final say).
export const newPasswordFields = {
  new_password: z.string().min(8, "At least 8 characters"),
  confirm: z.string(),
}

export const matchConfirm = (schema) =>
  schema.refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "Passwords don't match" })

// Copy DRF field errors ({field: [messages]}) onto a react-hook-form form.
// Returns false when none of them matched a known field.
export const applyFieldErrors = (err, setError, fields) => {
  let mapped = false
  for (const [field, messages] of Object.entries(err?.data || {})) {
    if (fields.includes(field)) {
      setError(field, { message: Array.isArray(messages) ? messages.join(" ") : String(messages) })
      mapped = true
    }
  }
  return mapped
}

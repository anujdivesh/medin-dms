// Only follow in-app `?next=` targets (no open redirects to other sites).
export const safeNext = (value, fallback = "/Home") => {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback
  return value
}

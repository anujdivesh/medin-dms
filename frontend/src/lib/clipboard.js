import { toast } from "sonner"

export const copyText = async (text, message = "Link copied.") => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(message)
  } catch {
    toast.error("Couldn't copy - select the link and copy it yourself.")
  }
}

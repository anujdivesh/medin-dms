import { Link, useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, LogIn, ShoppingCart, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/context/AuthContext"
import { useCart } from "@/context/CartContext"

const schema = z.object({
  purpose: z.string().trim().min(1, "Please give the purpose of your request"),
})

function CheckoutForm() {
  const { checkout, remove } = useCart()
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { purpose: "" },
  })

  const onSubmit = async (values) => {
    try {
      const request = await checkout(values)
      toast.success(`Request ${request.reference} submitted.`)
      navigate(`/my-requests/${request.id}`)
    } catch (err) {
      const unavailable = err.data?.unavailable
      if (unavailable?.length) {
        await Promise.all(unavailable.map((id) => remove(id)))
        toast.error("Some records are no longer available and were removed from your cart. Please review and submit again.")
      } else {
        toast.error(err.message || "Couldn't submit your request.")
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="purpose">
          Purpose of request <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="purpose"
          rows={5}
          required
          aria-invalid={Boolean(errors.purpose)}
          placeholder="Why do you need this data and how will it be used?"
          {...register("purpose")}
        />
        {errors.purpose && <p className="text-sm text-destructive">{errors.purpose.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Submit request
      </Button>
    </form>
  )
}

export default function CartPage() {
  const { status, user } = useAuth()
  const { items, count, loading, remove, clear } = useCart()

  return (
    <div className="max-w-5xl mx-auto py-6 px-2 grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Data request cart</CardTitle>
            <CardDescription>{count} record{count === 1 ? "" : "s"} selected</CardDescription>
          </div>
          {count > 0 && (
            <Button variant="ghost" size="sm" onClick={clear}>
              <Trash2 className="h-4 w-4" /> Empty cart
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading cart...
            </div>
          )}
          {!loading && count === 0 && (
            <div className="flex flex-col items-center text-center py-12 gap-3 text-muted-foreground">
              <ShoppingCart className="h-10 w-10" />
              <p>Your cart is empty. Find datasets in the catalogue and choose “Add to cart”.</p>
              <Button asChild variant="outline">
                <Link to="/Home">Browse the catalogue</Link>
              </Button>
            </div>
          )}
          {!loading && count > 0 && (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{item.title || `Record #${item.id}`}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                      {item.metadataType && <span>{item.metadataType}</span>}
                      {item.dataOwner && <span>Owner: {item.dataOwner}</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(item.id)} title="Remove" aria-label="Remove from cart">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Request access</CardTitle>
          <CardDescription>
            Each dataset's owner reviews your request and approves or declines it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "loading" && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          {status === "anonymous" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Log in or create an account to submit your request. Your cart will be kept.
              </p>
              <Button asChild className="w-full" disabled={count === 0}>
                <Link to="/login?next=/cart"><LogIn className="h-4 w-4" /> Log in to request</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/register?next=/cart"><UserPlus className="h-4 w-4" /> Create an account</Link>
              </Button>
            </div>
          )}
          {status === "authenticated" && (
            count > 0 ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Requesting as <span className="font-medium text-foreground">{user.email}</span>
                </p>
                <CheckoutForm />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Add records to your cart to request them. <Link to="/my-requests" className="text-primary hover:underline">View my requests</Link>
              </p>
            )
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import { Check, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/context/CartContext"

/** Toggle a metadata record in the data request cart. */
export default function AddToCartButton({ record, size = "sm", className = "" }) {
  const { has, add, remove } = useCart()
  const inCart = has(record.id)

  return (
    <Button
      variant={inCart ? "secondary" : "default"}
      size={size}
      className={`text-xs ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        if (inCart) remove(record.id)
        else add(record)
      }}
      title={inCart ? "Remove from data request cart" : "Add to data request cart"}
    >
      {inCart ? <Check className="h-3.5 w-3.5" /> : <ShoppingCart className="h-3.5 w-3.5" />}
      {inCart ? "In cart" : "Add to cart"}
    </Button>
  )
}

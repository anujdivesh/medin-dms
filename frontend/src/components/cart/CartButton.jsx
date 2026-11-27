import { Link } from "react-router-dom"
import { ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/context/CartContext"

/** Top-bar cart icon with item count. */
export default function CartButton() {
  const { count } = useCart()
  return (
    <Button asChild variant="ghost" size="icon" className="relative" title="Data request cart">
      <Link to="/cart" aria-label={`Data request cart, ${count} item${count === 1 ? "" : "s"}`}>
        <ShoppingCart className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-[1.1rem] text-center">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </Button>
  )
}

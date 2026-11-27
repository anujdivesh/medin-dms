import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { API_ENDPOINTS } from "@/config/apiEndpoints"
import { apiService } from "@/lib/apiClient"
import { useAuth } from "@/context/AuthContext"

const LOCAL_KEY = "dms-cart"
const { CART, DATA_REQUESTS } = API_ENDPOINTS

const readLocal = () => {
  try {
    const items = JSON.parse(localStorage.getItem(LOCAL_KEY))
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

const writeLocal = (items) => {
  try {
    if (items.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(items))
    else localStorage.removeItem(LOCAL_KEY)
  } catch {
    // Storage unavailable - the cart just won't survive a reload.
  }
}

const fromServer = (data) =>
  (data?.items || []).map(({ record }) => ({
    id: record.id,
    title: record.title,
    metadataType: record.metadata_type,
    dataOwner: record.data_owner,
  }))

const CartContext = createContext(null)

/**
 * One cart interface over two stores:
 *  - anonymous: localStorage ("dms-cart"), items as {id, title, metadataType}
 *  - logged in: the server cart (/api/cart)
 * On login the browser cart is merged into the server cart and removed from
 * localStorage; on logout the cart starts empty again.
 */
export function CartProvider({ children }) {
  const { status, user } = useAuth()
  const [items, setItems] = useState(readLocal)
  const [loading, setLoading] = useState(false)
  const isServer = status === "authenticated"
  const userId = user?.id

  // Switch stores whenever the login state changes.
  useEffect(() => {
    if (status === "loading") return
    if (status === "anonymous") {
      setItems(readLocal())
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const local = readLocal()
        let data
        if (local.length) {
          data = await apiService.post(CART.MERGE, { record_ids: local.map((i) => Number(i.id)) })
          writeLocal([])
          if (data.skipped?.length) {
            toast.warning(`${data.skipped.length} item(s) in your cart are no longer available and were removed.`)
          }
        } else {
          data = await apiService.get(CART.BASE)
        }
        if (!cancelled) setItems(fromServer(data))
      } catch {
        if (!cancelled) toast.error("Couldn't load your cart.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, userId])

  // Keep anonymous carts in sync across tabs.
  useEffect(() => {
    if (isServer) return
    const onStorage = (e) => {
      if (e.key === LOCAL_KEY) setItems(readLocal())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [isServer])

  const has = useCallback((id) => items.some((i) => Number(i.id) === Number(id)), [items])

  const add = useCallback(async ({ id, title, metadataType }) => {
    const recordId = Number(id)
    if (has(recordId)) return
    if (!isServer) {
      const next = [...readLocal().filter((i) => Number(i.id) !== recordId), { id: recordId, title, metadataType }]
      writeLocal(next)
      setItems(next)
      toast.success("Added to your data request cart.")
      return
    }
    try {
      setItems(fromServer(await apiService.post(CART.BASE, { record_id: recordId })))
      toast.success("Added to your data request cart.")
    } catch (err) {
      toast.error(err.message || "Couldn't add this record.")
    }
  }, [has, isServer])

  const remove = useCallback(async (id) => {
    const recordId = Number(id)
    if (!isServer) {
      const next = readLocal().filter((i) => Number(i.id) !== recordId)
      writeLocal(next)
      setItems(next)
      return
    }
    try {
      setItems(fromServer(await apiService.delete(CART.ITEM(recordId))))
    } catch (err) {
      toast.error(err.message || "Couldn't remove this record.")
    }
  }, [isServer])

  const clear = useCallback(async () => {
    if (!isServer) {
      writeLocal([])
      setItems([])
      return
    }
    try {
      setItems(fromServer(await apiService.delete(CART.BASE)))
    } catch (err) {
      toast.error(err.message || "Couldn't empty the cart.")
    }
  }, [isServer])

  // Submit the server cart as a data request. Throws ApiError on failure
  // (err.data.unavailable lists record ids that can't be requested).
  const checkout = useCallback(async ({ purpose }) => {
    if (!isServer) throw new Error("Log in to submit a request.")
    const request = await apiService.post(DATA_REQUESTS.BASE, { purpose })
    setItems([])
    return request
  }, [isServer])

  const value = useMemo(() => ({
    items,
    count: items.length,
    loading,
    has,
    add,
    remove,
    clear,
    checkout,
  }), [items, loading, has, add, remove, clear, checkout])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>")
  return ctx
}

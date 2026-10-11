'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'

import { sameItem, type BagProduct, type CartItem } from '@/lib/cart'
import type { Locale } from '@/lib/locales'
import { classifyOrigin, ORIGIN_KEY } from '@/lib/origin'

type Drawer = 'bag' | 'menu' | null
type Metal = 'silver' | 'gold'

type Store = {
  locale: Locale
  cart: CartItem[]
  /** Product details for the items in the bag, in the current language (filled in as they load). */
  products: Record<number, BagProduct>
  add(item: Omit<CartItem, 'qty'>, opts?: { open?: boolean }): void
  setQty(index: number, qty: number): void
  remove(index: number): void
  clear(): void
  metal: Metal
  setMetal(m: Metal): void
  drawer: Drawer
  openDrawer(d: Exclude<Drawer, null>): void
  closeDrawer(): void
  toast: { text: string; key: number; visible: boolean }
  bump: number
  /** False until the bag has been read from the browser. */
  ready: boolean
}

const StoreContext = createContext<Store | null>(null)

export const useStore = () => {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside <StoreProvider>')
  return store
}

/* ---------- the bag and the silver/gold choice live in the visitor's browser ---------- */

// In-memory copy for browsers that block localStorage (some private modes): the bag then lasts until reload.
const memory: Record<string, string> = {}
const listeners = new Set<() => void>()

const readRaw = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? memory[key] ?? fallback
  } catch {
    return memory[key] ?? fallback
  }
}
const writeRaw = (key: string, value: string) => {
  memory[key] = value
  try {
    localStorage.setItem(key, value)
  } catch {
    // kept in memory only
  }
  listeners.forEach((l) => l())
}
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  window.addEventListener('storage', cb) // other tabs
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}

const parseCart = (raw: string): CartItem[] => {
  try {
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((i) => typeof i?.id === 'number' && i.qty > 0) : []
  } catch {
    return []
  }
}

export function StoreProvider({ locale, addedText, children }: { locale: Locale; addedText: string; children: ReactNode }) {
  const cartRaw = useSyncExternalStore(subscribe, () => readRaw('bl-cart', '[]'), () => '[]')
  const cart = useMemo(() => parseCart(cartRaw), [cartRaw])
  const metal: Metal = useSyncExternalStore(subscribe, () => readRaw('bl-metal', '"silver"'), () => '"silver"') === '"gold"' ? 'gold' : 'silver'
  const ready = useSyncExternalStore(subscribe, () => true, () => false)

  const [products, setProducts] = useState<Record<string, BagProduct>>({})
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [toast, setToast] = useState<Store['toast']>({ text: '', key: 0, visible: false })
  const [bump, setBump] = useState(0)

  const save = useCallback((next: CartItem[]) => writeRaw('bl-cart', JSON.stringify(next)), [])

  // The canvas previews read the finish from <body data-metal> and redraw on `bl:metal`.
  useEffect(() => {
    document.body.dataset.metal = metal
    document.dispatchEvent(new CustomEvent('bl:metal', { detail: metal }))
  }, [metal])

  // Note where this visit came from, once per tab, for the order's Origin (see lib/origin.ts).
  useEffect(() => {
    try {
      if (!sessionStorage.getItem(ORIGIN_KEY)) {
        sessionStorage.setItem(ORIGIN_KEY, JSON.stringify(classifyOrigin(location.href, document.referrer, location.hostname)))
      }
    } catch {
      // storage blocked: the order's origin shows as unknown
    }
  }, [])

  // Fetch names, photos and prices for anything in the bag we don't know yet (in this language).
  const missing = useMemo(() => [...new Set(cart.map((i) => i.id))].filter((id) => !products[`${locale}:${id}`]), [cart, products, locale])
  useEffect(() => {
    if (!missing.length) return
    let cancelled = false
    fetch(`/bag-items?locale=${locale}&ids=${missing.join(',')}`)
      .then((r) => (r.ok ? (r.json() as Promise<BagProduct[]>) : []))
      .then((list) => {
        if (cancelled) return
        setProducts((prev) => {
          const next = { ...prev }
          for (const p of list) next[`${locale}:${p.id}`] = p
          return next
        })
        // Products that no longer exist (deleted or unpublished) drop out of the bag.
        const found = new Set(list.map((p) => p.id))
        const gone = missing.filter((id) => !found.has(id))
        if (gone.length) save(parseCart(readRaw('bl-cart', '[]')).filter((i) => !gone.includes(i.id)))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [missing, locale, save])

  const byId = useMemo(() => {
    const out: Record<number, BagProduct> = {}
    for (const [key, p] of Object.entries(products)) if (key.startsWith(`${locale}:`)) out[p.id] = p
    return out
  }, [products, locale])

  // Stable, so the drawer's focus handling doesn't re-run on every render.
  const closeDrawer = useCallback(() => setDrawer(null), [])
  useEffect(() => {
    if (!toast.visible) return
    const timer = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  const value: Store = {
    locale,
    cart,
    products: byId,
    add(item, { open = false } = {}) {
      const current = parseCart(readRaw('bl-cart', '[]'))
      const same = current.find((x) => sameItem(x, { ...item, qty: 0 }))
      save(same ? current.map((x) => (x === same ? { ...x, qty: x.qty + 1 } : x)) : [...current, { ...item, qty: 1 }])
      setBump((n) => n + 1)
      setToast({ text: addedText, key: Date.now(), visible: true })
      if (open) setDrawer('bag')
    },
    setQty(index, qty) {
      save(qty < 1 ? cart.filter((_, i) => i !== index) : cart.map((x, i) => (i === index ? { ...x, qty } : x)))
    },
    remove(index) {
      save(cart.filter((_, i) => i !== index))
    },
    clear() {
      save([])
    },
    metal,
    setMetal(m) {
      writeRaw('bl-metal', JSON.stringify(m))
    },
    drawer,
    openDrawer: setDrawer,
    closeDrawer,
    toast,
    bump,
    ready,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

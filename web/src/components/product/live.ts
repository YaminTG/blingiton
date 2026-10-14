'use client'

// The piece builder tells the rest of the product page what the customer has picked so far: the
// gallery shows the photo for the chosen design/colour and the headline price follows the choices.

import { useEffect, useState } from 'react'

import type { Photo } from '@/lib/choices'

export type Pick = { price: number; photo: Photo | null }

const EVENT = 'bl:pick'
let last: Pick | null = null

export function announcePick(pick: Pick) {
  if (last && last.price === pick.price && last.photo?.large === pick.photo?.large) return
  last = pick
  window.dispatchEvent(new CustomEvent<Pick>(EVENT, { detail: pick }))
}

/** The latest pick, or null until the builder has said anything. */
export function usePick() {
  const [pick, setPick] = useState<Pick | null>(null)
  useEffect(() => {
    const on = (e: Event) => setPick((e as CustomEvent<Pick>).detail)
    window.addEventListener(EVENT, on)
    return () => {
      window.removeEventListener(EVENT, on)
      last = null
    }
  }, [])
  return pick
}

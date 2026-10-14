'use client'

import { Price } from '@/components/store/Money'

import { usePick } from './live'

/** The headline price: "From …" until the customer's choices settle it, then the price of what they picked. */
export function LivePrice({ base, from, fromLabel }: { base: number; from: number | null; fromLabel: string }) {
  const pick = usePick()
  if (pick) return <Price jod={pick.price} />
  return (
    <>
      {from !== null ? <span className="from">{fromLabel} </span> : null}
      <Price jod={from ?? base} />
    </>
  )
}

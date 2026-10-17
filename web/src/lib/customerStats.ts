// Customers (collection `customers`): who bought, worked out from their orders. Pure functions, no
// server imports, so unit tests and the admin's reports share them.
//
// - An order belongs to a customer by email, or by phone when there is no email (orders typed in
//   from Instagram/WhatsApp often have none). See `normalEmail` / `normalPhone`.
// - A purchase is an order that's processing, on hold or completed. Pending, cancelled, refunded
//   and failed orders aren't counted.
// - A *verified* purchase is a completed order: delivered and paid. Browsing is only ever recorded
//   for customers with one (src/lib/activity.ts), and only if they agreed at checkout.

import { l } from '@/fields/label'

export const PURCHASE_STATUSES = ['processing', 'on-hold', 'completed'] as const
export const VERIFIED_STATUS = 'completed'

export const SEGMENTS = ['none', 'one-time', 'returning', 'loyal'] as const
export type Segment = (typeof SEGMENTS)[number]

export const SEGMENT_LABELS: Record<Segment, { en: string; ar: string }> = {
  none: l('No purchase yet', 'لا مشتريات بعد'),
  'one-time': l('One-time', 'مرة واحدة'),
  returning: l('Returning (2 orders)', 'عائد (طلبان)'),
  loyal: l('Loyal (3+ orders)', 'دائم (3+ طلبات)'),
}

export const normalEmail = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '')

/**
 * Digits only, with the country code: `00962 7…`, `+962 7…` and a Jordanian mobile written locally
 * (`07…`) all become `9627…`, so the same number typed two ways matches. Under 8 digits: no key.
 */
export function normalPhone(v: unknown): string {
  let d = typeof v === 'string' ? v.replace(/\D/g, '') : ''
  if (d.startsWith('00')) d = d.slice(2)
  if (/^07\d{8}$/.test(d)) d = `962${d.slice(1)}`
  return d.length >= 8 ? d : ''
}

/** 1 purchase: one-time. 2: returning. 3 or more: loyal. */
export function segmentOf(purchases: number): Segment {
  if (purchases >= 3) return 'loyal'
  if (purchases === 2) return 'returning'
  if (purchases === 1) return 'one-time'
  return 'none'
}

export type OrderLite = {
  status: string
  total?: number | null
  createdAt: string
  country?: string | null
}

export type CustomerSummary = {
  orderCount: number
  verifiedOrders: number
  totalSpent: number
  averageOrder: number
  firstOrderAt: string | null
  lastOrderAt: string | null
  firstVerifiedAt: string | null
  /** Average days between purchases; null with fewer than two. */
  daysBetween: number | null
  segment: Segment
  /** From the most recent order that names one. */
  country: string | null
}

export const isPurchase = (status: string) => (PURCHASE_STATUSES as readonly string[]).includes(status)

export function summarize(orders: OrderLite[]): CustomerSummary {
  const sorted = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const bought = sorted.filter((o) => isPurchase(o.status))
  const verified = sorted.filter((o) => o.status === VERIFIED_STATUS)
  const totalSpent = bought.reduce((s, o) => s + (o.total ?? 0), 0)
  const first = bought[0]?.createdAt ?? null
  const last = bought.at(-1)?.createdAt ?? null
  const span = first && last ? (Date.parse(last) - Date.parse(first)) / 86400_000 : 0
  return {
    orderCount: bought.length,
    verifiedOrders: verified.length,
    totalSpent,
    averageOrder: bought.length ? Math.round((totalSpent / bought.length) * 100) / 100 : 0,
    firstOrderAt: first,
    lastOrderAt: last,
    firstVerifiedAt: verified[0]?.createdAt ?? null,
    daysBetween: bought.length > 1 ? Math.round(span / (bought.length - 1)) : null,
    segment: segmentOf(bought.length),
    country: [...sorted].reverse().find((o) => o.country)?.country ?? null,
  }
}

/** The key with the largest count; ties go to the first one seen. */
export function topKey<K>(counts: Map<K, number>): K | null {
  let best: K | null = null
  let n = 0
  for (const [k, v] of counts) if (v > n) [best, n] = [k, v]
  return best
}

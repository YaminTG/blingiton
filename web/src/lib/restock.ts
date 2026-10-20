// Back-in-stock requests: what a shopper is waiting for, and when it's genuinely back. Pure: no
// database or server imports, so the rules are unit-tested (tests/unit/restock.spec.ts). The server
// side (saving requests, emailing) is src/lib/restockNotify.ts.
//
// A request is for a product, or for one combination of its choices when that combination has its
// own stock count (Products → Personalization → Combinations). The server works out which from the
// shopper's answers with the same rules as the product page and checkout (src/lib/choices.ts), so a
// request always points at the stock that's actually empty.

import { resolve, stepsFor, type Answers, type Question, type Variant } from './choices'

export const REQUEST_STATUSES = ['waiting', 'notified', 'cancelled'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

/** What the rules need from a product. */
export type StockFacts = {
  published: boolean
  availability: 'in_stock' | 'made_to_order' | 'sold_out'
  stock: number | null
  /** One-off pieces are gone for good once sold, so nobody waits for them. */
  oneOff: boolean
  price: number
  questions: Question[]
  variants: Variant[]
}

/** The product itself can be ordered: live, not sold out, and pieces left when it counts them. */
export const productAvailable = (p: StockFacts) =>
  p.published && p.price > 0 && p.availability !== 'sold_out' && !(p.availability === 'in_stock' && typeof p.stock === 'number' && p.stock <= 0)

/**
 * Whether what a request waits for can be ordered again. For a combination: the product, and that
 * combination's own count. A combination row the shop has since deleted no longer limits anything.
 */
export function isBack(p: StockFacts, variantId: string | null) {
  if (!productAvailable(p)) return false
  if (!variantId) return true
  const v = p.variants.find((x) => x.id === variantId)
  return !v || v.stock === null || v.stock > 0
}

export type Target =
  | { kind: 'product' }
  | { kind: 'variant'; variantId: string; answers: Answers }
  /** Nothing to wait for: it can be ordered right now. */
  | { kind: 'available' }
  /** A one-off piece, or one that isn't on sale: there's nothing to wait for. */
  | { kind: 'not-offered' }

/** What a shopper on this product, with these answers, would be waiting for. */
export function targetFor(p: StockFacts, raw: Answers): Target {
  if (p.oneOff || !p.published) return { kind: 'not-offered' }
  // The combination they picked has its own empty count: wait for that (and the product) to be back.
  const r = resolve(p.price, p.questions, p.variants, raw)
  if (r.stockVariant && (r.stockVariant.stock ?? 0) <= 0) return { kind: 'variant', variantId: r.stockVariant.id, answers: r.answers }
  return productAvailable(p) ? { kind: 'available' } : { kind: 'product' }
}

/** "Design: Pink · Finish: Gold", from the answers, in the language the questions are in. */
export function describeChoices(questions: Question[], raw: Answers) {
  const { steps, answers } = stepsFor(questions, raw)
  return steps
    .filter((s) => answers[s.id])
    .map((s) => `${s.name}: ${s.choices.find((c) => c.id === answers[s.id])?.label ?? ''}`)
    .join(' · ')
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** A request from the product page, checked. null when anything is off. */
export function parseRequest(raw: unknown): { product: number; email: string; answers: Answers; locale: 'en' | 'ar' } | null {
  const b = (raw ?? {}) as Record<string, unknown>
  const product = Number(b.product)
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase().slice(0, 200) : ''
  if (!Number.isInteger(product) || product <= 0 || !EMAIL.test(email)) return null
  // A bot filled the hidden field.
  if (typeof b.website === 'string' && b.website.trim()) return null
  const answers: Answers = {}
  if (b.choices && typeof b.choices === 'object') {
    for (const [k, v] of Object.entries(b.choices as Record<string, unknown>).slice(0, 20)) if (typeof v === 'string') answers[k.slice(0, 64)] = v.slice(0, 64)
  }
  return { product, email, answers, locale: b.locale === 'ar' ? 'ar' : 'en' }
}

/** Requests that are the same wish: same product, same combination, same email. */
export const requestKey = (r: { product: number; variant?: string | null; email: string }) => `${r.product}|${r.variant ?? ''}|${r.email.toLowerCase()}`

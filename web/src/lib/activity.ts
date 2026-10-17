// Browsing of recognised customers (collection `customer-activity`), for the customer insights.
// Unlike the anonymous shop funnel (lib/events.ts), these rows belong to a person, so they are only
// recorded when all of these hold (checked by /activity on every request):
//   1. the customer ticked "remember this device" at checkout (consent, stored on the customer),
//   2. this browser carries the signed device cookie issued with that order (lib/customerToken.ts),
//   3. the customer has at least one completed (verified) order,
//   4. they haven't withdrawn since (on /[locale]/your-data, or staff did it for them).
// Everyone else's browsing is never sent. No server imports here: the browser uses this file too.

export const ACTIVITY_TYPES = ['view', 'choice', 'add', 'time'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

/** httpOnly, signed: who this device belongs to. */
export const DEVICE_COOKIE = 'bl-cust'
/** Readable flag ("1") so the browser knows to send anything at all; it proves nothing. */
export const FLAG_COOKIE = 'bl-me'
export const DEVICE_COOKIE_DAYS = 365

/** Bumped when the checkout wording changes, so each consent records which text it agreed to. */
export const CONSENT_VERSION = 'checkout-2026-10'

/** Active seconds on one product page are capped, so a tab left open doesn't count as interest. */
export const MAX_SECONDS = 30 * 60
/** Raw rows older than this are deleted by the nightly `prune-activity` job. */
export const RETENTION_DAYS = 365

export type ActivityEvent = {
  type: ActivityType
  product: number
  /**
   * `choice`: what was picked, as `q:<question id>=<choice id>`, `chain=45`, `stone=3`,
   * `finish=gold`, `font=script`. `add`: the same pairs joined by `,`.
   */
  detail?: string
  /** `time`: active seconds since the last report for this page view. */
  seconds?: number
}

const DETAIL = /^[A-Za-z0-9:=,_ -]{1,300}$/

/** A batch from the browser: up to 20 well-formed events; anything else is dropped. */
export function parseActivity(raw: unknown): ActivityEvent[] {
  const list = Array.isArray((raw as { events?: unknown } | null)?.events) ? (raw as { events: unknown[] }).events : []
  const out: ActivityEvent[] = []
  for (const r of list.slice(0, 20)) {
    const b = (r ?? {}) as Record<string, unknown>
    if (!ACTIVITY_TYPES.includes(b.type as ActivityType)) continue
    const product = Number(b.product)
    if (!Number.isInteger(product) || product <= 0) continue
    const e: ActivityEvent = { type: b.type as ActivityType, product }
    if (typeof b.detail === 'string' && DETAIL.test(b.detail)) e.detail = b.detail
    if (e.type === 'choice' && !e.detail) continue
    if (e.type === 'time') {
      const s = Math.round(Number(b.seconds))
      if (!Number.isFinite(s) || s < 1) continue
      e.seconds = Math.min(s, MAX_SECONDS)
    }
    out.push(e)
  }
  return out
}

/** One picked option as a `detail` pair; `q` for the product's own questions. */
export const choiceDetail = (key: string, value: string | number) => `${key}=${value}`.replace(/[^A-Za-z0-9:=_ -]/g, '').slice(0, 120)

/**
 * What a bag line was set to, for an `add` row. The engraved name is never included: it's often
 * someone else's name, and the order already holds it.
 */
export function bagDetail(item: { choices?: Record<string, string>; chain?: number; stone?: number | null; finish?: string; style?: string }) {
  const pairs = Object.entries(item.choices ?? {}).map(([q, c]) => choiceDetail(`q:${q}`, c))
  if (item.chain) pairs.push(choiceDetail('chain', item.chain))
  if (item.stone !== undefined) pairs.push(choiceDetail('stone', item.stone ?? 'none'))
  if (item.finish) pairs.push(choiceDetail('finish', item.finish))
  if (item.style) pairs.push(choiceDetail('font', item.style))
  return pairs.join(',').slice(0, 300) || undefined
}

/** `q:<id>=<id>,chain=45` → [['q:<id>', '<id>'], ['chain', '45']] */
export const readDetail = (detail: string | null | undefined): [string, string][] =>
  (detail ?? '')
    .split(',')
    .map((p) => p.split('=') as [string, string])
    .filter((p) => p.length === 2 && p[0] && p[1])

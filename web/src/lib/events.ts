// Shop funnel events (visit → product view → name typed → add to bag → checkout), stored in our own
// database by /track and summed up on the admin home. No cookies and no personal data: a visit is a
// random id kept in sessionStorage for that tab, plus where the visit came from (lib/origin.ts).
// No server imports here: the browser uses this file too.

import type { OriginType } from './origin'

// The gift finder adds its own steps: started, saw its picks (the path keeps the answers), clicked a pick.
export const EVENT_TYPES = ['visit', 'view', 'personalize', 'add', 'checkout', 'whatsapp', 'finder', 'finder-done', 'finder-click'] as const
export type EventType = (typeof EVENT_TYPES)[number]

/** Crawlers, link previews and audit tools: not shoppers. Also used by the proxy for the currency cookie. */
export const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless/i

/** Assistants whose visitors are counted as their own group in the report. Names match lib/origin.ts. */
export const AI_SOURCES = ['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Copilot']

export type TrackedEvent = {
  type: EventType
  session: string
  product?: number
  sourceType?: Exclude<OriginType, 'admin'> | 'unknown'
  source?: string
  locale: 'en' | 'ar'
  path?: string
}

const SOURCE_TYPES = ['direct', 'organic', 'referral', 'utm']

/** Accepts only the shape above; returns null for anything else. */
export function parseEvent(raw: unknown): TrackedEvent | null {
  const b = (raw ?? {}) as Record<string, unknown>
  if (!EVENT_TYPES.includes(b.type as EventType)) return null
  if (typeof b.session !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(b.session)) return null
  const product = b.product === undefined || b.product === null ? undefined : Number(b.product)
  if (product !== undefined && !(Number.isInteger(product) && product > 0)) return null
  const str = (x: unknown, n: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, n) : undefined)
  return {
    type: b.type as EventType,
    session: b.session,
    product,
    sourceType: SOURCE_TYPES.includes(b.sourceType as string) ? (b.sourceType as TrackedEvent['sourceType']) : 'unknown',
    source: str(b.source, 100),
    locale: b.locale === 'ar' ? 'ar' : 'en',
    path: str(b.path, 300),
  }
}

import { createHash } from 'crypto'
import type { Payload } from 'payload'

import type { Signal } from './healthRules'
import { serverUrl } from './site'

/**
 * Records something that went wrong for a shopper or the server (collection `health-signals`), for
 * the shop-health check (src/lib/health.ts) to weigh. Never throws: a failure to record must not
 * become a second failure for the customer.
 *
 * The same kind, person and page are recorded at most once a minute, and at most 300 signals an
 * hour, so an attack or a crash loop can't fill the table. In memory, so per server instance.
 */

const QUIET_MS = 60_000
const MAX_PER_HOUR = 300
const recent = new Map<string, number>()
let hour = { start: 0, n: 0 }

function allow(key: string) {
  const now = Date.now()
  if (now - (recent.get(key) ?? 0) < QUIET_MS) return false
  if (now - hour.start > 3600_000) hour = { start: now, n: 0 }
  if (hour.n >= MAX_PER_HOUR) return false
  hour.n++
  if (recent.size > 2000) recent.clear()
  recent.set(key, now)
  return true
}

/** Tells different visitors apart for a day without storing their IP. */
export function sourceOf(ip: string | null | undefined) {
  if (!ip || ip === 'unknown') return null
  return createHash('sha256')
    .update(`${ip}|${new Date().toISOString().slice(0, 10)}|${process.env.PAYLOAD_SECRET ?? ''}`)
    .digest('hex')
    .slice(0, 12)
}

/** The visitor's IP from the usual proxy headers. */
export const ipOf = (headers: Headers) => headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || null

/**
 * Where a visitor came from, kept short and without anything personal: the path for a page on this
 * site (`/en/shop`), otherwise just the other site's name (`instagram.com`).
 */
export function referrerOf(ref: string | null | undefined): string | null {
  if (!ref) return null
  try {
    const url = new URL(ref)
    if (url.host === new URL(serverUrl).host) return url.pathname
    return url.hostname.replace(/^(www|m|l|lm)\./, '')
  } catch {
    return null
  }
}

const cut = (v: string | null | undefined, max: number) => (v ? v.slice(0, max) : null)

export async function recordSignal(payload: Payload, signal: Omit<Signal, 'at'>) {
  if (!allow(`${signal.kind}|${signal.source ?? ''}|${signal.path ?? ''}|${signal.product ?? ''}`)) return
  try {
    await payload.create({
      collection: 'health-signals',
      data: {
        kind: signal.kind,
        source: cut(signal.source, 40),
        product: signal.product ?? null,
        path: cut(signal.path, 300),
        referrer: cut(signal.referrer, 300),
        detail: cut(signal.detail, 300),
      },
      overrideAccess: true,
      depth: 0,
    })
  } catch (err) {
    payload.logger.error({ err, signal }, 'Could not record a shop-health signal')
  }
}

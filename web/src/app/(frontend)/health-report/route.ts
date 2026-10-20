import config from '@payload-config'
import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { BOTS } from '@/lib/events'
import { mediaPath } from '@/lib/healthReport'
import { ipOf, recordSignal, referrerOf, sourceOf } from '@/lib/healthSignal'
import { serverUrl } from '@/lib/site'

// Reports from shoppers' browsers (src/lib/healthReport.ts) for the shop-health check: missing pages,
// photos that didn't load, checkouts that couldn't reach the server. Bots are skipped, and so are
// missing pages seen by signed-in staff (drafts and previews). In-memory rate limit per server instance.
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 30
const recent = new Map<string, number[]>()

function tooMany(ip: string) {
  const now = Date.now()
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  hits.push(now)
  recent.set(ip, hits)
  if (recent.size > 5000) recent.clear()
  return hits.length > MAX_PER_WINDOW
}

const done = () => new Response(null, { status: 204, headers: { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' } })

/** A site path (no query, no other site), or null. */
const pathOf = (v: unknown) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v.split(/[?#]/)[0].slice(0, 300) : null)
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export async function POST(request: NextRequest) {
  if (BOTS.test(request.headers.get('user-agent') ?? '')) return done()
  const ip = ipOf(request.headers)
  if (tooMany(ip ?? 'unknown')) return done()

  let b: Record<string, unknown>
  try {
    b = JSON.parse(await request.text()) ?? {}
  } catch {
    return done()
  }
  const path = pathOf(b.path)
  const source = sourceOf(ip)
  const payload = await getPayload({ config })

  if (b.type === 'not-found' && path && !request.cookies.has('payload-token')) {
    await recordSignal(payload, { kind: 'not-found', path, referrer: referrerOf(text(b.referrer, 500)), source })
  } else if (b.type === 'image') {
    const src = mediaPath(text(b.src, 2000), serverUrl)
    if (src) await recordSignal(payload, { kind: 'image-error', path, detail: src, source })
  } else if (b.type === 'checkout') {
    await recordSignal(payload, { kind: 'checkout-failed', path, detail: text(b.detail, 100), source })
  }
  return done()
}

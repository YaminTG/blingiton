import config from '@payload-config'
import type { NextRequest } from 'next/server'
import { getPayload, type Payload } from 'payload'

import { recordSignal, sourceOf } from '@/lib/healthSignal'
import { validTrackToken } from '@/lib/orderTrack'
import { startPayment } from '@/lib/payments'

// Each call opens a HyperPay checkout, so a visitor gets a handful per window (retries after a
// declined card included). In-memory, per server instance, like /place-order's.
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 10
const recent = new Map<string, number[]>()

function tooMany(ip: string) {
  const now = Date.now()
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  hits.push(now)
  recent.set(ip, hits)
  if (recent.size > 5000) recent.clear()
  return hits.length > MAX_PER_WINDOW
}

const headers = { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' }

/** The card form for an order waiting to be paid: `{ o, t }` (order id and its signed token) → a HyperPay checkout. */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  if (tooMany(ip)) return Response.json({ error: 'busy' }, { status: 429, headers })

  const body = (await request.json().catch(() => null)) as { o?: unknown; t?: unknown } | null
  const id = Number(body?.o)
  if (!validTrackToken(id, body?.t)) return Response.json({ error: 'invalid' }, { status: 400, headers })

  let payload: Payload | null = null
  try {
    payload = await getPayload({ config })
    return Response.json(await startPayment(payload, id), { headers })
  } catch (err) {
    // Customers can't pay at all while this fails: it counts as a checkout error for shop health.
    console.error('[payment/start]', err)
    if (payload) await recordSignal(payload, { kind: 'checkout-error', source: sourceOf(ip), path: `order:${id}`, detail: err instanceof Error ? err.message : String(err) })
    return Response.json({ error: 'server' }, { status: 502, headers })
  }
}

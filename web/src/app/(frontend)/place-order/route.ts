import config from '@payload-config'
import { NextResponse, type NextRequest } from 'next/server'
import { getPayload, type Payload } from 'payload'

import { later } from '@/hooks/revalidate'
import { deviceCookies, rememberDevice } from '@/lib/customers'
import { recordSignal, sourceOf } from '@/lib/healthSignal'
import { OrderError, placeOrder } from '@/lib/orders'

// A few orders per visitor in a short window is plenty; this keeps scripts from filling the order
// list or using the confirmation email to spam someone. In-memory, so per server instance: a speed
// bump, not a wall.
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 5
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

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  if (tooMany(ip)) return Response.json({ error: 'busy' }, { status: 429, headers })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid' }, { status: 400, headers })
  }

  let payload: Payload | null = null
  try {
    payload = await getPayload({ config })
    const { customer, locale, ...order } = await placeOrder(payload, body)
    const res = NextResponse.json(order, { headers })
    // "Remember me on this device" (unticked by default): records the consent on the customer and
    // gives this browser the signed device cookie. Browsing is only recorded once an order is
    // completed (src/lib/activity.ts). Failing here never fails the order.
    if ((body as { remember?: unknown }).remember === true && customer) {
      try {
        for (const c of deviceCookies(await rememberDevice(payload!, customer, locale))) res.cookies.set(c)
      } catch (err) {
        console.error('[place-order] remember', err)
      }
    }
    return res
  } catch (err) {
    // Refusals and crashes both feed the shop-health check (src/lib/health.ts).
    // Without a database there's nowhere to record it; the browser reports it instead.
    const source = sourceOf(ip)
    const p = payload
    if (err instanceof OrderError) {
      if (p) later(() => recordSignal(p, { kind: 'checkout-rejected', source, detail: err.code, product: err.product ?? null }))
      return Response.json({ error: err.code }, { status: err.code === 'gone' ? 409 : 400, headers })
    }
    console.error('[place-order]', err)
    if (p) await recordSignal(p, { kind: 'checkout-error', source, detail: err instanceof Error ? err.message : String(err) })
    return Response.json({ error: 'server' }, { status: 500, headers })
  }
}

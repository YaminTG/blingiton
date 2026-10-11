import config from '@payload-config'
import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'

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

  try {
    const order = await placeOrder(await getPayload({ config }), body)
    return Response.json(order, { headers })
  } catch (err) {
    if (err instanceof OrderError) return Response.json({ error: err.code }, { status: err.code === 'gone' ? 409 : 400, headers })
    console.error('[place-order]', err)
    return Response.json({ error: 'server' }, { status: 500, headers })
  }
}

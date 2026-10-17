import config from '@payload-config'
import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { DEVICE_COOKIE, parseActivity, type ActivityEvent } from '@/lib/activity'
import { readDeviceToken } from '@/lib/customerToken'
import { clearedCookies, trackingState } from '@/lib/customers'
import { BOTS } from '@/lib/events'

// Browsing of recognised customers (src/lib/customerTrack.ts). Stored only for a valid device
// cookie whose customer still consents and has a completed order (src/lib/activity.ts). A cookie
// that no longer counts (withdrawn, customer deleted, forged) is cleared, so the browser stops.
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 120
const recent = new Map<string, number[]>()

function tooMany(key: string) {
  const now = Date.now()
  const hits = (recent.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  hits.push(now)
  recent.set(key, hits)
  if (recent.size > 5000) recent.clear()
  return hits.length > MAX_PER_WINDOW
}

const headers = { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' }
const done = () => new NextResponse(null, { status: 204, headers })
const forget = () => {
  const res = done()
  for (const c of clearedCookies()) res.cookies.set(c)
  return res
}

export async function POST(request: NextRequest) {
  if (BOTS.test(request.headers.get('user-agent') ?? '') || request.cookies.has('payload-token')) return done()
  const token = readDeviceToken(request.cookies.get(DEVICE_COOKIE)?.value)
  if (!token) return forget()
  if (tooMany(`${token.customer}.${token.device}`)) return done()

  let events: ActivityEvent[]
  try {
    events = parseActivity(JSON.parse(await request.text()))
  } catch {
    events = []
  }
  if (!events.length) return done()

  try {
    const payload = await getPayload({ config })
    const customer = await payload.findByID({ collection: 'customers', id: token.customer, depth: 0, disableErrors: true, select: { tracking: true, verifiedOrders: true } })
    if (!customer || (customer.tracking?.epoch ?? 0) !== token.epoch || trackingState(customer) === 'off') return forget()
    // Agreed, but no completed order yet: nothing is recorded until there is one.
    if (trackingState(customer) !== 'on') return done()
    for (const e of events) {
      await payload.create({ collection: 'customer-activity', data: { customer: customer.id, device: token.device, ...e }, depth: 0 })
    }
  } catch (err) {
    console.error('[activity]', err)
  }
  return done()
}

import config from '@payload-config'
import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { BOTS, parseEvent } from '@/lib/events'

// Shop funnel steps from the browser (src/lib/track.ts). Bots and the shop's own staff (signed in to
// the admin) aren't counted. In-memory rate limit per server instance, to keep a script from
// flooding the table.
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 300
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

export async function POST(request: NextRequest) {
  if (BOTS.test(request.headers.get('user-agent') ?? '') || request.cookies.has('payload-token')) return done()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  if (tooMany(ip)) return done()

  let event
  try {
    event = parseEvent(JSON.parse(await request.text()))
  } catch {
    event = null
  }
  if (!event) return done()

  try {
    await (await getPayload({ config })).create({ collection: 'events', data: event, overrideAccess: true, depth: 0 })
  } catch (err) {
    console.error('[track]', err)
  }
  return done()
}

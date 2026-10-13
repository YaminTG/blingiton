import config from '@payload-config'
import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { ReviewError, submitReviews } from '@/lib/reviews'

// The signed link already limits who can review; this only slows down someone hammering the form.
// In-memory, so per server instance.
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
// 'done' (already saved, e.g. sent twice) is answered as a success below.
const status = { invalid: 400, link: 403, 'not-ready': 409, done: 200 } as const

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
    const saved = await submitReviews(await getPayload({ config }), body)
    return Response.json({ saved }, { headers })
  } catch (err) {
    // Already saved (e.g. the form was sent twice): nothing new, but nothing wrong either.
    if (err instanceof ReviewError && err.code === 'done') return Response.json({ saved: 0 }, { headers })
    if (err instanceof ReviewError) return Response.json({ error: err.code }, { status: status[err.code], headers })
    console.error('[submit-review]', err)
    return Response.json({ error: 'server' }, { status: 500, headers })
  }
}

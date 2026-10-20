import config from '@payload-config'
import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { BOTS } from '@/lib/events'
import { ipOf } from '@/lib/healthSignal'
import { createRequest } from '@/lib/restockNotify'

// "Email me when it's back" from a sold-out product page (components/product/NotifyMe.tsx). A few
// requests per visitor in a short window is plenty; this keeps scripts from signing up other people's
// addresses in bulk. In-memory, so per server instance.
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 6
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
  if (BOTS.test(request.headers.get('user-agent') ?? '')) return Response.json({ status: 'invalid' }, { status: 400, headers })
  if (tooMany(ipOf(request.headers) ?? 'unknown')) return Response.json({ status: 'busy' }, { status: 429, headers })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ status: 'invalid' }, { status: 400, headers })
  }
  try {
    const status = await createRequest(await getPayload({ config }), body)
    return Response.json({ status }, { status: status === 'invalid' ? 400 : 200, headers })
  } catch (err) {
    console.error('[restock-request]', err)
    return Response.json({ status: 'error' }, { status: 500, headers })
  }
}

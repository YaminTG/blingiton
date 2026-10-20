import config from '@payload-config'
import { getPayload } from 'payload'

import { isProduction } from '@/lib/site'

// For an outside uptime monitor (UptimeRobot, Better Stack…), which covers what the shop can't
// report itself: the whole server being down. 200 = fine; 503 = the database doesn't answer, the
// background checks stopped (production only), or the last check found an emergency. The monitor's
// phone app then gives the owner a push notification. Says no more than one word about why.
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

export async function GET() {
  let reason: string | null = null
  try {
    const payload = await getPayload({ config })
    const state = await payload.findGlobal({ slug: 'health-state', depth: 0 })
    const fresh = state.lastRunAt && Date.now() - new Date(state.lastRunAt).getTime() < 40 * 60_000
    if (isProduction && !fresh) reason = 'checks-not-running'
    else if (Array.isArray(state.problems) && state.problems.some((p) => (p as { tier?: string })?.tier === 'emergency')) reason = 'emergency'
  } catch {
    reason = 'database'
  }
  return Response.json(reason ? { ok: false, reason } : { ok: true }, { status: reason ? 503 : 200, headers })
}

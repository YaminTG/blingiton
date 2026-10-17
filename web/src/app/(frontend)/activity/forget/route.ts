import config from '@payload-config'
import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { DEVICE_COOKIE } from '@/lib/activity'
import { readDeviceToken } from '@/lib/customerToken'
import { clearedCookies, forgetCustomer } from '@/lib/customers'

// "Stop and delete" on /[locale]/your-data: withdraws consent on every device, erases the recorded
// browsing and clears this browser's cookies. Same-origin only, so another site can't trigger it.
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'origin' }, { status: 403 })

  const token = readDeviceToken(request.cookies.get(DEVICE_COOKIE)?.value)
  if (token) {
    const payload = await getPayload({ config })
    const customer = await payload.findByID({ collection: 'customers', id: token.customer, depth: 0, disableErrors: true, select: { tracking: true } })
    // An old cookie (already withdrawn once) only clears itself.
    if (customer && (customer.tracking?.epoch ?? 0) === token.epoch) await forgetCustomer(payload, customer.id)
  }
  const res = NextResponse.json({ ok: true }, { headers: { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' } })
  for (const c of clearedCookies()) res.cookies.set(c)
  return res
}

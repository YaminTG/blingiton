import { NextResponse, type NextRequest } from 'next/server'

import { CURRENCY_COOKIE, currencyForCountry } from '@/lib/currency'
import { BOTS } from '@/lib/events'

const locales = ['en', 'ar']

/**
 * First visit: the visitor's country from the host's geo header (Cloudflare or Vercel), so prices
 * show in their currency. No header (local dev, or a host without one) means JOD. Crawlers are left
 * alone, so search engines always see the JOD prices that match the structured data and feed.
 */
function withCurrency(request: NextRequest, response: NextResponse) {
  if (request.cookies.has(CURRENCY_COOKIE) || BOTS.test(request.headers.get('user-agent') ?? '')) return response
  const country = (request.headers.get('cf-ipcountry') ?? request.headers.get('x-vercel-ip-country') ?? '').toUpperCase()
  // XX and T1 are Cloudflare's "unknown" and Tor.
  if (!/^[A-Z]{2}$/.test(country) || country === 'XX' || country === 'T1') return response
  response.cookies.set(CURRENCY_COOKIE, currencyForCountry(country), { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  return response
}

/**
 * - `/` → `/ar` or `/en` from the browser's language (`/spin` → `/ar/spin` or `/en/spin`).
 * - `/en/…`, `/ar/…` → served as-is.
 * - Anything else without a language (old WooCommerce links like `/product/x/`) → looked up in
 *   the Redirects collection by /redirect-lookup, which answers with a 301 or a 404.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const first = pathname.split('/')[1] ?? ''

  // `/spin` is the short link printed on the bazaar QR code. The query (utm_* tags) is kept.
  if (pathname === '/' || pathname === '/spin') {
    const preferred = (request.headers.get('accept-language') ?? '').toLowerCase()
    const locale = preferred.startsWith('ar') ? 'ar' : 'en'
    const target = `/${locale}${pathname === '/spin' ? '/spin' : ''}${request.nextUrl.search}`
    return withCurrency(request, NextResponse.redirect(new URL(target, request.url), 307))
  }
  if (locales.includes(first)) {
    if (pathname.length > 1 && pathname.endsWith('/')) {
      // Plain URL objects: NextURL would re-append the trailing slash it was created with.
      return NextResponse.redirect(new URL(pathname.replace(/\/+$/, '') + request.nextUrl.search, request.url), 308)
    }
    return withCurrency(request, NextResponse.next())
  }

  return NextResponse.rewrite(new URL(`/redirect-lookup?path=${encodeURIComponent(pathname)}`, request.url))
}

export const config = {
  // Skip Payload (admin + API), Next internals, metadata/feeds, the shop-health routes (/health,
  // /health-report) and any file with an extension.
  matcher: ['/((?!admin|api|_next|redirect-lookup|bag-items|place-order|submit-review|track|activity|feeds|health|restock-request|.*\\..*).*)'],
}

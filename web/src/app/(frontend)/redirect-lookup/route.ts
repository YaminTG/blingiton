import config from '@payload-config'
import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { later } from '@/hooks/revalidate'
import { lookupRedirect } from '@/lib/data'
import { BOTS } from '@/lib/events'
import { ipOf, recordSignal, referrerOf, sourceOf } from '@/lib/healthSignal'
import { absolute } from '@/lib/urls'

// Paths only scripts look for.
const JUNK = /^\/(wp-|xmlrpc|cgi-bin|\.well-known|phpmyadmin|admin\b)|\.(php|env|asp|aspx|cgi|sql|bak)$/i

// The proxy sends every address without a language prefix here (mostly links to the old
// WooCommerce site). Known ones get a single 301 to their new page; the rest a real 404.
export async function GET(request: NextRequest) {
  // Behind the proxy's rewrite, Next hands us the visitor's original URL; called directly, use ?path=.
  const own = request.nextUrl.pathname
  const from = own !== '/redirect-lookup' ? own : request.nextUrl.searchParams.get('path') || '/'
  const target = await lookupRedirect(from, 'en')
  if (target) return Response.redirect(absolute(target), 301)
  // A person (not a crawler or a WordPress-probing script) following a dead old link: the shop-health
  // check suggests a redirect once a few people have.
  if (!BOTS.test(request.headers.get('user-agent') ?? '') && !JUNK.test(from)) {
    const payload = await getPayload({ config })
    later(() => recordSignal(payload, { kind: 'not-found', path: from, referrer: referrerOf(request.headers.get('referer')), source: sourceOf(ipOf(request.headers)) }))
  }
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Page not found | Blingiton</title><body style="font-family:system-ui;padding:48px;text-align:center"><h1>Page not found</h1><p><a href="/en/shop">Visit the Blingiton shop</a> · <a href="/ar/shop" lang="ar">تسوّق الآن</a></p></body></html>`,
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

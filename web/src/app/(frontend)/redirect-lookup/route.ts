import type { NextRequest } from 'next/server'

import { lookupRedirect } from '@/lib/data'
import { absolute } from '@/lib/urls'

// The proxy sends every address without a language prefix here (mostly links to the old
// WooCommerce site). Known ones get a single 301 to their new page; the rest a real 404.
export async function GET(request: NextRequest) {
  // Behind the proxy's rewrite, Next hands us the visitor's original URL; called directly, use ?path=.
  const own = request.nextUrl.pathname
  const from = own !== '/redirect-lookup' ? own : request.nextUrl.searchParams.get('path') || '/'
  const target = await lookupRedirect(from, 'en')
  if (target) return Response.redirect(absolute(target), 301)
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Page not found | Blingiton</title><body style="font-family:system-ui;padding:48px;text-align:center"><h1>Page not found</h1><p><a href="/en/shop">Visit the Blingiton shop</a> · <a href="/ar/shop" lang="ar">تسوّق الآن</a></p></body></html>`,
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

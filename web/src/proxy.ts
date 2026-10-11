import { NextResponse, type NextRequest } from 'next/server'

const locales = ['en', 'ar']

/**
 * - `/` → `/ar` or `/en` from the browser's language.
 * - `/en/…`, `/ar/…` → served as-is.
 * - Anything else without a language (old WooCommerce links like `/product/x/`) → looked up in
 *   the Redirects collection by /redirect-lookup, which answers with a 301 or a 404.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const first = pathname.split('/')[1] ?? ''

  if (pathname === '/') {
    const preferred = (request.headers.get('accept-language') ?? '').toLowerCase()
    const locale = preferred.startsWith('ar') ? 'ar' : 'en'
    return NextResponse.redirect(new URL(`/${locale}`, request.url), 307)
  }
  if (locales.includes(first)) {
    if (pathname.length > 1 && pathname.endsWith('/')) {
      // Plain URL objects: NextURL would re-append the trailing slash it was created with.
      return NextResponse.redirect(new URL(pathname.replace(/\/+$/, '') + request.nextUrl.search, request.url), 308)
    }
    return NextResponse.next()
  }

  return NextResponse.rewrite(new URL(`/redirect-lookup?path=${encodeURIComponent(pathname)}`, request.url))
}

export const config = {
  // Skip Payload (admin + API), Next internals, metadata/feeds and any file with an extension.
  matcher: ['/((?!admin|api|_next|redirect-lookup|bag-items|feeds|.*\\..*).*)'],
}

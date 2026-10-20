// Browser side of the shop-health check (src/lib/health.ts): tells /health-report about a page that
// doesn't exist, a photo that didn't load, or a checkout that couldn't reach the server. Sent with
// sendBeacon, so it never holds up the page. The server checks again before anyone is alerted.
// No server imports: the browser uses this file, and /health-report uses `mediaPath` too.

export type HealthReport = { type: 'not-found' | 'image' | 'checkout'; src?: string; detail?: string }

/**
 * The site path of one of our photos (`/api/media/file/...`), from the address an <img> loaded,
 * including next/image's `/_next/image?url=...`. Anything else (other sites, data: URLs) is null, so
 * the server only ever re-checks its own photos.
 */
export function mediaPath(src: string | null | undefined, base: string): string | null {
  if (!src) return null
  try {
    let url = new URL(src, base)
    if (url.origin !== new URL(base).origin) return null
    if (url.pathname === '/_next/image') {
      const inner = url.searchParams.get('url')
      if (!inner) return null
      url = new URL(inner, base)
      if (url.origin !== new URL(base).origin) return null
    }
    return url.pathname.startsWith('/api/media/file/') ? url.pathname.slice(0, 300) : null
  } catch {
    return null
  }
}

export function reportHealth(r: HealthReport) {
  try {
    const body = JSON.stringify({ ...r, path: location.pathname, referrer: document.referrer || undefined })
    const blob = new Blob([body], { type: 'application/json' })
    if (!navigator.sendBeacon?.('/health-report', blob))
      void fetch('/health-report', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {})
  } catch {
    // old browser or blocked: not reported
  }
}

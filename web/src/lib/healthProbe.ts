import type { Payload } from 'payload'

import type { Deep, ImageCheck, PageCheck, PageKind, ProductInfo } from './healthRules'
import { fetchRates } from './rates'
import { isProduction, serverUrl } from './site'
import { paths } from './urls'

/**
 * The shop-health check's hourly crawl (src/lib/health.ts): opens the site the way a customer would
 * and keeps whatever failed. Each run checks:
 *   - home, shop and checkout in both languages, every category and info page
 *   - the 15 pieces that bring in the most, plus the next 40 in turn (all ~560 within a day)
 *   - every link in the home page's menus and footer
 *   - the main photo of each piece checked
 *   - pages and photos shoppers' browsers reported as missing, so only real ones are reported
 *   - the exchange-rate source
 * The user agent contains "bot", so these visits stay out of the funnel and the currency cookie.
 */

const UA = 'BlingitonHealthCheck/1.0 (bot)'
// A page that takes longer than this is as good as down for a shopper. `next dev` against a remote
// database can take ~15 s a page, so development waits longer.
const TIMEOUT_MS = isProduction ? 15_000 : 90_000
const TOP = 15
const BATCH = 40
const MAX_LINKS = 60
const MAX_REPORTED = 40
const PARALLEL = 4

type Target = { path: string; kind: PageKind; product?: number | null; from?: string | null }

async function get(path: string, opts: { text?: boolean; range?: boolean } = {}): Promise<{ status: number; text?: string }> {
  try {
    const res = await fetch(new URL(path, serverUrl), {
      headers: { 'user-agent': UA, ...(opts.range ? { range: 'bytes=0-1023' } : {}) },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = opts.text && res.ok ? await res.text() : undefined
    if (!opts.text) await res.body?.cancel().catch(() => null)
    return { status: res.status, text }
  } catch {
    // Timed out or no answer at all.
    return { status: 0 }
  }
}

async function pool<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker))
  return out
}

export const pageOk = (status: number) => status >= 200 && status < 400
const imageOk = (status: number) => status === 200 || status === 206

/** Links to other pages of this site in some HTML (no assets, admin or API). */
export function linksIn(html: string): string[] {
  const found = new Set<string>()
  for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) {
    const path = m[1].replace(/&amp;/g, '&')
    if (path === '/' || path.startsWith('//') || /^\/(_next|api|admin)\b/.test(path) || /\.\w{2,5}$/.test(path)) continue
    found.add(path)
  }
  return [...found]
}

/** The piece a product page is for, from its address (`/en/product/<slug>`). */
const productAt = (path: string | null | undefined, bySlug: Map<string, number>) => {
  const m = path?.match(/^\/(?:en|ar)\/product\/([^/]+)$/)
  return m ? (bySlug.get(decodeURIComponent(m[1])) ?? null) : null
}

export async function runDeepCheck(
  payload: Payload,
  input: {
    products: ProductInfo[]
    prev: Deep | null
    /** Paths shoppers landed on that didn't exist (last 7 days). */
    reportedMissing: string[]
    /** Photos that failed in shoppers' browsers (last 7 days). */
    reportedImages: { src: string; page: string | null }[]
  },
): Promise<Deep> {
  const [categories, pages] = await Promise.all([
    payload.find({ collection: 'categories', locale: 'en', limit: 0, pagination: false, depth: 0, overrideAccess: false, select: { slug: true } }),
    payload.find({ collection: 'pages', locale: 'en', limit: 0, pagination: false, depth: 0, overrideAccess: false, select: { slug: true } }),
  ])

  // --- Which pages
  const targets: Target[] = []
  for (const l of ['en', 'ar'] as const) {
    targets.push({ path: paths.home(l), kind: 'key' }, { path: paths.shop(l), kind: 'key' }, { path: paths.checkout(l), kind: 'checkout' })
  }
  for (const c of categories.docs) if (c.slug) targets.push({ path: paths.category('en', c.slug), kind: 'category' })
  for (const p of pages.docs) if (p.slug) targets.push({ path: paths.page('en', p.slug), kind: 'page' })

  const listed = input.products.filter((p) => p.slug)
  const top = [...listed].sort((a, b) => b.value - a.value).slice(0, TOP)
  const byId = [...listed].sort((a, b) => a.id - b.id)
  const cursor = byId.length ? (input.prev?.cursor ?? 0) % byId.length : 0
  const batch = [...byId.slice(cursor, cursor + BATCH), ...byId.slice(0, Math.max(0, cursor + BATCH - byId.length))]
  const checkedProducts = [...new Map([...top, ...batch].map((p) => [p.id, p])).values()]
  for (const p of checkedProducts) targets.push({ path: paths.product('en', p.slug!), kind: 'product', product: p.id })

  // --- Open them; the English home page's links are checked too.
  const home = await get(paths.home('en'), { text: true })
  const known = new Set(targets.map((t) => t.path))
  if (home.text) {
    for (const path of linksIn(home.text).slice(0, MAX_LINKS)) {
      if (!known.has(path)) targets.push({ path, kind: 'link', from: paths.home('en') })
      known.add(path)
    }
  }
  const results = await pool(targets, async (t) => (t.path === paths.home('en') ? { status: home.status } : get(t.path)))
  const failedPages: PageCheck[] = targets.map((t, i) => ({ ...t, status: results[i].status })).filter((r) => !pageOk(r.status))

  // --- Photos: each checked piece's main photo, and the ones shoppers reported.
  const imageIds = checkedProducts.map((p) => p.image).filter((id): id is number => typeof id === 'number')
  const media = imageIds.length
    ? // No `select`: the file URLs are worked out after reading and need the whole record.
      await payload.find({ collection: 'media', where: { id: { in: imageIds } }, limit: imageIds.length, pagination: false, depth: 0 })
    : { docs: [] }
  const urlOf = new Map(media.docs.map((m) => [m.id, m.sizes?.card?.url ?? m.url ?? null]))
  const bySlug = new Map(listed.map((p) => [p.slug!, p.id]))
  const photos = new Map<string, { product: number | null; page: string | null }>()
  for (const p of checkedProducts) {
    const url = p.image ? urlOf.get(p.image) : null
    if (url) photos.set(new URL(url, serverUrl).pathname, { product: p.id, page: paths.product('en', p.slug!) })
  }
  for (const r of input.reportedImages.slice(0, MAX_REPORTED)) if (!photos.has(r.src)) photos.set(r.src, { product: productAt(r.page, bySlug), page: r.page })
  const photoList = [...photos.entries()]
  const photoResults = await pool(photoList, ([url]) => get(url, { range: true }))
  const failedImages: ImageCheck[] = photoList.map(([url, at], i) => ({ url, ...at, status: photoResults[i].status })).filter((r) => !imageOk(r.status))

  // --- Missing pages people reported: still missing, or fixed (a redirect or the page is back)?
  const reported = [...new Set(input.reportedMissing)].slice(0, MAX_REPORTED)
  const reportedResults = await pool(reported, (path) => get(path))
  const missing = reported.filter((_, i) => reportedResults[i].status === 404)

  const rates = (await fetchRates()) ? 'live' : 'fallback'

  return {
    at: new Date().toISOString(),
    pages: failedPages,
    images: failedImages,
    checkedPages: targets.length,
    checkedImages: photoList.length,
    missing,
    rates,
    cursor: byId.length ? (cursor + BATCH) % byId.length : 0,
  }
}

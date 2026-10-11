/**
 * One-time import from the old WooCommerce store (blingitonjewels.com) through its public Store API.
 * Safe to re-run: everything is matched on the old WooCommerce ID and updated in place.
 *
 *   npx payload run scripts/import-woo.ts                     # everything
 *   IMPORT_LIMIT=5 npx payload run scripts/import-woo.ts      # trial run with 5 products
 *   IMPORT_IDS=10815,16884 npx payload run scripts/import-woo.ts  # re-import specific old product IDs
 *
 * Writes scripts/output/import-report.md with everything that needs a human look.
 */
import fs from 'fs/promises'
import path from 'path'
import { getPayload, type Payload } from 'payload'
import { fileURLToPath } from 'url'

import config from '../src/payload.config'
import { slugify } from '../src/lib/slugify'

const API = 'https://blingitonjewels.com/wp-json/wc/store/v1'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(dirname, 'output')

// `payload run` doesn't pass flags through to the script, so the trial-run limit is an env var.
const LIMIT = Number(process.env.IMPORT_LIMIT) || Infinity
const ONLY_IDS = process.env.IMPORT_IDS ? new Set(process.env.IMPORT_IDS.split(',').map(Number)) : null

// Categories that don't carry over as-is.
const SKIP_CATEGORIES = new Set(['uncategorized', 'gift-voucher'])
const RENAME_CATEGORIES: Record<string, string> = { 'palestine-jewlery': 'palestine-jewelry', ring: 'rings' }
// "Most loved" on the preview home page.
const FEATURED = new Set([10830, 13427, 13398, 15214, 13712, 14712, 16154, 17231])

// ---------- Store API types (only what we use) ----------
type WooImage = { id: number; src: string; alt: string; name: string }
type WooTerm = { id: number; name: string; slug: string }
type WooCategory = WooTerm & { parent: number; description: string; count: number; image: WooImage | null; permalink: string }
type WooProduct = {
  id: number
  name: string
  slug: string
  type: string
  permalink: string
  short_description: string
  description: string
  on_sale: boolean
  prices: { price: string; regular_price: string; sale_price: string; currency_minor_unit: number }
  images: WooImage[]
  categories: (WooTerm & { link: string })[]
  tags: WooTerm[]
  attributes: { name: string; has_variations: boolean; terms: WooTerm[] }[]
  variations: { id: number; attributes: { name: string; value: string }[] }[]
  is_in_stock: boolean
  low_stock_remaining: number | null
}

// ---------- helpers ----------
const getJSON = async <T>(url: string): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url)
    if (res.ok) return (await res.json()) as T
    if (attempt >= 3) throw new Error(`${res.status} ${url}`)
    await new Promise((r) => setTimeout(r, 1000 * attempt))
  }
}

async function getAll<T>(endpoint: string): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; ; page++) {
    const batch = await getJSON<T[]>(`${API}/${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
    out.push(...batch)
    if (batch.length < 100) return out
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)

const stripHtml = (html: string) =>
  decode(
    html
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h\d|div)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')

// "Charmie Pink Necklace – 925 Sterling Silver" → "Charmie Pink Necklace"
export const cleanName = (raw: string) => {
  const name = decode(raw).replace(/\s+/g, ' ').trim()
  const cleaned = name
    .replace(/\s*[-–—]\s*[^-–—]*\b925\b[^-–—]*$/i, '')
    .replace(/\s+925$/, '')
    .trim()
  return cleaned || name
}

const money = (minor: string, unit: number) => Number(minor) / 10 ** unit
const pathOf = (url: string) => {
  const p = decodeURIComponent(new URL(url).pathname).toLowerCase().replace(/\/+$/, '')
  return p || '/'
}

const kindOf = (p: WooProduct): string => {
  const cats = p.categories.map((c) => c.slug)
  const n = p.name.toLowerCase()
  if (cats.includes('cufflinks') || n.includes('cufflink')) return 'cufflinks'
  if (cats.includes('anklets') || n.includes('anklet')) return 'anklet'
  if (cats.some((c) => c === 'ring' || c === 'custom-made-rings') || /\bring\b|\bband\b/.test(n)) return 'ring'
  if (cats.includes('earrings') || /earring|hoops?\b|studs?\b/.test(n)) return 'earrings'
  if (cats.includes('bracelets') || /bracelet|bangle|cuff\b/.test(n)) return 'bracelet'
  if (cats.some((c) => c.includes('necklace')) || /necklace|pendant|chain/.test(n)) return 'necklace'
  return 'other'
}

type Personalization = {
  type: 'none' | 'name' | 'letters' | 'engrave'
  previewShape?: string
  defaultStyle?: string
  stones?: string
  chainLengths?: string[]
  reason?: string
}

// WooCommerce doesn't expose the personalization add-on, so this is a best guess for a human to check.
const personalizationOf = (p: WooProduct, kind: string): Personalization => {
  const cats = p.categories.map((c) => c.slug)
  const n = decode(p.name).toLowerCase()
  const attrs = p.attributes.map((a) => a.name.toLowerCase())
  const chains = kind === 'necklace' ? ['40', '45', '50'] : kind === 'bracelet' || kind === 'anklet' ? ['16', '18', '20'] : undefined
  const stones = /birthstone/.test(n) ? 'birthstone' : 'none'
  const style = /kufi/.test(n) ? 'kufi' : /calligraph|arabic/.test(n) ? 'script' : undefined

  if (/engrav/.test(n) || (kind === 'cufflinks' && /initial|name|monogram/.test(n)))
    return { type: 'engrave', previewShape: kind === 'cufflinks' ? 'disc' : 'band', defaultStyle: style ?? 'classic', stones, reason: 'name says engraved' }
  if (cats.includes('letters-necklace') || attrs.includes('letters') || /\bletters?\b|\binitials?\b/.test(n))
    return { type: 'letters', previewShape: 'plate', defaultStyle: style ?? 'modern', stones, chainLengths: chains, reason: 'letters category / name' }
  if (
    cats.some((c) => ['name-necklace', 'personalized-necklaces', 'custom-made-rings'].includes(c)) ||
    attrs.includes('name') ||
    /\bnames?\b|personali[sz]ed|custom/.test(n)
  )
    return {
      type: 'name',
      previewShape: kind === 'ring' ? 'bandcut' : kind === 'cufflinks' ? 'cut' : 'plate',
      defaultStyle: style ?? 'script',
      stones,
      chainLengths: chains,
      reason: 'name category / name',
    }
  return { type: 'none' }
}

// ---------- import ----------
const report = {
  categories: [] as string[],
  noImage: [] as string[],
  drafts: [] as string[],
  personalized: [] as string[],
  options: [] as string[],
  renamed: [] as string[],
  failures: [] as string[],
}

async function importImage(payload: Payload, img: WooImage | null | undefined): Promise<number | undefined> {
  if (!img?.src) return undefined
  const existing = await payload.find({ collection: 'media', where: { wooId: { equals: img.id } }, limit: 1, depth: 0 })
  if (existing.docs[0]) return existing.docs[0].id as number

  const res = await fetch(img.src)
  if (!res.ok) throw new Error(`image ${res.status} ${img.src}`)
  const data = Buffer.from(await res.arrayBuffer())
  const name = decodeURIComponent(path.basename(new URL(img.src).pathname))
  const doc = await payload.create({
    collection: 'media',
    locale: 'en',
    data: { alt: decode(img.alt || '').trim() || undefined, wooId: img.id },
    file: { data, name, size: data.length, mimetype: res.headers.get('content-type') || 'image/jpeg' },
    context: { importing: true },
  })
  return doc.id as number
}

async function upsert(payload: Payload, collection: 'products' | 'categories', wooId: number, data: Record<string, unknown>) {
  const found = await payload.find({ collection, where: { 'legacy.wooId': { equals: wooId } }, limit: 1, depth: 0, draft: true })
  // Drafts are saved in draft mode so unfinished records (e.g. no category yet) pass validation.
  const draft = data._status === 'draft'
  const args = { collection, locale: 'en' as const, data, depth: 0, draft, context: { importing: true } }
  if (found.docs[0]) return payload.update({ ...args, id: found.docs[0].id } as never) as unknown as Promise<{ id: number }>
  return payload.create(args as never) as unknown as Promise<{ id: number }>
}

async function upsertRedirect(payload: Payload, from: string, relationTo: 'products' | 'categories', id: number) {
  const data = { from, to: { type: 'reference', reference: { relationTo, value: id } }, type: '301' }
  const found = await payload.find({ collection: 'redirects', where: { from: { equals: from } }, limit: 1, depth: 0 })
  if (found.docs[0]) await payload.update({ collection: 'redirects', id: found.docs[0].id, data: data as never })
  else await payload.create({ collection: 'redirects', data: data as never })
}

async function importCategories(payload: Payload) {
  const cats = await getAll<WooCategory>('products/categories')
  const idByWoo = new Map<number, number>()
  const kept = cats.filter((c) => !SKIP_CATEGORIES.has(c.slug))
  // Top-level categories first, biggest first; subcategories after their parents.
  kept.sort((a, b) => Number(a.parent !== 0) - Number(b.parent !== 0) || b.count - a.count)

  for (const [i, c] of kept.entries()) {
    const image = await importImage(payload, c.image)
    const slug = RENAME_CATEGORIES[c.slug] ?? c.slug
    const doc = await upsert(payload, 'categories', c.id, {
      name: decode(c.name),
      slug,
      image,
      order: i,
      showOnHome: c.parent === 0 && Boolean(c.image),
      legacy: { wooId: c.id, url: pathOf(c.permalink), name: decode(c.name), description: stripHtml(c.description || '') || undefined },
    })
    idByWoo.set(c.id, doc.id)
    await upsertRedirect(payload, pathOf(c.permalink), 'categories', doc.id)
    report.categories.push(`${decode(c.name)} → /shop/${slug}${c.parent ? ' (subcategory)' : ''}`)
  }
  for (const c of kept.filter((x) => x.parent && idByWoo.has(x.parent))) {
    await payload.update({ collection: 'categories', id: idByWoo.get(c.id)!, data: { parent: idByWoo.get(c.parent) }, context: { importing: true } })
  }
  console.log(`categories: ${kept.length}`)
  return idByWoo
}

async function optionsOf(p: WooProduct) {
  if (p.type !== 'variable' || !p.variations.length) return { options: undefined, minPrice: undefined }
  const unit = p.prices.currency_minor_unit
  const variants = await Promise.all(
    p.variations.map(async (v) => {
      const full = await getJSON<{ prices: { price: string } }>(`${API}/products/${v.id}`)
      return { attrs: v.attributes, price: money(full.prices.price, unit) }
    }),
  )
  const minPrice = Math.min(...variants.map((v) => v.price))
  const varying = p.attributes.filter((a) => a.has_variations)
  if (varying.length > 1) report.options.push(`${cleanName(p.name)} (#${p.id}): ${varying.length} linked options. Check the extra prices`)
  const options = varying.map((a) => ({
    name: decode(a.name).replace(/\s*:\s*$/, ''),
    choices: a.terms.map((t) => {
      const prices = variants.filter((v) => v.attrs.some((x) => x.name === a.name && x.value === t.name)).map((v) => v.price)
      return { label: decode(t.name), extraPrice: prices.length ? Math.min(...prices) - minPrice : 0 }
    }),
  }))
  return { options, minPrice }
}

async function importProducts(payload: Payload, categoryIds: Map<number, number>) {
  const products = (await getAll<WooProduct>('products')).filter((p) => !ONLY_IDS || ONLY_IDS.has(p.id)).slice(0, LIMIT)
  let done = 0

  const work = async (p: WooProduct) => {
    const name = cleanName(p.name)
    try {
      const kind = kindOf(p)
      const unit = p.prices.currency_minor_unit
      const images: number[] = []
      for (const img of p.images) {
        const id = await importImage(payload, img)
        if (id) images.push(id)
      }
      const categories = p.categories.map((c) => categoryIds.get(c.id)).filter((x): x is number => Boolean(x))
      const isGift = /gift (card|voucher)/i.test(p.name)
      const personalization = personalizationOf(p, kind)
      const { options, minPrice } = await optionsOf(p)
      const regular = money(p.prices.regular_price, unit)
      const price = minPrice ?? money(p.prices.price, unit)
      const legacyText = [stripHtml(p.short_description), stripHtml(p.description)].filter(Boolean)

      // Can't publish without a photo or category (both required); those become drafts to finish by hand.
      const publishable = images.length > 0 && categories.length > 0 && !isGift
      const data = {
        name,
        slug: /^[a-z0-9-]+$/.test(p.slug) ? p.slug : slugify(decodeURIComponent(p.slug)) || slugify(name),
        price,
        compareAtPrice: p.on_sale && regular > price ? regular : undefined,
        kind,
        categories,
        images,
        availability: !p.is_in_stock ? 'sold_out' : personalization.type !== 'none' ? 'made_to_order' : 'in_stock',
        stock: p.is_in_stock && personalization.type === 'none' ? (p.low_stock_remaining ?? undefined) : undefined,
        featured: FEATURED.has(p.id),
        keywords: p.tags.length ? p.tags.map((t) => decode(t.name)).join(', ') : undefined,
        personalization: {
          type: personalization.type,
          previewShape: personalization.previewShape,
          defaultStyle: personalization.defaultStyle,
          stones: personalization.stones ?? 'none',
          chainLengths: personalization.chainLengths,
          options,
        },
        seoStatus: publishable ? 'pending' : 'attention',
        legacy: {
          wooId: p.id,
          url: pathOf(p.permalink),
          name: decode(p.name),
          // Identical short and long descriptions are common on the old site; keep one copy.
          description: [...new Set(legacyText)].join('\n\n') || undefined,
        },
        _status: publishable ? 'published' : 'draft',
      }
      const doc = await upsert(payload, 'products', p.id, data)
      await upsertRedirect(payload, pathOf(p.permalink), 'products', doc.id)

      if (!images.length) report.noImage.push(`${name} (#${p.id})`)
      if (!publishable)
        report.drafts.push(`${name} (#${p.id}): ${isGift ? 'gift card, needs its own checkout flow' : !images.length ? 'no photo' : 'no category'}`)
      if (personalization.type !== 'none')
        report.personalized.push(`${name} (#${p.id}): **${personalization.type}**, ${personalization.previewShape ?? ''} (${personalization.reason})`)
      if (name !== decode(p.name).trim()) report.renamed.push(`${decode(p.name)} → ${name}`)
    } catch (err) {
      report.failures.push(`${name} (#${p.id}): ${(err as Error).message}`)
    }
    done++
    if (done % 25 === 0 || done === products.length) console.log(`products: ${done}/${products.length}`)
  }

  // A few at a time: fast enough, and gentle on the old server.
  const queue = [...products]
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let p = queue.shift(); p; p = queue.shift()) await work(p)
    }),
  )
  return products.length
}

function writeReport(total: number) {
  const list = (items: string[]) => (items.length ? items.map((x) => `- ${x}`).join('\n') : '_None._')
  return `# Import report

Imported ${total} products from blingitonjewels.com on ${new Date().toISOString().slice(0, 10)}.
Old links redirect to the new pages. Old descriptions are kept as reference only (Old website → description);
the SEO pipeline writes new English + Arabic descriptions from them.

## Failed (${report.failures.length})
${list(report.failures)}

## Saved as drafts, need finishing by hand (${report.drafts.length})
${list(report.drafts)}

## Personalization guessed. Please check (${report.personalized.length})
The old site doesn't expose its personalization settings, so these were guessed from the category and name.
Open each product → Personalization tab to correct the type, shape or chain lengths.
${list(report.personalized)}

## Options with linked prices. Please check (${report.options.length})
${list(report.options)}

## Categories (${report.categories.length})
${list(report.categories)}

## Names cleaned (${report.renamed.length})
${list(report.renamed)}
`
}

async function main() {
  const payload = await getPayload({ config })
  console.log(`Importing from ${API}${Number.isFinite(LIMIT) ? ` (limit ${LIMIT})` : ''}`)
  const categoryIds = await importCategories(payload)
  const total = await importProducts(payload, categoryIds)
  await fs.mkdir(OUT, { recursive: true })
  await fs.writeFile(path.join(OUT, 'import-report.md'), writeReport(total))
  console.log(`Done. Report: scripts/output/import-report.md (${report.failures.length} failures)`)
  process.exit(0)
}

// Top-level await: `payload run` only waits for the module itself to finish loading.
await main().catch((err) => {
  console.error(err)
  process.exit(1)
})

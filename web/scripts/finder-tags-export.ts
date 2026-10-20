/**
 * Exports every product's facts for writing its gift-finder tags in a Claude Code session (like the
 * SEO batches). Writes scripts/output/finder-tags/products.input.json (git ignores scripts/output).
 * Then write products-*.output.json there as [{ id, for: [], occasions: [], styles: [] }] and apply
 * them with scripts/finder-tags-apply.ts.
 *
 *   npx payload run scripts/finder-tags-export.ts < /dev/null
 *   FINDER_ALL=1 ...   # also products that already have tags (default: only untagged ones)
 */
import fs from 'fs/promises'
import path from 'path'
import { getPayload } from 'payload'
import { fileURLToPath } from 'url'

import config from '../src/payload.config'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output', 'finder-tags')
const all = Boolean(process.env.FINDER_ALL)

const payload = await getPayload({ config })
const [en, ar, categories] = await Promise.all([
  payload.find({ collection: 'products', locale: 'en', draft: true, limit: 0, pagination: false, depth: 0, sort: 'id' }),
  payload.find({ collection: 'products', locale: 'ar', draft: true, limit: 0, pagination: false, depth: 0, select: { name: true } }),
  payload.find({ collection: 'categories', locale: 'en', limit: 0, pagination: false, depth: 0, select: { slug: true } }),
])
const arName = new Map(ar.docs.map((d) => [d.id, d.name]))
const slug = new Map(categories.docs.map((c) => [c.id, c.slug ?? '']))
const cut = (s: string | null | undefined, n: number) => (s ? s.replace(/\s+/g, ' ').trim().slice(0, n) : undefined)

const rows = en.docs
  .filter((p) => all || !(p.finder?.forWhom?.length || p.finder?.occasions?.length || p.finder?.styles?.length))
  .map((p) => ({
    id: p.id,
    status: p._status,
    name: p.name,
    nameAr: arName.get(p.id) !== p.name ? arName.get(p.id) : undefined,
    kind: p.kind,
    categories: (p.categories ?? []).map((c) => slug.get(typeof c === 'object' ? c.id : c)).filter(Boolean),
    price: p.price,
    personal: p.personalization?.type !== 'none' ? p.personalization?.type : undefined,
    stones: p.personalization?.stones !== 'none' ? p.personalization?.stones : undefined,
    gold: p.personalization?.goldPlated || undefined,
    short: cut(p.shortDescription, 160),
    about: cut(p.description, 220),
    keywords: cut(p.keywords, 160),
  }))

await fs.mkdir(DIR, { recursive: true })
await fs.writeFile(path.join(DIR, 'products.input.json'), JSON.stringify(rows, null, 1))
console.log(`Wrote ${rows.length} products to ${path.join(DIR, 'products.input.json')}`)
process.exit(0)

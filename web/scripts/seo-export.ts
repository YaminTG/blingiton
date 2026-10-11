/**
 * Exports the facts for every product/category that still needs SEO text, in batches, for the
 * one-time backfills written in a Claude Code session. The matching outputs are applied with
 * scripts/seo-apply.ts.
 *
 *   npx payload run scripts/seo-export.ts
 *   → scripts/output/seo/categories.input.json, products-01.input.json, products-02.input.json, …
 *
 *   SEO_ALL=1 SEO_DIR=seo-v2 npx payload run scripts/seo-export.ts
 *   → every product (for a rewrite), plus its address, Arabic name and current text, into scripts/output/seo-v2/
 */
import fs from 'fs/promises'
import path from 'path'
import { getPayload } from 'payload'
import { fileURLToPath } from 'url'

import type { Category, Product } from '../src/payload-types'
import config from '../src/payload.config'
import { categoryFacts, productFacts } from '../src/seo/facts'

const BATCH = 20
const ALL = Boolean(process.env.SEO_ALL)
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output', process.env.SEO_DIR || 'seo')

const payload = await getPayload({ config })
await fs.mkdir(OUT, { recursive: true })

const products = await payload.find({
  collection: 'products',
  where: ALL ? { _status: { equals: 'published' } } : { seoStatus: { not_equals: 'done' } },
  locale: 'en',
  depth: 1,
  limit: 0,
  draft: true,
  sort: 'id',
})
const categories = await payload.find({ collection: 'categories', locale: 'en', depth: 1, limit: 0, sort: 'order' })

// One product per line keeps the files easy to read and diff.
const lines = (items: unknown[]) => `[\n${items.map((x) => JSON.stringify(x)).join(',\n')}\n]\n`

const byCategory = new Map<number, string[]>()
for (const p of products.docs as Product[])
  for (const c of p.categories ?? []) {
    const id = typeof c === 'object' ? c.id : c
    byCategory.set(id, [...(byCategory.get(id) ?? []), p.name])
  }
const catFacts = (categories.docs as Category[]).map((c) =>
  categoryFacts(c, byCategory.get(c.id) ?? [], typeof c.parent === 'object' && c.parent ? c.parent.name : undefined),
)
await fs.writeFile(path.join(OUT, 'categories.input.json'), lines(catFacts))

// For a rewrite, also the current address and text: the facts in the old text carry over.
const arNames = ALL
  ? new Map((await payload.find({ collection: 'products', locale: 'ar', depth: 0, limit: 0, select: { name: true } })).docs.map((d) => [d.id, d.name]))
  : new Map<number, string>()
const facts = (products.docs as Product[]).map((p) =>
  ALL ? { ...productFacts(p), slug: p.slug, nameAr: arNames.get(p.id), goldPlated: Boolean(p.personalization?.goldPlated), currentText: p.description } : productFacts(p),
)
let files = 0
for (let i = 0; i < facts.length; i += BATCH) {
  files++
  await fs.writeFile(path.join(OUT, `products-${String(files).padStart(2, '0')}.input.json`), lines(facts.slice(i, i + BATCH)))
}
console.log(`Exported ${catFacts.length} categories and ${facts.length} products in ${files} batches to ${path.relative(process.cwd(), OUT)}`)
process.exit(0)

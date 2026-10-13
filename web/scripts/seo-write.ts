/**
 * Runs the automatic SEO writer (src/seo/writer.ts) by hand: the same thing the seo-refresh job
 * does after a save, for items saved before ANTHROPIC_API_KEY was set, or to try it on one product.
 *
 *   SEO_DRY_RUN=1 npx payload run scripts/seo-write.ts < /dev/null   # list what's missing; no API calls
 *   SEO_IDS=12 npx payload run scripts/seo-write.ts < /dev/null      # write product #12
 *   SEO_COLLECTION=categories npx payload run scripts/seo-write.ts < /dev/null
 *
 * Keep `npm run dev` running so the main photo can be fetched for the alt text; without it the text
 * is written from the product data alone. Afterwards, clear the page cache (see CLAUDE.md).
 */
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { applyCategorySeo, applyPageSeo, applyProductSeo } from '../src/seo/apply'
import { categoryAsks, pageAsks, productAsks, writerEnabled, writeSeo } from '../src/seo/writer'

const collection = (process.env.SEO_COLLECTION || 'products') as 'products' | 'categories' | 'pages'
const ids = process.env.SEO_IDS?.split(',').map(Number)
const dryRun = Boolean(process.env.SEO_DRY_RUN)
const asksFor = { products: productAsks, categories: categoryAsks, pages: pageAsks }[collection]

if (!dryRun && !writerEnabled()) {
  console.log('ANTHROPIC_API_KEY is not set. Use SEO_DRY_RUN=1 to list what is missing.')
  process.exit(1)
}

const payload = await getPayload({ config })
const docs = (
  await payload.find({
    collection,
    where: ids ? { id: { in: ids } } : {},
    locale: 'all',
    depth: 1,
    limit: 0,
    draft: true,
    sort: 'id',
  } as never)
).docs as unknown as Record<string, unknown>[]

const todo = docs.map((doc) => ({ doc, asks: asksFor(doc) })).filter((x) => x.asks.length)
console.log(`${todo.length} of ${docs.length} ${collection} have missing text`)
for (const { doc, asks } of todo) {
  const name = doc.name ?? doc.title
  const label = typeof name === 'object' && name ? (name as { en?: string }).en : name
  console.log(`#${doc.id} ${label}: ${asks.map((a) => `${a.key} (${a.locales.join('+')})`).join(', ')}`)
  if (dryRun) continue

  const id = doc.id as number
  const input = await writeSeo(payload, collection, id)
  const apply = collection === 'categories' ? applyCategorySeo : collection === 'pages' ? applyPageSeo : applyProductSeo
  const result = await apply(payload, id, input ?? {}, input ? 'api' : 'refresh')
  console.log(`  → ${result.status}; wrote ${result.written.join(', ') || 'nothing'}${result.problems.length ? `; rejected: ${result.problems.join('; ')}` : ''}`)
}
process.exit(0)

import type { TaskConfig } from 'payload'

import { applyCategorySeo, applyPageSeo, applyProductSeo } from './apply'
import { writerEnabled, writeSeo } from './writer'

/**
 * Background job queued after every product/category/page save.
 * With ANTHROPIC_API_KEY set, Claude first writes whatever text is still missing (src/seo/writer.ts).
 * Then the SEO status (✓ / ⚠ and the reasons) and score are re-checked. Only empty fields are
 * filled, so a person's text is never overwritten.
 */
export const seoRefreshTask: TaskConfig<'seo-refresh'> = {
  slug: 'seo-refresh',
  retries: 2,
  inputSchema: [
    { name: 'collection', type: 'select', options: ['products', 'categories', 'pages'], required: true },
    { name: 'id', type: 'text', required: true },
  ],
  handler: async ({ input, req }) => {
    const id = Number(input.id)
    const collection = input.collection
    let written = null
    let failure: unknown = null
    if (writerEnabled()) {
      try {
        written = await writeSeo(req.payload, collection, id)
      } catch (err) {
        failure = err
      }
    }
    const source = written ? 'api' : 'refresh'
    if (collection === 'categories') await applyCategorySeo(req.payload, id, written ?? {}, source)
    else if (collection === 'pages') await applyPageSeo(req.payload, id, written ?? {}, source)
    else await applyProductSeo(req.payload, id, written ?? {}, source)
    // The status is up to date either way; failing the job lets the queue retry the writing.
    if (failure) throw failure
    return { output: {} }
  },
}

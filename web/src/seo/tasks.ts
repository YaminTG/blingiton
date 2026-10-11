import type { TaskConfig } from 'payload'

import { applyCategorySeo, applyPageSeo, applyProductSeo } from './apply'

/**
 * Background job queued after every product/category/page save.
 * Today: re-checks the SEO status (✓ / ⚠ and the reasons) after a person's edit.
 * With ANTHROPIC_API_KEY set: the Claude API writer will produce the missing text first and pass
 * it in as `input` below — same rules, same "never overwrite a person's text" guarantee.
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
    if (input.collection === 'categories') await applyCategorySeo(req.payload, id, {}, 'refresh')
    else if (input.collection === 'pages') await applyPageSeo(req.payload, id, {}, 'refresh')
    else await applyProductSeo(req.payload, id, {}, 'refresh')
    return { output: {} }
  },
}

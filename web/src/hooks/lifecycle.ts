/**
 * What happens on its own when content is saved in the admin:
 *   1. the affected pages, sitemap and feed are refreshed (cache tags)
 *   2. a changed URL gets a 301 from the old address
 *   3. the SEO status is re-checked in the background (and, once an API key is set, missing
 *      text is written — see the seo-refresh task)
 *   4. on the live site, IndexNow is told which URLs changed
 * Saves made by our own scripts/pipeline carry `context.skipSeo` or `context.importing` so they
 * don't trigger another round.
 */
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, GlobalAfterChangeHook, Payload, PayloadRequest } from 'payload'

import type { Category, Page, Product } from '@/payload-types'
import { locales } from '@/lib/locales'
import { tags } from '@/lib/tags'
import { paths } from '@/lib/urls'
import { pingIndexNow } from '@/seo/indexnow'

import { later, refresh } from './revalidate'

type Ref = number | { id: number } | null | undefined
const idOf = (v: Ref) => (v && typeof v === 'object' ? v.id : v) ?? null
const idsOf = (list: Ref[] | null | undefined) => (list ?? []).map(idOf).filter((x): x is number => x !== null)

/** Point an old address (e.g. `/product/old-slug`) at a product or category, permanently. Also used by scripts. */
export async function upsertRedirect(payload: Payload, from: string, relationTo: 'products' | 'categories', id: number, req?: PayloadRequest) {
  const data = { from, to: { type: 'reference' as const, reference: { relationTo, value: id } }, type: '301' as const }
  const found = await payload.find({ collection: 'redirects', where: { from: { equals: from } }, limit: 1, depth: 0, req })
  if (found.docs[0]) await payload.update({ collection: 'redirects', id: found.docs[0].id, data: data as never, req, context: { skipSeo: true } })
  else await payload.create({ collection: 'redirects', data: data as never, req, context: { skipSeo: true } })
}

function afterSave(req: PayloadRequest, collection: 'products' | 'categories' | 'pages', id: number, urlPaths: string[]) {
  later(async () => {
    await req.payload.jobs.queue({ task: 'seo-refresh', input: { collection, id: String(id) } })
    await req.payload.jobs.run({ limit: 10 })
    await pingIndexNow(urlPaths)
  })
}

export const productAfterChange: CollectionAfterChangeHook<Product> = async ({ doc, previousDoc, req, context }) => {
  if (context.importing) return doc
  const categoryIds = new Set([...idsOf(doc.categories), ...idsOf(previousDoc?.categories)])
  refresh(tags.products, tags.product(doc.id), ...[...categoryIds].map(tags.category))
  if (context.skipSeo) return doc

  const published = doc._status === 'published'
  if (published && previousDoc?.slug && doc.slug && previousDoc.slug !== doc.slug && previousDoc._status === 'published') {
    await upsertRedirect(req.payload, `/product/${previousDoc.slug}`, 'products', doc.id, req)
  }
  if (published) afterSave(req, 'products', doc.id, locales.map((l) => paths.product(l, doc.slug ?? '')))
  else afterSave(req, 'products', doc.id, [])
  return doc
}

export const productAfterDelete: CollectionAfterDeleteHook<Product> = async ({ doc, req }) => {
  refresh(tags.products, tags.product(doc.id), tags.redirects)
  // Deleted piece: send its address to its category instead of a dead end.
  const category = idsOf(doc.categories)[0]
  if (doc.slug && category) await upsertRedirect(req.payload, `/product/${doc.slug}`, 'categories', category, req)
  return doc
}

export const categoryAfterChange: CollectionAfterChangeHook<Category> = async ({ doc, previousDoc, req, context }) => {
  if (context.importing) return doc
  refresh(tags.categories, tags.category(doc.id), tags.products)
  if (context.skipSeo) return doc
  if (previousDoc?.slug && doc.slug && previousDoc.slug !== doc.slug) {
    await upsertRedirect(req.payload, `/shop/${previousDoc.slug}`, 'categories', doc.id, req)
  }
  afterSave(req, 'categories', doc.id, locales.map((l) => paths.category(l, doc.slug ?? '')))
  return doc
}

export const pageAfterChange: CollectionAfterChangeHook<Page> = async ({ doc, req, context }) => {
  refresh(tags.pages)
  if (context.skipSeo) return doc
  const published = doc._status === 'published'
  afterSave(req, 'pages', doc.id, published ? locales.map((l) => paths.page(l, doc.slug ?? '')) : [])
  return doc
}

export const refreshAfterChange =
  (...tagList: string[]): CollectionAfterChangeHook =>
  ({ doc }) => {
    refresh(...tagList)
    return doc
  }

export const refreshAfterDelete =
  (...tagList: string[]): CollectionAfterDeleteHook =>
  ({ doc }) => {
    refresh(...tagList)
    return doc
  }

export const settingsAfterChange: GlobalAfterChangeHook = ({ doc }) => {
  refresh(tags.settings)
  return doc
}

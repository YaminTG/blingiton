import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import type { Product } from '@/payload-types'

import type { FinderProduct } from './finder'
import type { Locale } from './locales'
import { tags } from './tags'

const SOLD_DAYS = 180

/**
 * Every published piece in the finder's short form (src/lib/finder.ts), with what it sold in the
 * last 180 days. Refreshed when products change, and hourly for the sales.
 */
export const getFinderCatalog = unstable_cache(
  async (): Promise<FinderProduct[]> => {
    const payload = await getPayload({ config })
    const since = new Date(Date.now() - SOLD_DAYS * 86400_000).toISOString()
    const [products, categories, orders] = await Promise.all([
      payload.find({
        collection: 'products',
        locale: 'en',
        limit: 0,
        pagination: false,
        depth: 0,
        overrideAccess: false,
        select: {
          name: true,
          price: true,
          kind: true,
          categories: true,
          availability: true,
          stock: true,
          featured: true,
          keywords: true,
          shortDescription: true,
          personalization: { type: true, goldPlated: true, stones: true },
          finder: { forWhom: true, occasions: true, styles: true },
        },
      }),
      payload.find({ collection: 'categories', locale: 'en', limit: 0, pagination: false, depth: 0, overrideAccess: false, select: { slug: true } }),
      payload.find({
        collection: 'orders',
        where: { and: [{ createdAt: { greater_than_equal: since } }, { status: { in: ['processing', 'on-hold', 'completed'] } }] },
        limit: 0,
        pagination: false,
        depth: 0,
        select: { items: { product: true, quantity: true } },
      }),
    ])
    const slug = new Map(categories.docs.map((c) => [c.id, c.slug ?? '']))
    const sold = new Map<number, number>()
    for (const o of orders.docs)
      for (const it of o.items ?? []) {
        const id = typeof it.product === 'object' ? it.product?.id : it.product
        if (id) sold.set(id, (sold.get(id) ?? 0) + (it.quantity ?? 1))
      }
    return products.docs.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price ?? 0,
      kind: p.kind,
      categories: (p.categories ?? []).map((c) => slug.get(typeof c === 'object' ? c.id : c) ?? '').filter(Boolean),
      personal: p.personalization?.type ?? 'none',
      gold: Boolean(p.personalization?.goldPlated),
      stones: p.personalization?.stones ?? 'none',
      availability: p.availability,
      // A piece counted in stock with none left can't be ordered.
      buyable: p.availability === 'made_to_order' || (p.availability === 'in_stock' && (typeof p.stock !== 'number' || p.stock > 0)),
      featured: Boolean(p.featured),
      sold: sold.get(p.id) ?? 0,
      text: [p.name, p.shortDescription, p.keywords].filter(Boolean).join(' · '),
      tags: { for: p.finder?.forWhom ?? [], occasions: p.finder?.occasions ?? [], styles: p.finder?.styles ?? [] },
    }))
  },
  ['finder-catalog', 'v2'],
  { tags: [tags.products], revalidate: 3600 },
)

/** The picked pieces in full, in the shopper's language and in the given order. */
export async function getProductsByIds(locale: Locale, ids: number[]): Promise<Product[]> {
  if (!ids.length) return []
  const payload = await getPayload({ config })
  const res = await payload.find({ collection: 'products', locale, where: { id: { in: ids } }, limit: ids.length, pagination: false, depth: 1, overrideAccess: false })
  const byId = new Map(res.docs.map((p) => [p.id, p]))
  return ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p))
}

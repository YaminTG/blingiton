import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { scoreProduct, type Score } from './score'

/** Number of approved reviews per product, for the given products (or all when `ids` is omitted). */
export async function approvedReviewCounts(payload: Payload, ids?: number[], req?: PayloadRequest) {
  const { docs } = await payload.find({
    collection: 'reviews',
    where: { approved: { equals: true }, ...(ids ? { product: { in: ids } } : {}) },
    select: { product: true },
    depth: 0,
    limit: 0,
    pagination: false,
    req,
  })
  const counts = new Map<number, number>()
  for (const r of docs) {
    const id = typeof r.product === 'object' ? r.product.id : r.product
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

/** Score a product read with locale: 'all', depth 1, looking up its approved reviews. */
export async function productScore(payload: Payload, doc: Parameters<typeof scoreProduct>[0], req?: PayloadRequest): Promise<Score> {
  const counts = await approvedReviewCounts(payload, [doc.id], req)
  return scoreProduct(doc, counts.get(doc.id) ?? 0)
}

/**
 * Write just the score, on the product and on its latest version (the admin list reads versions,
 * since products have drafts). No hooks run and no new version is created.
 */
export async function storeScores(payload: Payload, scores: Map<number, number>) {
  if (!scores.size) return
  const values = sql.join([...scores].map(([id, score]) => sql`(${id}::int, ${score}::numeric)`), sql`, `)
  await payload.db.drizzle.execute(sql`update products p set seo_score = v.score from (values ${values}) as v(id, score) where p.id = v.id`)
  await payload.db.drizzle.execute(
    sql`update _products_v p set version_seo_score = v.score from (values ${values}) as v(id, score) where p.parent_id = v.id and p.latest = true`,
  )
}

/** Recompute and store one product's score without touching anything else (e.g. after a review changes). */
export async function refreshProductScore(payload: Payload, id: number, req?: PayloadRequest) {
  const doc = await payload.findByID({ collection: 'products', id, locale: 'all', depth: 1, draft: true, req, disableErrors: true })
  if (!doc) return
  const { score } = await productScore(payload, doc, req)
  if (doc.seoScore !== score) await storeScores(payload, new Map([[id, score]]))
}

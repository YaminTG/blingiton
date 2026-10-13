// Customer reviews from the order email (link and checks: reviewCheck.ts). Reviews are saved
// unapproved and marked as a verified purchase; the shop approves them in the admin.

import type { Payload } from 'payload'

import type { Product } from '@/payload-types'

import { imageUrl, mediaOf } from './data'
import type { Locale } from './locales'
import { parseSubmission, ReviewError, validToken, type Submission } from './reviewCheck'
import { serverUrl } from './site'

export { ReviewError }

/** Orders can be reviewed once they've been sent. */
const REVIEWABLE = ['completed']

export type ReviewableItem = { id: number; name: string; image: string | null; reviewed: boolean }
export type Reviewable = { orderId: number; number: number; firstName: string; items: ReviewableItem[] }

/** The pieces in an order that can still be reviewed. Throws ReviewError('link' | 'not-ready'). */
export async function loadReviewable(payload: Payload, orderId: number, token: unknown, locale: Locale): Promise<Reviewable> {
  if (!validToken(orderId, token)) throw new ReviewError('link')
  const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!order) throw new ReviewError('link')
  if (!REVIEWABLE.includes(order.status)) throw new ReviewError('not-ready')

  const ids = [...new Set((order.items ?? []).map((it) => (typeof it.product === 'object' ? it.product?.id : it.product)).filter((x): x is number => typeof x === 'number'))]
  const [products, existing] = await Promise.all([
    ids.length
      ? payload.find({ collection: 'products', where: { id: { in: ids } }, locale, depth: 1, limit: ids.length, overrideAccess: true, select: { name: true, images: true } })
      : { docs: [] as Product[] },
    payload.find({ collection: 'reviews', where: { order: { equals: orderId } }, depth: 0, limit: 100, overrideAccess: true, select: { product: true } }),
  ])
  const reviewed = new Set(existing.docs.map((r) => (typeof r.product === 'object' ? r.product.id : r.product)))
  const byId = new Map((products.docs as Product[]).map((p) => [p.id, p]))
  const items = ids
    .map((id) => byId.get(id))
    .filter((p): p is Product => Boolean(p))
    .map((p) => ({ id: p.id, name: p.name, image: imageUrl(mediaOf(p.images?.[0]), 'thumb') ?? null, reviewed: reviewed.has(p.id) }))

  return { orderId, number: order.number ?? orderId, firstName: order.customer.name.split(/\s+/)[0] ?? '', items }
}

/** Saves the reviews (unapproved, verified purchase) and tells the shop. Returns how many were saved. */
export async function submitReviews(payload: Payload, raw: unknown): Promise<number> {
  const s = parseSubmission(raw)
  const order = await loadReviewable(payload, s.orderId, s.token, s.locale)
  const open = new Set(order.items.filter((i) => !i.reviewed).map((i) => i.id))
  const todo = s.reviews.filter((r) => open.has(r.product))
  if (!todo.length) throw new ReviewError(s.reviews.every((r) => order.items.some((i) => i.id === r.product)) ? 'done' : 'invalid')

  const date = new Date().toISOString()
  for (const r of todo) {
    await payload.create({
      collection: 'reviews',
      overrideAccess: true,
      data: {
        product: r.product,
        order: s.orderId,
        author: s.author,
        rating: r.rating,
        body: r.body || undefined,
        language: s.locale,
        date,
        approved: false,
        verifiedPurchase: true,
        source: 'site',
      },
    })
  }
  await notifyShop(payload, order, todo, s.author).catch((err) => console.error('[review-email]', err))
  return todo.length
}

async function notifyShop(payload: Payload, order: Reviewable, saved: Submission['reviews'], author: string) {
  const settings = await payload.findGlobal({ slug: 'site-settings', locale: 'en', depth: 0 })
  if (!settings.email) return
  const name = (id: number) => order.items.find((i) => i.id === id)?.name ?? `#${id}`
  const link = `${serverUrl}/admin/collections/reviews?where[approved][equals]=false`
  const lines = [
    `${author} reviewed order #${order.number}. ${saved.length === 1 ? 'It waits' : 'They wait'} for your approval before showing on the site.`,
    '',
    ...saved.flatMap((r) => [`${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}  ${name(r.product)}`, ...(r.body ? [`   “${r.body}”`] : []), '']),
    `Approve them here: ${link}`,
  ]
  await payload.sendEmail({ to: settings.email, subject: `New review${saved.length === 1 ? '' : 's'} to approve · order #${order.number}`, text: lines.join('\n') })
}

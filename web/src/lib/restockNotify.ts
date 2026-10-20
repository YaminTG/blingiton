import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { Product, RestockRequest } from '@/payload-types'

import { resolve } from './choices'
import { imageUrl, mediaOf, toBagProduct } from './data'
import { dictionary } from './dictionary'
import { recordSignal } from './healthSignal'
import type { Locale } from './locales'
import { describeChoices, isBack, parseRequest, targetFor, type StockFacts } from './restock'
import { serverUrl } from './site'
import { money, paths } from './urls'

/**
 * Back-in-stock requests, server side (rules in src/lib/restock.ts).
 *
 * `createRequest` saves a request from the product page, once per product + combination + email.
 * `notifyRestocks` emails everyone whose piece can genuinely be ordered again. It runs right after a
 * product is saved (src/lib/restockTask.ts `restockAfterChange`) and hourly as a safety net. Each
 * request is claimed in the database before its email goes out (waiting → notified, only if still
 * waiting), so two runs at once can't email the same person; a failed send puts it back.
 * One email per person and piece, even if they asked for two combinations that both came back.
 */

const MAX_EMAILS_PER_RUN = 100
const FORGET_EMAIL_DAYS = 90
const EXPIRE_DAYS = 365
const DAY = 86400_000

/** What the rules need, from a product read in the shopper's language. */
export function stockFacts(p: Product): StockFacts {
  const bag = toBagProduct(p)
  return {
    published: p._status === 'published',
    availability: p.availability,
    stock: typeof p.stock === 'number' ? p.stock : null,
    oneOff: p.restock === 'one_off',
    price: p.price,
    questions: bag.questions,
    variants: bag.variants,
  }
}

export type RequestResult = 'saved' | 'already' | 'available' | 'not-offered' | 'invalid'

export async function createRequest(payload: Payload, body: unknown): Promise<RequestResult> {
  const req = parseRequest(body)
  if (!req) return 'invalid'
  // Published products only, read as a visitor, in the shopper's language (for the choice names).
  const { docs } = await payload.find({ collection: 'products', where: { id: { equals: req.product } }, locale: req.locale, limit: 1, depth: 1, overrideAccess: false })
  const product = docs[0]
  if (!product) return 'invalid'
  const facts = stockFacts(product)
  const target = targetFor(facts, req.answers)
  if (target.kind === 'available' || target.kind === 'not-offered') return target.kind

  const variant = target.kind === 'variant' ? target.variantId : null
  const existing = await payload.count({
    collection: 'restock-requests',
    where: {
      and: [
        { product: { equals: product.id } },
        { email: { equals: req.email } },
        { status: { equals: 'waiting' } },
        variant ? { variant: { equals: variant } } : { variant: { exists: false } },
      ],
    },
  })
  if (existing.totalDocs) return 'already'

  await payload.create({
    collection: 'restock-requests',
    data: {
      product: product.id,
      email: req.email,
      locale: req.locale,
      variant,
      choices: target.kind === 'variant' ? target.answers : null,
      wanted: target.kind === 'variant' ? describeChoices(facts.questions, target.answers) : null,
      status: 'waiting',
    },
    overrideAccess: true,
    depth: 0,
  })
  return 'saved'
}

// --- Notifying -----------------------------------------------------------------------------------

const db = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle
const idList = (ids: number[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `)

/** Marks these requests notified if they're still waiting; returns the ones this run got. */
async function claim(payload: Payload, ids: number[]): Promise<number[]> {
  if (!ids.length) return []
  const res = (await db(payload).execute(
    sql`update restock_requests set status = 'notified', notified_at = now() where id in (${idList(ids)}) and status = 'waiting' returning id`,
  )) as unknown as { rows: { id: number }[] }
  return res.rows.map((r) => Number(r.id))
}

async function release(payload: Payload, ids: number[]) {
  if (ids.length) await db(payload).execute(sql`update restock_requests set status = 'waiting', notified_at = null where id in (${idList(ids)})`)
}

/** Emails everyone whose piece is back. `productIds` limits it to those products. Returns emails sent. */
export async function notifyRestocks(payload: Payload, productIds?: number[]): Promise<number> {
  const { docs: waiting } = await payload.find({
    collection: 'restock-requests',
    where: { and: [{ status: { equals: 'waiting' } }, ...(productIds?.length ? [{ product: { in: productIds } }] : [])] },
    sort: 'createdAt',
    limit: 2000,
    pagination: false,
    depth: 0,
  })
  const byProduct = new Map<number, RestockRequest[]>()
  for (const r of waiting) {
    const id = typeof r.product === 'object' ? r.product.id : r.product
    if (r.email) byProduct.set(id, [...(byProduct.get(id) ?? []), r])
  }

  let sent = 0
  for (const [productId, requests] of byProduct) {
    if (sent >= MAX_EMAILS_PER_RUN) break
    // The live (published) product only.
    const live = (await payload.find({ collection: 'products', where: { id: { equals: productId } }, locale: 'en', limit: 1, depth: 0, overrideAccess: false })).docs[0]
    if (!live) continue
    const facts = stockFacts(live)
    const back = requests.filter((r) => isBack(facts, r.variant ?? null))
    if (!back.length) continue

    // One email per person for this piece, in the language they asked in.
    const byEmail = new Map<string, RestockRequest[]>()
    for (const r of back) byEmail.set(r.email!.toLowerCase(), [...(byEmail.get(r.email!.toLowerCase()) ?? []), r])
    const inLocale = new Map<Locale, Product>()
    for (const [email, list] of byEmail) {
      if (sent >= MAX_EMAILS_PER_RUN) break
      const ids = await claim(payload, list.map((r) => r.id))
      if (!ids.length) continue
      const mine = list.filter((r) => ids.includes(r.id))
      const locale: Locale = mine[0].locale === 'ar' ? 'ar' : 'en'
      if (!inLocale.has(locale)) {
        const doc = (await payload.find({ collection: 'products', where: { id: { equals: productId } }, locale, limit: 1, depth: 1, overrideAccess: false })).docs[0]
        if (doc) inLocale.set(locale, doc)
      }
      const product = inLocale.get(locale)
      if (!product) {
        await release(payload, ids)
        continue
      }
      try {
        await payload.sendEmail({ to: email, ...backInStockEmail(product, mine, locale) })
        sent++
      } catch (err) {
        await release(payload, ids)
        await recordSignal(payload, { kind: 'email-failed', detail: `back-in-stock email for product #${productId}: ${err instanceof Error ? err.message : String(err)}` })
      }
    }
  }
  return sent
}

/** Forget emails 90 days after they were used (the request stays as a count), and expire year-old waits. */
export async function pruneRequests(payload: Payload, now = Date.now()) {
  const forget = new Date(now - FORGET_EMAIL_DAYS * DAY).toISOString()
  const expire = new Date(now - EXPIRE_DAYS * DAY).toISOString()
  await db(payload).execute(sql`update restock_requests set email = null where email is not null and status <> 'waiting' and coalesce(notified_at, updated_at) < ${forget}`)
  await db(payload).execute(sql`update restock_requests set status = 'cancelled' where status = 'waiting' and created_at < ${expire}`)
}

// --- The email -----------------------------------------------------------------------------------

const esc = (s: string | null | undefined) => (s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
const PINK = '#c8336f'
const INK = '#4e0f2a'
const MUTED = '#7a5a66'

export function backInStockEmail(product: Product, requests: Pick<RestockRequest, 'choices' | 'wanted'>[], locale: Locale) {
  const m = dictionary(locale).notify.mail
  const ar = locale === 'ar'
  const dir = ar ? 'rtl' : 'ltr'
  const font = ar ? "Tahoma, 'Segoe UI', Arial, sans-serif" : "'Helvetica Neue', Arial, sans-serif"
  const facts = stockFacts(product)
  const wanted = requests.map((r) => r.wanted).filter((w): w is string => Boolean(w))
  // The price of what they wanted: the first combination's, else the piece's.
  const answers = (requests.find((r) => r.choices)?.choices ?? {}) as Record<string, string>
  const picked = resolve(facts.price, facts.questions, facts.variants, answers)
  const price = picked.price
  const link = `${serverUrl}${paths.product(locale, product.slug ?? '')}?utm_source=restock&utm_medium=email&utm_campaign=back-in-stock`
  // The photo of what they picked (e.g. the Orange design), else the piece's main photo.
  const photo = picked.photo?.large ?? imageUrl(mediaOf(product.images?.[0]), 'card')
  const photoUrl = photo ? (photo.startsWith('http') ? photo : `${serverUrl}${photo}`) : null
  const few = product.availability === 'in_stock' && typeof product.stock === 'number' && product.stock <= 3
  const subject = m.subject(product.name)

  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#fdebee;font-family:${font};color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdebee"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden">
  <tr><td align="center" style="background:${PINK};padding:22px"><img src="${serverUrl}/apple-icon.png" width="72" height="72" alt="Blingiton" style="display:block;border-radius:50%"></td></tr>
  <tr><td style="padding:28px 28px 8px">
    <h1 style="margin:0 0 10px;font-size:24px;line-height:1.3;color:${INK}">${esc(m.heading)}</h1>
    <p style="margin:0;font-size:15px;line-height:1.6">${esc(m.intro(product.name))}</p>
  </td></tr>
  ${photoUrl ? `<tr><td style="padding:12px 28px 0"><a href="${esc(link)}"><img src="${esc(photoUrl)}" width="464" alt="${esc(product.name)}" style="display:block;width:100%;height:auto;border-radius:14px"></a></td></tr>` : ''}
  <tr><td style="padding:16px 28px 0">
    <div style="font-size:18px;font-weight:800">${esc(product.name)}</div>
    ${wanted.map((w) => `<div style="margin-top:4px;font-size:14px;color:${MUTED}">${esc(w)}</div>`).join('')}
    <div style="margin-top:8px;font-size:17px;font-weight:800;color:${PINK}">${esc(money(price, locale))}</div>
    ${few ? `<div style="margin-top:6px;font-size:14px;color:${INK}">${esc(m.few)}</div>` : ''}
  </td></tr>
  <tr><td style="padding:20px 28px 8px"><a href="${esc(link)}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:${PINK};color:#ffffff;font-weight:800;text-decoration:none">${esc(m.cta)}</a></td></tr>
  <tr><td style="padding:12px 28px 28px"><p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED}">${esc(m.once)}</p></td></tr>
</table>
</td></tr></table>
</body></html>`

  const text = [m.heading, '', m.intro(product.name), '', product.name, ...wanted, money(price, locale), ...(few ? [m.few] : []), '', `${m.cta}: ${link}`, '', m.once].join('\n')
  return { subject, html, text }
}

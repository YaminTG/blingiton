// Server side of the customer database (collection `customers`, rules in lib/customerStats.ts):
// linking orders to customers, keeping each customer's totals in step with their orders, and the
// "remember this device" consent behind browsing insights (lib/activity.ts).

import type { Payload, PayloadRequest, Where } from 'payload'

import type { Customer } from '@/payload-types'

import { CONSENT_VERSION, DEVICE_COOKIE, DEVICE_COOKIE_DAYS, FLAG_COOKIE } from './activity'
import { isPurchase, normalEmail, normalPhone, summarize, topKey } from './customerStats'
import { deviceToken, newDeviceId } from './customerToken'
import { serverUrl } from './site'

export type Who = { name?: string | null; email?: string | null; phone?: string | null; country?: string | null }

/**
 * The customer an order belongs to, created on first sight. Matched by email; without one (or with
 * no customer under it), by phone, but never onto a customer who has a different email: two people
 * can share a family phone.
 */
export async function linkCustomer(req: PayloadRequest, who: Who): Promise<number | null> {
  const email = normalEmail(who.email)
  const phoneKey = normalPhone(who.phone)
  if (!email && !phoneKey) return null
  const find = async (where: Where) =>
    (await req.payload.find({ collection: 'customers', where, sort: 'createdAt', limit: 1, depth: 0, select: { email: true }, req })).docs[0]?.id

  const found =
    (email && (await find({ email: { equals: email } }))) ||
    (phoneKey &&
      (await find(email ? { and: [{ phoneKey: { equals: phoneKey } }, { or: [{ email: { exists: false } }, { email: { equals: '' } }] }] } : { phoneKey: { equals: phoneKey } })))
  if (found) return found

  const created = await req.payload.create({
    collection: 'customers',
    data: { name: who.name?.trim() || email || who.phone || '–', email: email || undefined, phone: who.phone?.trim() || undefined, phoneKey: phoneKey || undefined, country: who.country || undefined },
    depth: 0,
    req,
    context: { customerStats: true },
  })
  return created.id
}

const idOf = (v: unknown) => (v && typeof v === 'object' && 'id' in v ? Number((v as { id: unknown }).id) : typeof v === 'number' ? v : null)

/** Re-counts a customer's orders, spending, dates, segment and favourite category from their orders. */
export async function refreshCustomer(payload: Payload, id: number) {
  const customer = await payload.findByID({ collection: 'customers', id, depth: 0, disableErrors: true })
  if (!customer) return
  const { docs: orders } = await payload.find({
    collection: 'orders',
    where: { customerRecord: { equals: id } },
    select: { status: true, total: true, createdAt: true, shipping: true, customer: true, items: true },
    sort: 'createdAt',
    depth: 0,
    limit: 0,
    pagination: false,
  })
  const s = summarize(orders.map((o) => ({ status: o.status, total: o.total, createdAt: o.createdAt, country: o.shipping?.country })))

  // Favourite category: the one they bought the most pieces from.
  const pieces = new Map<number, number>()
  for (const o of orders.filter((o) => isPurchase(o.status)))
    for (const it of o.items ?? []) {
      const pid = idOf(it.product)
      if (pid) pieces.set(pid, (pieces.get(pid) ?? 0) + (it.quantity ?? 1))
    }
  const byCategory = new Map<number, number>()
  if (pieces.size) {
    const products = await payload.find({ collection: 'products', where: { id: { in: [...pieces.keys()] } }, select: { categories: true }, depth: 0, limit: 0, pagination: false, draft: true })
    for (const p of products.docs) for (const c of p.categories ?? []) {
      const cid = idOf(c)
      if (cid) byCategory.set(cid, (byCategory.get(cid) ?? 0) + (pieces.get(p.id) ?? 0))
    }
  }

  // Contact details: whatever is missing comes from their latest order; staff edits are kept.
  const latest = orders.at(-1)?.customer
  await payload.update({
    collection: 'customers',
    id,
    data: {
      orderCount: s.orderCount,
      verifiedOrders: s.verifiedOrders,
      totalSpent: s.totalSpent,
      averageOrder: s.averageOrder,
      daysBetween: s.daysBetween,
      firstOrderAt: s.firstOrderAt,
      lastOrderAt: s.lastOrderAt,
      firstVerifiedAt: s.firstVerifiedAt,
      segment: s.segment,
      country: s.country ?? customer.country,
      favoriteCategory: topKey(byCategory),
      ...(!customer.email && normalEmail(latest?.email) ? { email: normalEmail(latest?.email) } : {}),
      ...(!customer.phone && latest?.phone ? { phone: latest.phone, phoneKey: normalPhone(latest.phone) || undefined } : {}),
    },
    depth: 0,
    context: { customerStats: true },
  })
}

export async function refreshCustomers(payload: Payload, ids: unknown[]) {
  for (const id of new Set(ids.map(idOf).filter((v): v is number => Boolean(v)))) {
    try {
      await refreshCustomer(payload, id)
    } catch (err) {
      payload.logger.error({ err, customer: id }, 'Could not refresh customer totals')
    }
  }
}

export type TrackingState = 'off' | 'waiting' | 'on'

/** off: never agreed (or withdrew). waiting: agreed, no completed order yet. on: browsing is recorded. */
export function trackingState(c: Pick<Customer, 'tracking' | 'verifiedOrders'> | null | undefined): TrackingState {
  if (!c?.tracking?.consent) return 'off'
  return (c.verifiedOrders ?? 0) >= 1 ? 'on' : 'waiting'
}

/** Records the customer's checkout consent and returns the signed cookie value for this device. */
export async function rememberDevice(payload: Payload, id: number, locale: string) {
  const c = await payload.findByID({ collection: 'customers', id, depth: 0 })
  const epoch = c.tracking?.epoch ?? 0
  await payload.update({
    collection: 'customers',
    id,
    data: { tracking: { consent: true, consentAt: new Date().toISOString(), source: `checkout (${locale})`, version: CONSENT_VERSION, withdrawnAt: null, epoch } },
    depth: 0,
    context: { customerStats: true },
  })
  return deviceToken({ customer: id, device: newDeviceId(), epoch })
}

/**
 * Stops browsing insights for a customer on every device (the epoch retires their cookies) and
 * deletes everything recorded. From /[locale]/your-data, or staff in the admin.
 */
export async function forgetCustomer(payload: Payload, id: number, req?: PayloadRequest) {
  const c = await payload.findByID({ collection: 'customers', id, depth: 0, disableErrors: true, req })
  if (!c) return
  await payload.update({
    collection: 'customers',
    id,
    data: { tracking: { ...c.tracking, consent: false, withdrawnAt: new Date().toISOString(), epoch: (c.tracking?.epoch ?? 0) + 1 } },
    depth: 0,
    req,
    context: { customerStats: true },
  })
  await payload.db.deleteMany({ collection: 'customer-activity', where: { customer: { equals: id } }, req })
}

const secure = serverUrl.startsWith('https:')

/** The device cookie (httpOnly) and the readable flag that tells the browser to report. */
export const deviceCookies = (token: string) => {
  const base = { path: '/', sameSite: 'lax' as const, secure, maxAge: DEVICE_COOKIE_DAYS * 86400 }
  return [
    { name: DEVICE_COOKIE, value: token, ...base, httpOnly: true },
    { name: FLAG_COOKIE, value: '1', ...base, httpOnly: false },
  ]
}

export const clearedCookies = () => [DEVICE_COOKIE, FLAG_COOKIE].map((name) => ({ name, value: '', path: '/', maxAge: 0 }))

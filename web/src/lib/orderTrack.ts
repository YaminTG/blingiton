// The customer's "where is my order" link. Like the review link (reviewCheck.ts), it carries the
// order id plus a signature made with PAYLOAD_SECRET, so only someone who got the email (or saw the
// thank-you page) can open it, and nothing needs storing. Kept free of database imports so the
// order emails and unit tests can use it.

import { createHmac, timingSafeEqual } from 'crypto'

import type { Order } from '@/payload-types'

import { dictionary } from './dictionary'
import type { Locale } from './locales'
import { serverUrl } from './site'
import { paths } from './urls'

export const trackToken = (orderId: number) =>
  createHmac('sha256', process.env.PAYLOAD_SECRET || '')
    .update(`track:${orderId}`)
    .digest('base64url')
    .slice(0, 22)

export function validTrackToken(orderId: number, token: unknown): boolean {
  if (!Number.isInteger(orderId) || orderId <= 0 || typeof token !== 'string') return false
  const a = Buffer.from(trackToken(orderId))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const trackPath = (locale: Locale, orderId: number) => `${paths.orderStatus(locale)}?o=${orderId}&t=${trackToken(orderId)}`
export const trackLink = (locale: Locale, orderId: number) => `${serverUrl}${trackPath(locale, orderId)}`

type Updatable = Pick<Order, 'id' | 'number' | 'locale' | 'status' | 'stage' | 'tracking'> & { customer?: { name?: string | null } | null }

/** The WhatsApp message staff send from the admin: where the order is, in the customer's language, with their order link. */
export function whatsappUpdate(order: Updatable) {
  const locale: Locale = order.locale === 'ar' ? 'ar' : 'en'
  const t = dictionary(locale)
  const first = order.customer?.name?.trim().split(/\s+/)[0] ?? ''
  const where =
    order.status === 'on-hold' && order.stage === 'paid'
      ? t.os.onHold
      : order.stage
        ? t.os.now[order.stage]
        : order.status === 'cancelled' || order.status === 'refunded' || order.status === 'pending' || order.status === 'failed'
          ? t.os[order.status]
          : ''
  const tracking = order.stage === 'shipped' && order.tracking?.number ? t.mail.trackingNo(order.tracking.number) : ''
  return [`${t.os.waHello(first)} ${t.mail.order(`#${order.number}`)}: ${where}`, tracking, `${t.os.waFollow} ${trackLink(locale, order.id)}`].filter(Boolean).join('\n')
}

/** A carrier's tracking page for a number, when we know the carrier's address pattern. */
export function carrierLink(carrier: string | null | undefined, number: string | null | undefined) {
  const n = number?.trim()
  if (!n) return null
  const q = encodeURIComponent(n)
  if (carrier === 'dhl') return `https://www.dhl.com/jo-en/home/tracking/tracking-express.html?submit=1&tracking-id=${q}`
  return null
}

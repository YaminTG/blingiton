import type { Payload } from 'payload'

import type { Order } from '@/payload-types'

import { optionLines, unitPrice, type CartItem, type LetterStyle } from './cart'
import { toBagProduct } from './data'
import { dictionary } from './dictionary'
import { isLocale, type Locale } from './locales'
import type { OrderStatus, PaymentMethod } from './orderOptions'
import { sanitizeOrigin } from './origin'

/** `gone`: a product in the bag was unpublished, deleted or sold out. `invalid`: anything else that fails the checks. */
export class OrderError extends Error {
  constructor(public code: 'invalid' | 'gone') {
    super(code)
  }
}

const STYLES: LetterStyle[] = ['script', 'classic', 'modern', 'kufi']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined)

/** Only the fields a bag line can have, with sane bounds; everything else from the browser is dropped. */
function cleanItem(raw: unknown): CartItem {
  if (!raw || typeof raw !== 'object') throw new OrderError('invalid')
  const r = raw as Record<string, unknown>
  const id = int(r.id, 1, Number.MAX_SAFE_INTEGER)
  const qty = int(r.qty, 1, 20)
  if (!id || !qty) throw new OrderError('invalid')
  const item: CartItem = { id, qty }
  const name = text(r.name, 80)
  if (name) item.name = name
  if (STYLES.includes(r.style as LetterStyle)) item.style = r.style as LetterStyle
  if (r.finish === 'silver' || r.finish === 'gold') item.finish = r.finish
  const chain = int(r.chain, 10, 120)
  if (chain) item.chain = chain
  if (r.stone === null) item.stone = null
  else if (int(r.stone, 0, 50) !== undefined) item.stone = r.stone as number
  const tsize = int(r.tsize, 30, 300)
  if (tsize) item.tsize = tsize
  if (r.choices && typeof r.choices === 'object') {
    item.choices = Object.fromEntries(
      Object.entries(r.choices as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'string')
        .slice(0, 20)
        .map(([k, v]) => [k.slice(0, 64), (v as string).slice(0, 64)]),
    )
  }
  if (r.gift === true) item.gift = true
  const note = text(r.note, 300)
  if (note) item.note = note
  return item
}

export type PlacedOrder = { number: number; total: number; status: OrderStatus; payment: PaymentMethod }

/**
 * Turns a checkout submission into an order. Prices, fees and the total are worked out here from
 * the database, never taken from the browser.
 */
export async function placeOrder(payload: Payload, body: unknown): Promise<PlacedOrder> {
  if (!body || typeof body !== 'object') throw new OrderError('invalid')
  const b = body as Record<string, unknown>
  const locale: Locale = typeof b.locale === 'string' && isLocale(b.locale) ? b.locale : 'en'
  const t = dictionary(locale)

  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50) throw new OrderError('invalid')
  const items = b.items.map(cleanItem)

  const c = (b.customer ?? {}) as Record<string, unknown>
  const customer = { name: text(c.name, 100), phone: text(c.phone, 30), email: text(c.email, 200).toLowerCase() }
  if (!customer.name || customer.phone.replace(/\D/g, '').length < 8 || !EMAIL.test(customer.email)) throw new OrderError('invalid')

  const s = (b.shipping ?? {}) as Record<string, unknown>
  const countryIndex = int(s.country, 0, dictionary('en').co.countries.length - 1)
  const city = text(s.city, 100)
  const address = text(s.address, 500)
  if (countryIndex === undefined || !city || !address) throw new OrderError('invalid')
  const jordan = countryIndex === 0
  const method: Order['shipping']['method'] = jordan ? (s.method === 'jordan' ? 'jordan' : 'amman') : 'intl'

  // Jordan: card or cash on delivery. Abroad: online card payment once HyperPay is connected;
  // until then the shop arranges payment on WhatsApp and the order waits "on hold".
  const payment: PaymentMethod = jordan ? (b.payment === 'cash' ? 'cash' : 'card_on_delivery') : 'whatsapp'
  const status: OrderStatus = payment === 'whatsapp' ? 'on-hold' : 'processing'

  // Published products only (read as a visitor), in the customer's language.
  const ids = [...new Set(items.map((i) => i.id))]
  const found = await payload.find({ collection: 'products', where: { id: { in: ids } }, locale, limit: ids.length, depth: 1, overrideAccess: false })
  const byId = new Map(found.docs.map((p) => [p.id, p]))
  if (ids.some((id) => !byId.has(id) || byId.get(id)!.availability === 'sold_out')) throw new OrderError('gone')

  const lines = items.map((it) => {
    const product = byId.get(it.id)!
    if (it.finish === 'gold' && !product.personalization?.goldPlated) it.finish = 'silver'
    const p = toBagProduct(product)
    return {
      product: product.id,
      name: product.name,
      quantity: it.qty,
      unitPrice: unitPrice(p, it),
      details: optionLines(it, p, t, locale === 'ar').map(([label, value]) => ({ label: label || undefined, value })),
    }
  })

  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  const fees = { amman: settings.delivery?.amman ?? 3, jordan: settings.delivery?.jordan ?? 5, intl: settings.delivery?.international ?? 15 }
  const origin = sanitizeOrigin(b.origin)

  const data = {
    status,
    locale,
    customer,
    shipping: { method, country: dictionary('en').co.countries[countryIndex], city, address },
    items: lines,
    deliveryFee: fees[method],
    payment: { method: payment },
    // null rather than missing, so the "Web admin" default (for orders made in the admin) doesn't apply.
    attribution: origin ?? { type: null },
  } as Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'title'>

  // Two orders at the same moment can pick the same next number; the unique index rejects one, which then retries.
  for (let attempt = 1; ; attempt++) {
    try {
      const order = await payload.create({ collection: 'orders', data })
      return { number: order.number!, total: order.total ?? 0, status, payment }
    } catch (err) {
      const unique = err instanceof Error && /unique|number/i.test(err.message)
      if (!unique || attempt >= 3) throw err
    }
  }
}

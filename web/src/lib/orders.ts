import type { Payload } from 'payload'

import type { Order } from '@/payload-types'

import { optionLines, resolveItem, unitPrice, type CartItem, type LetterStyle } from './cart'
import { toBagProduct } from './data'
import { dictionary } from './dictionary'
import { isLocale, type Locale } from './locales'
import type { OrderStatus, PaymentMethod } from './orderOptions'
import { sanitizeOrigin } from './origin'
import { countryByCode, deliveryFee, feesFrom, type Method } from './shipping'

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
  return item
}

const mediaId = (v: unknown) => (v && typeof v === 'object' && 'id' in v ? (v as { id: number }).id : (v ?? null))

/**
 * Takes the ordered pieces off the product's stock and its combinations' counts; a product that
 * reaches 0 becomes "sold out". Re-read fresh (not the visitor's cached copy) right before writing.
 * Not atomic: two orders in the same instant for the last piece can both go through.
 */
async function takeStock(payload: Payload, ids: number[], fromProduct: Map<number, number>, fromVariants: Map<number, Map<string, number>>) {
  for (const id of ids) {
    try {
      const doc = await payload.findByID({ collection: 'products', id, depth: 0 })
      const data: Record<string, unknown> = {}
      const qty = fromProduct.get(id)
      if (qty && typeof doc.stock === 'number') {
        data.stock = Math.max(0, doc.stock - qty)
        if (data.stock === 0) data.availability = 'sold_out'
      }
      const take = fromVariants.get(id)
      if (take) {
        // Whole rows, so nothing else in the combinations changes.
        const variants = (doc.personalization?.variants ?? []).map((v) => ({
          id: v.id,
          when: v.when,
          price: v.price,
          photo: mediaId(v.photo),
          stock: typeof v.stock === 'number' && v.id && take.has(v.id) ? Math.max(0, v.stock - take.get(v.id)!) : v.stock,
        }))
        data.personalization = { variants }
      }
      await payload.update({ collection: 'products', id, data: data as never, depth: 0, context: { skipSeo: true } })
    } catch (err) {
      // The order is placed either way; the shop fixes the count by hand.
      payload.logger.error({ err, product: id }, 'Could not update stock after an order')
    }
  }
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
  const country = countryByCode(s.country)
  const city = text(s.city, 100)
  const address = text(s.address, 500)
  if (!country || !city || !address) throw new OrderError('invalid')
  const jordan = country.zone === 'jordan'
  const method: Method = jordan ? (s.method === 'jordan' ? 'jordan' : 'amman') : s.method === 'intl_standard' ? 'intl_standard' : 'intl'

  // A gift card needs the words to write on it.
  const g = b.giftCard as Record<string, unknown> | null | undefined
  const giftMessage = g ? text(g.message, 300) : ''
  if (g && !giftMessage) throw new OrderError('invalid')

  // Jordan: card or cash on delivery. Abroad: online card payment once HyperPay is connected;
  // until then the shop arranges payment on WhatsApp and the order waits "on hold".
  const payment: PaymentMethod = jordan ? (b.payment === 'cash' ? 'cash' : 'card_on_delivery') : 'whatsapp'
  const status: OrderStatus = payment === 'whatsapp' ? 'on-hold' : 'processing'

  // Published products only (read as a visitor), in the customer's language.
  const ids = [...new Set(items.map((i) => i.id))]
  const found = await payload.find({ collection: 'products', where: { id: { in: ids } }, locale, limit: ids.length, depth: 1, overrideAccess: false })
  const byId = new Map(found.docs.map((p) => [p.id, p]))
  if (ids.some((id) => !byId.has(id) || byId.get(id)!.availability === 'sold_out')) throw new OrderError('gone')

  // Pieces each line takes: from the product (in-stock pieces) and from a combination's own count.
  const takeProduct = new Map<number, number>()
  const takeVariant = new Map<number, Map<string, number>>()

  const lines = items.map((it) => {
    const product = byId.get(it.id)!
    if (it.finish === 'gold' && !product.personalization?.goldPlated) it.finish = 'silver'
    const p = toBagProduct(product)
    if (p.soldOut) throw new OrderError('gone')
    // Every question needs an answer that is still on offer, and a name unless it's optional.
    const r = resolveItem(p, it)
    if (!r.complete) throw new OrderError('invalid')
    it.choices = Object.keys(r.answers).length ? r.answers : undefined
    if (p.type !== 'none' && !p.textOptional && !it.name) throw new OrderError('invalid')
    if (p.type === 'none') delete it.name

    if (product.availability === 'in_stock' && typeof product.stock === 'number') takeProduct.set(product.id, (takeProduct.get(product.id) ?? 0) + it.qty)
    if (r.stockVariant) {
      const m = takeVariant.get(product.id) ?? new Map<string, number>()
      m.set(r.stockVariant.id, (m.get(r.stockVariant.id) ?? 0) + it.qty)
      takeVariant.set(product.id, m)
    }
    return {
      product: product.id,
      name: product.name,
      quantity: it.qty,
      unitPrice: unitPrice(p, it),
      details: optionLines(it, p, t, locale === 'ar').map(([label, value]) => ({ label: label || undefined, value })),
    }
  })

  for (const [id, qty] of takeProduct) if (qty > (byId.get(id)!.stock ?? 0)) throw new OrderError('gone')
  for (const [id, m] of takeVariant) {
    const variants = byId.get(id)!.personalization?.variants ?? []
    for (const [vid, qty] of m) if (qty > (variants.find((v) => v.id === vid)?.stock ?? 0)) throw new OrderError('gone')
  }

  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  const fees = feesFrom(settings.delivery)
  const origin = sanitizeOrigin(b.origin)

  const data = {
    status,
    locale,
    customer,
    shipping: { method, country: country.en, city, address },
    items: lines,
    deliveryFee: deliveryFee(fees, country.zone, method),
    giftCardFee: giftMessage ? fees.giftCard : 0,
    giftMessage: giftMessage || undefined,
    payment: { method: payment },
    // null rather than missing, so the "Web admin" default (for orders made in the admin) doesn't apply.
    attribution: origin ?? { type: null },
  } as Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'title'>

  // Two orders at the same moment can pick the same next number; the unique index rejects one, which then retries.
  for (let attempt = 1; ; attempt++) {
    try {
      const order = await payload.create({ collection: 'orders', data })
      await takeStock(payload, [...new Set([...takeProduct.keys(), ...takeVariant.keys()])], takeProduct, takeVariant)
      return { number: order.number!, total: order.total ?? 0, status, payment }
    } catch (err) {
      const unique = err instanceof Error && /unique|number/i.test(err.message)
      if (!unique || attempt >= 3) throw err
    }
  }
}

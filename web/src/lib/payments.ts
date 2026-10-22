import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import { randomBytes } from 'crypto'
import type { Payload } from 'payload'

import { recordSignal } from './healthSignal'
import { checkoutPayment, classify, createCheckout, hyperpayConfig, HyperpayError, paymentsFor, widgetScript, type HyperpayPayment } from './hyperpay'
import { moveStock, type StockHeld } from './orders'
import { COUNTRIES } from './shipping'

// Online card payments (HyperPay) for orders waiting as "pending payment". An order becomes paid
// only on HyperPay's own word, asked for server side, by any of three routes, which all end in
// `settlePayment`:
// - the customer comes back to /pay/… and the page asks HyperPay how the checkout ended;
// - HyperPay's webhook (/payment/webhook), once HYPERPAY_WEBHOOK_KEY is set;
// - the `payment-check` job every 5 minutes, which looks up each pending order's reference, for
//   customers who paid and closed the tab. It also cancels orders left unpaid and puts their pieces back.
// Repeats are harmless: a single SQL update claims the payment, and only the run that claims it
// moves the order on (which sends the confirmation emails, once, through the Orders hooks).

/** An unpaid order is cancelled this long after the customer's last payment attempt. HyperPay checkouts last 30 minutes. */
export const PAY_WINDOW_MS = 60 * 60_000
/** Past this, an order still pending is cancelled even if HyperPay reports a payment as waiting (an abandoned 3-D Secure step). */
const PAY_GIVE_UP_MS = 24 * 3600_000

const db = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle
type Rows<T> = { rows: T[] }

export type StartResult = { kind: 'form'; checkoutId: string; integrity: string | null; script: string } | { kind: 'paid' } | { kind: 'closed' }

/**
 * A new HyperPay checkout for the order's total, for the card form. Each attempt (a retry after a
 * declined card too) gets a new checkout under the order's one reference. `paid`: nothing left to
 * pay. `closed`: not an order to pay online, or cancelled.
 */
export async function startPayment(payload: Payload, id: number): Promise<StartResult> {
  const cfg = hyperpayConfig()
  if (!cfg) throw new HyperpayError('HyperPay is not set up (HYPERPAY_* settings)')
  const order = await payload.findByID({ collection: 'orders', id, depth: 0, disableErrors: true })
  if (!order || order.payment.method !== 'card_online') return { kind: 'closed' }
  if (order.payment.paidAt) return { kind: 'paid' }
  if (order.status !== 'pending') return { kind: 'closed' }

  // Order number plus a random part: test and live databases both start at 20001, and the
  // reference must find only this order's payments in HyperPay. Set once; two tabs agree on it.
  const res = (await db(payload).execute(
    sql`update orders set payment_reference = coalesce(payment_reference, ${`${order.number}-${randomBytes(4).toString('hex')}`}) where id = ${id} returning payment_reference`,
  )) as unknown as Rows<{ payment_reference: string }>
  const reference = res.rows[0].payment_reference

  const { checkoutId, integrity } = await createCheckout(cfg, {
    amount: order.total ?? 0,
    reference,
    email: order.customer.email ?? '',
    name: order.customer.name,
    country: COUNTRIES.find((c) => c.en === order.shipping.country)?.code,
    city: order.shipping.city,
    street: order.shipping.address,
  })
  await db(payload).execute(sql`update orders set payment_checkout_id = ${checkoutId}, payment_checkout_at = now() where id = ${id}`)
  return { kind: 'form', checkoutId, integrity, script: widgetScript(cfg, checkoutId) }
}

export type Settled = 'paid' | 'pending' | 'failed' | 'ignored'

/**
 * Applies what HyperPay says about a payment to the order. Only a payment made under this order's
 * reference counts. A successful one marks the order paid ("processing"), even if it had been
 * cancelled meanwhile for not being paid: the money was taken, so the order goes ahead with a note
 * for the team. A declined one is noted, and the customer can try again until the order expires.
 */
export async function settlePayment(payload: Payload, id: number, p: HyperpayPayment, via: 'return' | 'webhook' | 'check'): Promise<Settled> {
  const order = await payload.findByID({ collection: 'orders', id, depth: 0, disableErrors: true })
  if (!order || order.payment.method !== 'card_online') return 'ignored'
  const { outcome, review } = classify(p.result?.code)
  const ours = Boolean(order.payment.reference) && p.merchantTransactionId === order.payment.reference
  if (outcome === 'pending') return 'pending'
  if (!ours) return outcome === 'failed' ? 'failed' : 'ignored'
  const code = p.result?.code ?? null
  const description = p.result?.description?.slice(0, 250) ?? null

  if (outcome === 'failed') {
    await db(payload).execute(sql`update orders set payment_result_code = ${code}, payment_result_description = ${description} where id = ${id} and payment_paid_at is null`)
    return 'failed'
  }

  // Claim it. A claim older than 2 minutes on an order still pending means the run that made it
  // stopped halfway, so it's taken over.
  const claimed = (await db(payload).execute(
    sql`update orders set payment_paid_at = now() where id = ${id} and (payment_paid_at is null or (status = 'pending' and payment_paid_at < now() - interval '2 minutes')) returning id`,
  )) as unknown as Rows<{ id: number }>
  if (!claimed.rows.length) return 'paid'

  const notes: string[] = []
  const amount = Number(p.amount)
  if (p.paymentType !== 'DB' || p.currency !== 'JOD' || amount !== (order.total ?? 0)) {
    notes.push(`⚠ HyperPay took ${p.amount} ${p.currency} (${p.paymentType}) but the order total is ${order.total} JOD. Check payment ${p.id} in the HyperPay merchant area.`)
    await recordSignal(payload, { kind: 'checkout-error', path: `order:${id}`, detail: `HyperPay amount ${p.amount} ${p.currency} ≠ total ${order.total} JOD on #${order.number}` })
  }
  if (review) notes.push(`⚠ HyperPay accepted this payment but suggests a manual look (${code}: ${description}). Check payment ${p.id} in the merchant area before shipping.`)
  let held = order.stockHeld as (StockHeld & { released?: boolean }) | null
  // Orders the team already moved on by hand (processing, completed…) keep their status.
  const reopen = order.status === 'cancelled' || order.status === 'failed'
  if (reopen) notes.push(`Paid online after the order was marked ${order.status}, so it was reopened.${held?.released ? ' Its pieces were taken off the stock again: check none were sold meanwhile.' : ''}`)
  else if (order.status !== 'pending') notes.push(`Paid online (HyperPay) while the order was already ${order.status}.`)
  if (reopen && held?.released) {
    await moveStock(payload, held, -1)
    held = { ...held, released: false }
  }

  await payload.update({
    collection: 'orders',
    id,
    data: {
      status: order.status === 'pending' || reopen ? 'processing' : order.status,
      payment: {
        ...order.payment,
        paidAt: new Date().toISOString(),
        transactionId: p.id ?? null,
        resultCode: code,
        resultDescription: description,
        cardBrand: p.paymentBrand ?? null,
        cardLast4: p.card?.last4Digits ?? null,
      },
      stockHeld: held,
      ...(notes.length ? { note: [order.note, ...notes].filter(Boolean).join('\n') } : {}),
    },
  })
  payload.logger.info({ order: order.number, via, payment: p.id }, 'HyperPay payment confirmed')
  return 'paid'
}

/** The return page: asks HyperPay how this checkout ended and applies it. */
export async function verifyCheckout(payload: Payload, id: number, checkoutId: string): Promise<Settled> {
  const cfg = hyperpayConfig()
  if (!cfg) return 'ignored'
  return settlePayment(payload, id, await checkoutPayment(cfg, checkoutId), 'return')
}

/** The webhook: the order is found by the payment's reference. */
export async function settleByReference(payload: Payload, p: HyperpayPayment): Promise<Settled> {
  if (!p.merchantTransactionId) return 'ignored'
  const { docs } = await payload.find({ collection: 'orders', where: { 'payment.reference': { equals: p.merchantTransactionId } }, limit: 1, depth: 0, select: { number: true } })
  return docs[0] ? settlePayment(payload, docs[0].id, p, 'webhook') : 'ignored'
}

const NOT_PAID = 'Cancelled automatically: the online payment wasn’t completed. Its pieces went back to the stock.'

/** Cancels an order still unpaid and puts its pieces back. False when it was paid (or changed) meanwhile. */
async function expire(payload: Payload, id: number) {
  const res = (await db(payload).execute(
    sql`update orders set status = 'cancelled', note =concat_ws(E'\n', nullif(note, ''), ${NOT_PAID}::text) where id = ${id} and status = 'pending' and payment_paid_at is null returning stock_held`,
  )) as unknown as Rows<{ stock_held: (StockHeld & { released?: boolean }) | null }>
  if (!res.rows.length) return false
  const held = res.rows[0].stock_held
  if (held && !held.released) {
    await moveStock(payload, held, 1)
    await db(payload).execute(sql`update orders set stock_held = ${JSON.stringify({ ...held, released: true })}::jsonb where id = ${id}`)
  }
  return true
}

/**
 * Every 5 minutes: for each order waiting for an online payment, ask HyperPay for the payments under
 * its reference. Paid → settled. Nothing paid an hour after the last attempt → cancelled.
 */
export async function checkPayments(payload: Payload, now = Date.now()) {
  const cfg = hyperpayConfig()
  if (!cfg) return { checked: 0, paid: 0, expired: 0 }
  const { docs } = await payload.find({
    collection: 'orders',
    where: { and: [{ 'payment.method': { equals: 'card_online' } }, { status: { equals: 'pending' } }] },
    sort: 'createdAt',
    limit: 100,
    depth: 0,
    select: { createdAt: true, payment: true },
  })
  let paid = 0
  let expired = 0
  for (const o of docs) {
    try {
      const found = o.payment.reference ? await paymentsFor(cfg, o.payment.reference) : []
      // A success wins over earlier declined tries.
      const success = found.find((p) => classify(p.result?.code).outcome === 'paid')
      if (success) {
        if ((await settlePayment(payload, o.id, success, 'check')) === 'paid') paid++
        continue
      }
      const waiting = found.some((p) => classify(p.result?.code).outcome === 'pending')
      const idle = now - new Date(o.payment.checkoutAt ?? o.createdAt).getTime()
      if (((!waiting && idle > PAY_WINDOW_MS) || now - new Date(o.createdAt).getTime() > PAY_GIVE_UP_MS) && (await expire(payload, o.id))) expired++
    } catch (err) {
      payload.logger.error({ err, order: o.id }, 'Could not check an online payment')
    }
  }
  return { checked: docs.length, paid, expired }
}

// HyperPay (Open Payment Platform, "COPYandPAY"): the card form is HyperPay's own widget, so card
// numbers never touch this server. Server side we create a checkout for the order's total, then ask
// HyperPay how it ended. No database imports here, so the unit tests can use it.
// Docs: https://hyperpay.docs.oppwa.com/integrations/widget

import { createDecipheriv } from 'crypto'

export type HyperpayConfig = { base: string; token: string; entityId: string; test: boolean }

/** From HYPERPAY_* in the environment; null until they're filled in (card payment is then off). */
export function hyperpayConfig(): HyperpayConfig | null {
  const base = process.env.HYPERPAY_BASE_URL?.replace(/\/+$/, '')
  const token = process.env.HYPERPAY_TOKEN
  const entityId = process.env.HYPERPAY_ENTITY_ID
  if (!base || !token || !entityId) return null
  return { base, token, entityId, test: /test/.test(base) }
}

export type Outcome = 'paid' | 'pending' | 'failed'

/**
 * What a result code means, from HyperPay's list: 000.000.*, 000.100.1*, 000.3*, 000.6* and
 * 000.400.110/120 are successful; 000.400.0xx (not 03x) and 000.400.100 went through but HyperPay
 * suggests a manual look (`review`); 000.200.* and a few 3-D Secure codes are still pending.
 * Everything else failed.
 */
export function classify(code: string | null | undefined): { outcome: Outcome; review: boolean } {
  const c = code ?? ''
  if (/^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.1[12]0)/.test(c)) return { outcome: 'paid', review: false }
  if (/^(000\.400\.0[^3]|000\.400\.100)/.test(c)) return { outcome: 'paid', review: true }
  if (/^(000\.200|800\.400\.5|100\.400\.500)/.test(c)) return { outcome: 'pending', review: false }
  return { outcome: 'failed', review: false }
}

/** Amounts go as "25.00". The test server only approves whole amounts, and our prices are whole JOD. */
export const amountOf = (jod: number) => jod.toFixed(2)

export type CheckoutInput = {
  amount: number
  /** Our id for the payment (merchantTransactionId): the order number plus a random part. */
  reference: string
  email: string
  name: string
  /** ISO alpha-2. Our "Other country" rows have no code, so they send none. */
  country?: string | null
  city?: string | null
  street?: string | null
  state?: string | null
  postcode?: string | null
}

const clip = (v: string | null | undefined, max: number) => (v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** The form fields for POST /v1/checkouts, as HyperPay asked for them. Empty billing fields are left out. */
export function checkoutParams(cfg: Pick<HyperpayConfig, 'entityId' | 'test'>, o: CheckoutInput) {
  const words = clip(o.name, 100).split(' ').filter(Boolean)
  const given = words[0] ?? ''
  const p = new URLSearchParams({
    entityId: cfg.entityId,
    amount: amountOf(o.amount),
    currency: 'JOD',
    paymentType: 'DB',
    // The widget script is then loaded with a Subresource Integrity hash (`integrity` in the reply).
    integrity: 'true',
    merchantTransactionId: o.reference,
    'customer.email': clip(o.email, 128),
    'customer.givenName': given.slice(0, 48),
    'customer.surname': (words.slice(1).join(' ') || given).slice(0, 48),
  })
  const country = (o.country ?? '').toUpperCase()
  if (/^[A-Z]{2}$/.test(country) && country !== 'XX') p.set('billing.country', country)
  const billing = { 'billing.street1': clip(o.street, 100), 'billing.city': clip(o.city, 48), 'billing.state': clip(o.state || o.city, 40), 'billing.postcode': clip(o.postcode, 16) }
  for (const [k, v] of Object.entries(billing)) if (v) p.set(k, v)
  if (cfg.test) {
    p.set('testMode', 'EXTERNAL')
    p.set('customParameters[3DS2_enrolled]', 'true')
  }
  return p
}

/** A payment as HyperPay reports it (status call, transaction query or webhook). */
export type HyperpayPayment = {
  id?: string
  paymentType?: string
  paymentBrand?: string
  amount?: string
  currency?: string
  merchantTransactionId?: string
  /** The checkout id the payment was made in. */
  ndc?: string
  result?: { code?: string; description?: string }
  card?: { last4Digits?: string }
}

export class HyperpayError extends Error {}

async function call(cfg: HyperpayConfig, path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch(`${cfg.base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${cfg.token}`, ...init?.headers },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    throw new HyperpayError(`HyperPay unreachable: ${err instanceof Error ? err.message : String(err)}`)
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) throw new HyperpayError(`HyperPay answered ${res.status} without JSON`)
  return body
}

/** Starts a payment. Returns the checkout id and the hash the widget script must be loaded with. */
export async function createCheckout(cfg: HyperpayConfig, input: CheckoutInput) {
  const body = await call(cfg, '/v1/checkouts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: checkoutParams(cfg, input),
  })
  const result = body.result as HyperpayPayment['result']
  if (typeof body.id !== 'string' || !/^000\.200\.100/.test(result?.code ?? '')) {
    throw new HyperpayError(`HyperPay refused the checkout: ${result?.code ?? '?'} ${result?.description ?? ''}`.trim())
  }
  return { checkoutId: body.id, integrity: typeof body.integrity === 'string' ? body.integrity : null }
}

/** How the payment in this checkout ended. HyperPay allows this for 30 minutes after the checkout. */
export async function checkoutPayment(cfg: HyperpayConfig, checkoutId: string): Promise<HyperpayPayment> {
  return (await call(cfg, `/v1/checkouts/${encodeURIComponent(checkoutId)}/payment?entityId=${encodeURIComponent(cfg.entityId)}`)) as HyperpayPayment
}

/** Every payment made under our reference, at any time. "Cannot find transaction" gives an empty list. */
export async function paymentsFor(cfg: HyperpayConfig, reference: string): Promise<HyperpayPayment[]> {
  const body = await call(cfg, `/v1/query?entityId=${encodeURIComponent(cfg.entityId)}&merchantTransactionId=${encodeURIComponent(reference)}`)
  if (Array.isArray(body.payments)) return body.payments as HyperpayPayment[]
  const code = (body.result as HyperpayPayment['result'])?.code ?? ''
  if (code === '700.400.580') return []
  if (typeof body.id === 'string') return [body as HyperpayPayment]
  throw new HyperpayError(`HyperPay query failed: ${code}`)
}

export const widgetScript = (cfg: HyperpayConfig, checkoutId: string) => `${cfg.base}/v1/paymentWidgets.js?checkoutId=${encodeURIComponent(checkoutId)}`

/**
 * A webhook notification, decrypted. HyperPay encrypts the body with AES-256-GCM using the secret
 * from the merchant area (hex), and sends the IV and tag as headers. Throws when it doesn't check out,
 * so a forged call can't mark anything paid.
 */
export function decryptWebhook(keyHex: string, ivHex: string, tagHex: string, body: string): { type?: string; payload?: HyperpayPayment } {
  let hex = body.trim()
  if (hex.startsWith('{')) hex = String((JSON.parse(hex) as { encryptedBody?: unknown }).encryptedBody ?? '')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const text = Buffer.concat([decipher.update(Buffer.from(hex, 'hex')), decipher.final()]).toString('utf8')
  return JSON.parse(text)
}

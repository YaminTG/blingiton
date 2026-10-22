import config from '@payload-config'
import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { decryptWebhook } from '@/lib/hyperpay'
import { settleByReference } from '@/lib/payments'

/**
 * HyperPay's payment notifications. Set up in the HyperPay merchant area (Administration →
 * Webhooks) with this address; the secret it shows goes in HYPERPAY_WEBHOOK_KEY. Only bodies that
 * decrypt with that secret are read, so nobody else can mark an order paid. Without the key this
 * answers 503 and the `payment-check` job does the same work, a few minutes later.
 */
export async function POST(request: NextRequest) {
  const key = process.env.HYPERPAY_WEBHOOK_KEY
  if (!key) return new Response(null, { status: 503 })
  const iv = request.headers.get('x-initialization-vector')
  const tag = request.headers.get('x-authentication-tag')
  const body = await request.text()

  let note: ReturnType<typeof decryptWebhook>
  try {
    if (!iv || !tag) throw new Error('missing headers')
    note = decryptWebhook(key, iv, tag, body)
  } catch {
    return new Response(null, { status: 400 })
  }

  if (note.type === 'PAYMENT' && note.payload) {
    try {
      await settleByReference(await getPayload({ config }), note.payload)
    } catch (err) {
      // 500 makes HyperPay send it again later.
      console.error('[payment/webhook]', err)
      return new Response(null, { status: 500 })
    }
  }
  return new Response(null, { status: 200 })
}

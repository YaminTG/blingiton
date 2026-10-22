import { createCipheriv, randomBytes } from 'crypto'
import { describe, expect, it } from 'vitest'

import { amountOf, checkoutParams, classify, decryptWebhook } from '@/lib/hyperpay'

describe('classify', () => {
  it('reads successful codes as paid', () => {
    for (const code of ['000.000.000', '000.100.110', '000.100.112', '000.300.000', '000.600.000', '000.400.110', '000.400.120']) {
      expect(classify(code)).toEqual({ outcome: 'paid', review: false })
    }
  })
  it('marks codes HyperPay wants reviewed', () => {
    expect(classify('000.400.000')).toEqual({ outcome: 'paid', review: true })
    expect(classify('000.400.100')).toEqual({ outcome: 'paid', review: true })
    // 000.400.03x are test-mode notices, not reviews.
    expect(classify('000.400.030').outcome).toBe('failed')
  })
  it('keeps pending payments pending', () => {
    for (const code of ['000.200.000', '000.200.100', '800.400.500', '100.400.500']) expect(classify(code).outcome).toBe('pending')
  })
  it('treats everything else, and nothing, as failed', () => {
    for (const code of ['800.100.151', '100.390.112', '700.400.580', '', null, undefined]) expect(classify(code).outcome).toBe('failed')
  })
})

describe('checkoutParams', () => {
  const cfg = { entityId: 'ENTITY', test: false }
  const order = { amount: 45, reference: '20007-ab12cd34', email: 'sara@example.com', name: '  Sara  Al Ahmad ', country: 'GB', city: 'London', street: '1 Test St' }

  it('sends what HyperPay asked for', () => {
    const p = Object.fromEntries(checkoutParams(cfg, order))
    expect(p).toEqual({
      entityId: 'ENTITY',
      amount: '45.00',
      currency: 'JOD',
      paymentType: 'DB',
      integrity: 'true',
      merchantTransactionId: '20007-ab12cd34',
      'customer.email': 'sara@example.com',
      'customer.givenName': 'Sara',
      'customer.surname': 'Al Ahmad',
      'billing.country': 'GB',
      'billing.street1': '1 Test St',
      'billing.city': 'London',
      'billing.state': 'London',
    })
  })
  it('adds the test-server parameters only on the test server', () => {
    const p = checkoutParams({ ...cfg, test: true }, order)
    expect(p.get('testMode')).toBe('EXTERNAL')
    expect(p.get('customParameters[3DS2_enrolled]')).toBe('true')
    expect(checkoutParams(cfg, order).has('testMode')).toBe(false)
  })
  it('leaves out what it does not know', () => {
    const p = checkoutParams(cfg, { ...order, name: 'Sara', country: 'XX', city: '', street: null })
    expect(p.get('customer.surname')).toBe('Sara')
    for (const k of ['billing.country', 'billing.city', 'billing.street1', 'billing.state', 'billing.postcode']) expect(p.has(k)).toBe(false)
    // "Other country" rows have made-up codes.
    expect(checkoutParams(cfg, { ...order, country: 'XEU' }).has('billing.country')).toBe(false)
  })
  it('formats amounts with two decimals', () => {
    expect(amountOf(30)).toBe('30.00')
    expect(amountOf(7.5)).toBe('7.50')
  })
})

describe('decryptWebhook', () => {
  const key = randomBytes(32)
  const seal = (text: string) => {
    const iv = randomBytes(12)
    const c = createCipheriv('aes-256-gcm', key, iv)
    const body = Buffer.concat([c.update(text, 'utf8'), c.final()])
    return { iv: iv.toString('hex'), tag: c.getAuthTag().toString('hex'), body: body.toString('hex') }
  }
  const note = { type: 'PAYMENT', payload: { id: 'p1', merchantTransactionId: '20007-ab12cd34', result: { code: '000.100.110' } } }

  it('opens a genuine notification, plain or wrapped in JSON', () => {
    const s = seal(JSON.stringify(note))
    expect(decryptWebhook(key.toString('hex'), s.iv, s.tag, s.body)).toEqual(note)
    expect(decryptWebhook(key.toString('hex'), s.iv, s.tag, JSON.stringify({ encryptedBody: s.body }))).toEqual(note)
  })
  it('refuses a tampered body or the wrong key', () => {
    const s = seal(JSON.stringify(note))
    const flipped = (s.body.startsWith('0') ? '1' : '0') + s.body.slice(1)
    expect(() => decryptWebhook(key.toString('hex'), s.iv, s.tag, flipped)).toThrow()
    expect(() => decryptWebhook(randomBytes(32).toString('hex'), s.iv, s.tag, s.body)).toThrow()
  })
})

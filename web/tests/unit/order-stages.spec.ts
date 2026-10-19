import { beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_LIMITS, duration, isStuck, limitHours, limitsFrom, nextStage, resolveStage, stuckAtFor } from '@/lib/orderStages'
import { carrierLink, trackPath, trackToken, validTrackToken, whatsappUpdate } from '@/lib/orderTrack'
import { reviewToken } from '@/lib/reviewCheck'

beforeAll(() => {
  process.env.PAYLOAD_SECRET = 'test-secret'
})

describe('stage and status move together', () => {
  it('starts a new active order at "paid", and leaves pending orders without a stage', () => {
    expect(resolveStage({ status: 'processing' })).toEqual({ status: 'processing', stage: 'paid' })
    expect(resolveStage({ status: 'on-hold' })).toEqual({ status: 'on-hold', stage: 'paid' })
    expect(resolveStage({ status: 'pending' })).toEqual({ status: 'pending', stage: null })
  })

  it('completes the order when staff mark it shipped or delivered', () => {
    const prev = { status: 'processing' as const, stage: 'packed' as const }
    expect(resolveStage({ status: 'processing', stage: 'shipped' }, prev)).toEqual({ status: 'completed', stage: 'shipped' })
    expect(resolveStage({ status: 'processing', stage: 'delivered' }, prev)).toEqual({ status: 'completed', stage: 'delivered' })
  })

  it('takes a completed order back to processing when moved to an earlier stage', () => {
    expect(resolveStage({ status: 'completed', stage: 'packed' }, { status: 'completed', stage: 'shipped' })).toEqual({ status: 'processing', stage: 'packed' })
  })

  it('keeps an order on hold while it is being prepared', () => {
    expect(resolveStage({ status: 'on-hold', stage: 'preparing' }, { status: 'on-hold', stage: 'paid' })).toEqual({ status: 'on-hold', stage: 'preparing' })
  })

  it('follows the status when only the status changed', () => {
    // The old "Complete" button: at least shipped.
    expect(resolveStage({ status: 'completed', stage: 'preparing' }, { status: 'processing', stage: 'preparing' })).toEqual({ status: 'completed', stage: 'shipped' })
    // Already delivered stays delivered.
    expect(resolveStage({ status: 'completed', stage: 'delivered' }, { status: 'completed', stage: 'delivered' }).stage).toBe('delivered')
    // A shipped order put back to processing waits at "packed".
    expect(resolveStage({ status: 'processing', stage: 'shipped' }, { status: 'completed', stage: 'shipped' })).toEqual({ status: 'processing', stage: 'packed' })
  })

  it('drops the stage when the order is cancelled or refunded, and restarts it when revived', () => {
    expect(resolveStage({ status: 'cancelled', stage: 'preparing' }, { status: 'processing', stage: 'preparing' })).toEqual({ status: 'cancelled', stage: null })
    expect(resolveStage({ status: 'processing', stage: null }, { status: 'cancelled', stage: null })).toEqual({ status: 'processing', stage: 'paid' })
  })

  it('walks the stages in order', () => {
    expect(nextStage('paid')).toBe('preparing')
    expect(nextStage('shipped')).toBe('delivered')
    expect(nextStage('delivered')).toBeNull()
    expect(nextStage(null)).toBe('paid')
  })
})

describe('stuck orders', () => {
  const since = '2026-10-01T10:00:00.000Z'

  it('uses the limit for the stage and, once shipped, for the way it ships', () => {
    expect(limitHours('paid', 'amman', DEFAULT_LIMITS)).toBe(24)
    expect(limitHours('shipped', 'jordan', DEFAULT_LIMITS)).toBe(DEFAULT_LIMITS.shippedLocal)
    expect(limitHours('shipped', 'intl', DEFAULT_LIMITS)).toBe(DEFAULT_LIMITS.shippedDhl)
    expect(limitHours('shipped', 'intl_standard', DEFAULT_LIMITS)).toBe(DEFAULT_LIMITS.shippedStandard)
    expect(limitHours('delivered', 'amman', DEFAULT_LIMITS)).toBeNull()
  })

  it('times from when the order entered the stage', () => {
    expect(stuckAtFor('paid', since, 'amman', DEFAULT_LIMITS)).toBe('2026-10-02T10:00:00.000Z')
    expect(stuckAtFor('delivered', since, 'amman', DEFAULT_LIMITS)).toBeNull()
    expect(stuckAtFor(null, since, 'amman', DEFAULT_LIMITS)).toBeNull()
  })

  it('takes the settings, with defaults for empty ones and 0 meaning never', () => {
    const limits = limitsFrom({ paid: 6, preparing: null, packed: 0 })
    expect(limits.paid).toBe(6)
    expect(limits.preparing).toBe(DEFAULT_LIMITS.preparing)
    expect(stuckAtFor('packed', since, 'amman', limits)).toBeNull()
  })

  it('is stuck from the moment the limit passes', () => {
    const at = '2026-10-02T10:00:00.000Z'
    expect(isStuck(at, new Date(at).getTime() - 1)).toBe(false)
    expect(isStuck(at, new Date(at).getTime())).toBe(true)
    expect(isStuck(null)).toBe(false)
  })

  it('says how long in both languages', () => {
    expect(duration(53 * 3600_000, 'en')).toBe('2d 5h')
    expect(duration(48 * 3600_000, 'en')).toBe('2d')
    expect(duration(20 * 60_000, 'en')).toBe('<1h')
    expect(duration(53 * 3600_000, 'ar')).toBe('2 يوم و5 ساعة')
  })
})

describe('order page links', () => {
  it('accepts only the signature for that order, and never the review one', () => {
    const token = trackToken(12)
    expect(validTrackToken(12, token)).toBe(true)
    expect(validTrackToken(13, token)).toBe(false)
    expect(validTrackToken(12, reviewToken(12))).toBe(false)
    expect(validTrackToken(12, undefined)).toBe(false)
    expect(trackPath('ar', 12)).toBe(`/ar/order-status?o=12&t=${token}`)
  })

  it('builds DHL tracking links from the number only', () => {
    expect(carrierLink('dhl', ' 123 456 ')).toContain('tracking-id=123%20456')
    expect(carrierLink('own', '123')).toBeNull()
    expect(carrierLink('dhl', '')).toBeNull()
  })

  it('writes the WhatsApp update in the customer’s language', () => {
    const order = { id: 12, number: 20012, locale: 'ar' as const, status: 'completed' as const, stage: 'shipped' as const, tracking: { number: 'JD0001' }, customer: { name: 'Lina Khaled' } }
    const text = whatsappUpdate(order)
    expect(text).toContain('مرحباً Lina!')
    expect(text).toContain('#20012')
    expect(text).toContain('JD0001')
    expect(text).toContain(trackPath('ar', 12))
    expect(whatsappUpdate({ ...order, locale: 'en', status: 'on-hold', stage: 'paid' })).toContain('arrange payment')
  })
})

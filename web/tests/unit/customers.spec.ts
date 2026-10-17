import { describe, expect, it } from 'vitest'

import { bagDetail, MAX_SECONDS, parseActivity, readDetail } from '@/lib/activity'
import { normalEmail, normalPhone, segmentOf, summarize, topKey } from '@/lib/customerStats'
import { deviceToken, readDeviceToken } from '@/lib/customerToken'
import { buildPersonas, marketOf, type PersonaCustomer } from '@/lib/personas'

describe('customer matching keys', () => {
  it('normalises emails', () => {
    expect(normalEmail('  Sara@Example.COM ')).toBe('sara@example.com')
    expect(normalEmail(undefined)).toBe('')
  })

  it('writes the same Jordanian number the same way however it was typed', () => {
    const key = '962791234567'
    expect(normalPhone('0791234567')).toBe(key)
    expect(normalPhone('+962 79 123 4567')).toBe(key)
    expect(normalPhone('00962791234567')).toBe(key)
    expect(normalPhone('079-123-4567')).toBe(key)
  })

  it('keeps foreign numbers and drops ones too short to match on', () => {
    expect(normalPhone('+971 50 123 4567')).toBe('971501234567')
    expect(normalPhone('12345')).toBe('')
    expect(normalPhone(null)).toBe('')
  })
})

describe('customer totals', () => {
  const orders = [
    { status: 'completed', total: 40, createdAt: '2026-01-10T10:00:00Z', country: 'Jordan' },
    { status: 'cancelled', total: 999, createdAt: '2026-02-01T10:00:00Z', country: 'Jordan' },
    { status: 'processing', total: 60, createdAt: '2026-03-11T10:00:00Z', country: 'United Arab Emirates' },
    { status: 'failed', total: 10, createdAt: '2026-04-01T10:00:00Z' },
  ]

  it('counts only purchases, and only completed ones as verified', () => {
    const s = summarize(orders)
    expect(s.orderCount).toBe(2)
    expect(s.verifiedOrders).toBe(1)
    expect(s.totalSpent).toBe(100)
    expect(s.averageOrder).toBe(50)
    expect(s.firstOrderAt).toBe('2026-01-10T10:00:00Z')
    expect(s.lastOrderAt).toBe('2026-03-11T10:00:00Z')
    expect(s.firstVerifiedAt).toBe('2026-01-10T10:00:00Z')
    expect(s.daysBetween).toBe(60)
    expect(s.segment).toBe('returning')
  })

  it('takes the country from the latest order that has one', () => {
    expect(summarize(orders).country).toBe('United Arab Emirates')
  })

  it('handles a customer with no purchases', () => {
    const s = summarize([{ status: 'cancelled', total: 5, createdAt: '2026-01-01T00:00:00Z' }])
    expect(s).toMatchObject({ orderCount: 0, totalSpent: 0, averageOrder: 0, segment: 'none', daysBetween: null, firstOrderAt: null })
  })

  it('segments by number of purchases', () => {
    expect([0, 1, 2, 3, 9].map(segmentOf)).toEqual(['none', 'one-time', 'returning', 'loyal', 'loyal'])
  })

  it('picks the biggest count, first seen on a tie', () => {
    expect(topKey(new Map([[1, 2], [2, 5], [3, 5]]))).toBe(2)
    expect(topKey(new Map())).toBeNull()
  })
})

describe('personas', () => {
  const base = (over: Partial<PersonaCustomer>): PersonaCustomer => ({
    id: 1,
    segment: 'one-time',
    country: 'Jordan',
    orderCount: 1,
    totalSpent: 30,
    lastOrderAt: '2026-10-01T00:00:00Z',
    daysBetween: null,
    categories: new Map(),
    products: new Map(),
    ...over,
  })
  const now = Date.parse('2026-10-17T00:00:00Z')

  it('groups buyers by frequency and market, biggest revenue first', () => {
    const personas = buildPersonas(
      [
        base({ id: 1, segment: 'loyal', orderCount: 4, totalSpent: 200, daysBetween: 30, categories: new Map([[7, 3]]), products: new Map([[50, 3]]) }),
        base({ id: 2, segment: 'loyal', orderCount: 3, totalSpent: 100, daysBetween: 40, categories: new Map([[7, 1], [8, 2]]), products: new Map([[50, 1], [51, 2]]), lastOrderAt: '2026-01-01T00:00:00Z' }),
        base({ id: 3, country: 'Germany', totalSpent: 80 }),
        base({ id: 4, segment: 'none', totalSpent: 0, orderCount: 0 }),
      ],
      now,
    )
    expect(personas.map((p) => p.key)).toEqual(['loyal:jordan', 'one-time:abroad'])
    const loyal = personas[0]
    expect(loyal.customers).toBe(2)
    expect(loyal.share).toBeCloseTo(2 / 3)
    expect(loyal.revenueShare).toBeCloseTo(300 / 380)
    expect(loyal.averageOrder).toBeCloseTo(300 / 7)
    expect(loyal.avgDaysBetween).toBe(35)
    expect(loyal.activeShare).toBe(0.5)
    // Category 7: both bought from it; product 50: four pieces.
    expect(loyal.topCategories[0]).toEqual([7, 2])
    expect(loyal.topProducts[0]).toEqual([50, 4])
    expect(personas[1].topCountries).toEqual([['Germany', 1]])
  })

  it('treats a missing country as Jordan, the shop’s home market', () => {
    expect(marketOf(null)).toBe('jordan')
    expect(marketOf(' jordan ')).toBe('jordan')
    expect(marketOf('Saudi Arabia')).toBe('abroad')
  })
})

describe('customer activity', () => {
  it('keeps well-formed events and caps the batch and the seconds', () => {
    const events = parseActivity({
      events: [
        { type: 'view', product: 12 },
        { type: 'choice', product: 12, detail: 'q:abc123=def456' },
        { type: 'time', product: 12, seconds: 99999 },
        { type: 'add', product: 12, detail: 'q:abc=def,chain=45' },
      ],
    })
    expect(events).toEqual([
      { type: 'view', product: 12 },
      { type: 'choice', product: 12, detail: 'q:abc123=def456' },
      { type: 'time', product: 12, seconds: MAX_SECONDS },
      { type: 'add', product: 12, detail: 'q:abc=def,chain=45' },
    ])
    expect(parseActivity({ events: Array.from({ length: 50 }, () => ({ type: 'view', product: 1 })) })).toHaveLength(20)
  })

  it('drops unknown types, bad products, empty choices and odd details', () => {
    expect(
      parseActivity({
        events: [
          { type: 'purchase', product: 1 },
          { type: 'view', product: -3 },
          { type: 'choice', product: 1 },
          { type: 'time', product: 1, seconds: 0 },
          { type: 'choice', product: 1, detail: '<script>' },
        ],
      }),
    ).toEqual([])
    expect(parseActivity(null)).toEqual([])
  })

  it('describes a bag line without the engraved name', () => {
    const detail = bagDetail({ choices: { abc: 'def' }, chain: 45, stone: null, finish: 'gold', style: 'script', ...{ name: 'Lina' } })
    expect(detail).toBe('q:abc=def,chain=45,stone=none,finish=gold,font=script')
    expect(detail).not.toContain('Lina')
    expect(readDetail(detail)).toEqual([
      ['q:abc', 'def'],
      ['chain', '45'],
      ['stone', 'none'],
      ['finish', 'gold'],
      ['font', 'script'],
    ])
  })
})

describe('device cookie', () => {
  it('round-trips and rejects anything edited', () => {
    const value = deviceToken({ customer: 42, device: 'abcDEF123_', epoch: 2 })
    expect(readDeviceToken(value)).toEqual({ customer: 42, device: 'abcDEF123_', epoch: 2 })
    expect(readDeviceToken(value.replace(/^42\./, '43.'))).toBeNull()
    expect(readDeviceToken(value.replace('.2.', '.3.'))).toBeNull()
    expect(readDeviceToken('nonsense')).toBeNull()
    expect(readDeviceToken(undefined)).toBeNull()
  })
})

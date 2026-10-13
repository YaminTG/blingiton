import { describe, expect, it } from 'vitest'

import { BOTS, parseEvent } from '@/lib/events'

const ok = { type: 'add', session: 'a1b2c3d4e5f6g7h8i9j0', product: 12, sourceType: 'organic', source: 'Google', locale: 'ar', path: '/ar/product/x' }

describe('shop funnel events', () => {
  it('keeps a valid event', () => {
    expect(parseEvent(ok)).toEqual(ok)
    expect(parseEvent({ type: 'visit', session: 'a1b2c3d4e5f6' })).toEqual({ type: 'visit', session: 'a1b2c3d4e5f6', product: undefined, sourceType: 'unknown', source: undefined, locale: 'en', path: undefined })
  })

  it('rejects unknown steps, odd sessions and bad product ids', () => {
    expect(parseEvent({ ...ok, type: 'purchase' })).toBeNull()
    expect(parseEvent({ ...ok, session: 'short' })).toBeNull()
    expect(parseEvent({ ...ok, session: 'has spaces in it!!' })).toBeNull()
    expect(parseEvent({ ...ok, product: -1 })).toBeNull()
    expect(parseEvent({ ...ok, product: 'abc' })).toBeNull()
    expect(parseEvent(null)).toBeNull()
  })

  it('never stores an "admin" source from the browser', () => {
    expect(parseEvent({ ...ok, sourceType: 'admin' })?.sourceType).toBe('unknown')
  })

  it('spots bots and headless browsers', () => {
    expect(BOTS.test('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true)
    expect(BOTS.test('Mozilla/5.0 HeadlessChrome/120')).toBe(true)
    expect(BOTS.test('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1')).toBe(false)
  })
})

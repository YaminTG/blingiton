import { beforeAll, describe, expect, it } from 'vitest'

import { parseSubmission, ReviewError, reviewLink, reviewToken, validToken } from '@/lib/reviewCheck'

beforeAll(() => {
  process.env.PAYLOAD_SECRET = 'test-secret'
})

const ok = { orderId: 12, token: 'x', locale: 'ar', author: '  Lina   K ', reviews: [{ product: 3, rating: 5, body: ' Lovely ' }] }
const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (err) {
    return err instanceof ReviewError ? err.code : 'other'
  }
  return null
}

describe('review links', () => {
  it('accepts only the signature for that order', () => {
    const token = reviewToken(12)
    expect(token).toHaveLength(22)
    expect(validToken(12, token)).toBe(true)
    expect(validToken(13, token)).toBe(false)
    expect(validToken(12, token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'))).toBe(false)
    expect(validToken(12, undefined)).toBe(false)
    expect(validToken(NaN, token)).toBe(false)
  })

  it('builds the link the email sends', () => {
    expect(reviewLink('ar', 12)).toMatch(new RegExp(`/ar/review\\?o=12&t=${reviewToken(12)}$`))
  })
})

describe('review submissions', () => {
  it('cleans up a valid submission', () => {
    expect(parseSubmission(ok)).toEqual({ orderId: 12, token: 'x', locale: 'ar', author: 'Lina K', reviews: [{ product: 3, rating: 5, body: 'Lovely' }] })
  })

  it('rejects bad ratings, missing names, duplicates and long text', () => {
    expect(code(() => parseSubmission({ ...ok, reviews: [{ product: 3, rating: 6 }] }))).toBe('invalid')
    expect(code(() => parseSubmission({ ...ok, reviews: [{ product: 3, rating: 2.5 }] }))).toBe('invalid')
    expect(code(() => parseSubmission({ ...ok, reviews: [] }))).toBe('invalid')
    expect(code(() => parseSubmission({ ...ok, author: '   ' }))).toBe('invalid')
    expect(code(() => parseSubmission({ ...ok, reviews: [ok.reviews[0], ok.reviews[0]] }))).toBe('invalid')
    expect(code(() => parseSubmission({ ...ok, reviews: [{ product: 3, rating: 4, body: 'x'.repeat(2001) }] }))).toBe('invalid')
    expect(code(() => parseSubmission(null))).toBe('invalid')
  })
})

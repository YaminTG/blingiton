// The checks a customer review must pass, kept free of database imports so the order emails (loaded
// by the Payload config) and unit tests can use them.
//
// The review link in the "on its way" email carries the order id plus a signature made with
// PAYLOAD_SECRET, so only the person who got the email can review that order and nothing needs storing.

import { createHmac, timingSafeEqual } from 'crypto'

import type { Locale } from './locales'
import { serverUrl } from './site'
import { paths } from './urls'

export class ReviewError extends Error {
  constructor(public code: 'invalid' | 'link' | 'not-ready' | 'done') {
    super(code)
  }
}

export const reviewToken = (orderId: number) =>
  createHmac('sha256', process.env.PAYLOAD_SECRET || '')
    .update(`review:${orderId}`)
    .digest('base64url')
    .slice(0, 22)

export function validToken(orderId: number, token: unknown): boolean {
  if (!Number.isInteger(orderId) || orderId <= 0 || typeof token !== 'string') return false
  const a = Buffer.from(reviewToken(orderId))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const reviewLink = (locale: Locale, orderId: number) => `${serverUrl}${paths.review(locale)}?o=${orderId}&t=${reviewToken(orderId)}`

// Repeated in components/review/ReviewForm.tsx (a client component can't import this file).
export const MAX_BODY = 2000
export const MAX_AUTHOR = 60

export type Submission = { orderId: number; token: string; locale: Locale; author: string; reviews: { product: number; rating: number; body: string }[] }

/** Checks the shape of a submission from the browser. Throws ReviewError('invalid'). */
export function parseSubmission(raw: unknown): Submission {
  const b = (raw ?? {}) as Record<string, unknown>
  const author = typeof b.author === 'string' ? b.author.replace(/\s+/g, ' ').trim() : ''
  const list = Array.isArray(b.reviews) ? b.reviews : []
  const reviews = list.map((r) => {
    const x = (r ?? {}) as Record<string, unknown>
    return { product: Number(x.product), rating: Number(x.rating), body: typeof x.body === 'string' ? x.body.trim() : '' }
  })
  const ok =
    Number.isInteger(Number(b.orderId)) &&
    typeof b.token === 'string' &&
    author.length >= 1 &&
    author.length <= MAX_AUTHOR &&
    reviews.length >= 1 &&
    reviews.length <= 50 &&
    new Set(reviews.map((r) => r.product)).size === reviews.length &&
    reviews.every((r) => Number.isInteger(r.product) && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5 && r.body.length <= MAX_BODY)
  if (!ok) throw new ReviewError('invalid')
  return { orderId: Number(b.orderId), token: b.token as string, locale: b.locale === 'ar' ? 'ar' : 'en', author, reviews }
}

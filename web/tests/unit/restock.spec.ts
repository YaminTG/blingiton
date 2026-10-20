import { describe, expect, it } from 'vitest'

import type { Question, Variant } from '@/lib/choices'
import { describeChoices, isBack, parseRequest, productAvailable, requestKey, targetFor, type StockFacts } from '@/lib/restock'

// A charm necklace with a Colour question; Pink has its own stock count.
const questions: Question[] = [
  {
    id: 'q1',
    name: 'Colour',
    look: 'colour',
    when: [],
    choices: [
      { id: 'pink', label: 'Pink', extra: 0, picture: 'pink', photo: null, when: [] },
      { id: 'blue', label: 'Blue', extra: 0, picture: 'blue', photo: null, when: [] },
    ],
  },
]
const variant = (stock: number | null): Variant => ({ id: 'v-pink', when: ['pink'], price: null, stock, photo: null })

const facts = (over: Partial<StockFacts> = {}): StockFacts => ({
  published: true,
  availability: 'in_stock',
  stock: 5,
  oneOff: false,
  price: 45,
  questions,
  variants: [variant(0)],
  ...over,
})

describe('is it really back?', () => {
  it('needs the piece live, priced, not sold out, and pieces left when it counts them', () => {
    expect(productAvailable(facts())).toBe(true)
    expect(productAvailable(facts({ availability: 'sold_out' }))).toBe(false)
    expect(productAvailable(facts({ stock: 0 }))).toBe(false)
    expect(productAvailable(facts({ published: false }))).toBe(false)
    expect(productAvailable(facts({ price: 0 }))).toBe(false)
    // Made to order is made as it sells: its count doesn't matter.
    expect(productAvailable(facts({ availability: 'made_to_order', stock: 0 }))).toBe(true)
  })

  it('needs the combination’s own count above zero too', () => {
    expect(isBack(facts(), 'v-pink')).toBe(false)
    expect(isBack(facts({ variants: [variant(2)] }), 'v-pink')).toBe(true)
    expect(isBack(facts({ variants: [variant(null)] }), 'v-pink')).toBe(true)
    // The shop deleted the combination row: nothing limits it any more.
    expect(isBack(facts({ variants: [] }), 'v-pink')).toBe(true)
    // The combination is back but the piece itself isn't.
    expect(isBack(facts({ variants: [variant(2)], availability: 'sold_out' }), 'v-pink')).toBe(false)
  })
})

describe('what a shopper waits for', () => {
  it('waits for the empty combination they picked', () => {
    expect(targetFor(facts(), { q1: 'pink' })).toEqual({ kind: 'variant', variantId: 'v-pink', answers: { q1: 'pink' } })
  })

  it('has nothing to wait for when their pick can be ordered', () => {
    expect(targetFor(facts(), { q1: 'blue' })).toEqual({ kind: 'available' })
  })

  it('waits for the whole piece when it is sold out, and for the combination too when that’s empty', () => {
    expect(targetFor(facts({ availability: 'sold_out' }), { q1: 'blue' })).toEqual({ kind: 'product' })
    expect(targetFor(facts({ availability: 'sold_out' }), { q1: 'pink' })).toMatchObject({ kind: 'variant', variantId: 'v-pink' })
  })

  it('offers nothing for one-off pieces', () => {
    expect(targetFor(facts({ oneOff: true, availability: 'sold_out' }), {})).toEqual({ kind: 'not-offered' })
  })

  it('describes the combination in the questions’ own words', () => {
    expect(describeChoices(questions, { q1: 'pink' })).toBe('Colour: Pink')
    expect(describeChoices(questions, { q1: 'gone-choice' })).toBe('')
  })
})

describe('requests from the page', () => {
  it('accepts a product, an email and the answers', () => {
    expect(parseRequest({ product: 12, email: ' Sara@Example.com ', choices: { q1: 'pink' }, locale: 'ar' })).toEqual({ product: 12, email: 'sara@example.com', answers: { q1: 'pink' }, locale: 'ar' })
  })

  it('refuses bad emails, bad products and bots that fill the hidden field', () => {
    expect(parseRequest({ product: 12, email: 'not-an-email' })).toBeNull()
    expect(parseRequest({ product: 'x', email: 'a@b.co' })).toBeNull()
    expect(parseRequest({ product: 12, email: 'a@b.co', website: 'http://spam' })).toBeNull()
  })

  it('treats the same email, piece and combination as one request', () => {
    expect(requestKey({ product: 1, variant: 'v', email: 'A@b.co' })).toBe(requestKey({ product: 1, variant: 'v', email: 'a@b.co' }))
    expect(requestKey({ product: 1, variant: null, email: 'a@b.co' })).not.toBe(requestKey({ product: 1, variant: 'v', email: 'a@b.co' }))
  })
})

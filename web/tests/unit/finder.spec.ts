import { describe, expect, it } from 'vitest'

import { answersQuery, budgetBands, nextQuestion, parseAnswers, recommend, themesOf, type Answers, type FinderProduct } from '@/lib/finder'

let nextId = 1
const piece = (over: Partial<FinderProduct> = {}): FinderProduct => ({
  id: nextId++,
  name: `Piece ${nextId}`,
  price: 40,
  kind: 'necklace',
  categories: ['necklaces'],
  personal: 'none',
  gold: false,
  stones: 'none',
  availability: 'in_stock',
  buyable: true,
  featured: false,
  sold: 0,
  text: '',
  ...over,
})
const named = (name: string, over: Partial<FinderProduct> = {}) => piece({ name, text: name, ...over })
const all: Answers = { for: 'her', occasion: 'birthday', budget: { min: 0, max: null }, style: 'any', finish: 'any' }

describe('answers in the address', () => {
  it('reads only known answers', () => {
    expect(parseAnswers({ for: 'mom', occasion: 'eid', budget: '40-55', style: 'faith', finish: 'gold' })).toEqual({
      for: 'mom',
      occasion: 'eid',
      budget: { min: 40, max: 55 },
      style: 'faith',
      finish: 'gold',
    })
    expect(parseAnswers({ for: 'cat', budget: '90-40', style: ['pearls', 'x'] })).toEqual({ for: undefined, occasion: undefined, budget: undefined, style: 'pearls', finish: undefined })
  })

  it('asks the first unanswered question, and can re-ask one without losing the others', () => {
    expect(nextQuestion({})).toBe('for')
    expect(nextQuestion({ for: 'him', occasion: 'eid' })).toBe('budget')
    expect(nextQuestion(all)).toBeNull()
    expect(answersQuery(all, { drop: 'occasion' })).toBe('?for=her&budget=0-&style=any&finish=any')
    expect(answersQuery({ for: 'her' }, { set: { occasion: 'love' } })).toBe('?for=her&occasion=love')
  })

  it('makes four budgets from the live prices, rounded to 5', () => {
    const prices = Array.from({ length: 100 }, (_, i) => 20 + i)
    expect(budgetBands(prices)).toEqual([
      { min: 0, max: 45 },
      { min: 45, max: 70 },
      { min: 70, max: 95 },
      { min: 95, max: null },
    ])
  })
})

describe('themes from the data products already have', () => {
  it('reads categories, options and words in both languages', () => {
    expect(themesOf(piece({ personal: 'name' }))).toContain('name')
    expect(themesOf(piece({ categories: ['palestine-jewelry'] }))).toContain('heritage')
    expect(themesOf(named('Ayat Al Kursi Necklace'))).toContain('faith')
    expect(themesOf(named('قلادة آية الكرسي'))).toContain('faith')
    expect(themesOf(named('Charming Tennis Bracelet'))).toContain('sparkle')
    expect(themesOf(piece({ kind: 'cufflinks', categories: ['cufflinks'] }))).toContain('men')
  })
})

describe('recommendations', () => {
  it('never picks sold-out or unpriced pieces', () => {
    const list = [piece({ buyable: false, availability: 'sold_out' }), piece({ price: 0 }), piece(), piece(), piece()]
    const ids = recommend(list, all).picks.map((p) => p.product.id)
    expect(ids).not.toContain(list[0].id)
    expect(ids).not.toContain(list[1].id)
  })

  it('puts the chosen style first and says why', () => {
    const faith = [named('Ayat Al Kursi Bracelet', { kind: 'bracelet' }), named('Hamsa Studs', { kind: 'earrings' }), named('Allah Necklace')]
    const others = [named('Moon Necklace', { sold: 30 }), named('Star Ring', { kind: 'ring', sold: 30 })]
    const r = recommend([...others, ...faith], { ...all, style: 'faith', occasion: 'eid' })
    expect(r.picks.map((p) => p.product.name).sort()).toEqual(['Allah Necklace', 'Ayat Al Kursi Bracelet', 'Hamsa Studs'])
    expect(r.picks[0].reasons).toContain('style')
    expect(r.picks[0].reasons).toContain('occasion')
    expect(r.fewExact).toBe(false)
  })

  it('fills in with close matches, and says so, when few pieces match the style', () => {
    const r = recommend([named('Pearl Drop Necklace'), named('Moon Necklace'), named('Star Ring', { kind: 'ring' }), named('Sun Bracelet', { kind: 'bracelet' })], { ...all, style: 'pearls' })
    expect(r.picks[0].product.name).toBe('Pearl Drop Necklace')
    expect(r.picks.length).toBe(3)
    expect(r.fewExact).toBe(true)
  })

  it('keeps to the budget, stretching only a little and saying so when there is too little in it', () => {
    const cheap = [named('A Necklace', { price: 30 }), named('B Ring', { price: 35, kind: 'ring' }), named('C Studs', { price: 38, kind: 'earrings' })]
    const dear = named('D Bracelet', { price: 120, kind: 'bracelet', sold: 50 })
    const r = recommend([...cheap, dear], { ...all, budget: { min: 25, max: 40 } })
    expect(r.picks.map((p) => p.product.id)).not.toContain(dear.id)
    expect(r.stretched).toBe(false)

    const near = named('E Bracelet', { price: 45, kind: 'bracelet' })
    const tight = recommend([cheap[0], near, dear], { ...all, budget: { min: 25, max: 40 } })
    expect(tight.picks.map((p) => p.product.id)).toEqual([cheap[0].id, near.id])
    expect(tight.stretched).toBe(true)
    expect(tight.picks[1].reasons).toContain('over')
  })

  it('keeps earrings and pearls away from “him”, and men’s pieces away from “her”', () => {
    const list = [
      piece({ kind: 'cufflinks', categories: ['cufflinks'], name: 'Initial Cufflinks', text: 'Initial Cufflinks' }),
      named('Men Palestine Coin Necklace', { categories: ['palestine-jewelry'] }),
      named('Hoop Earrings', { kind: 'earrings' }),
      named('Pearl Necklace', { categories: ['pearl-necklaces'] }),
    ]
    const him = recommend(list, { ...all, for: 'him' }).picks.map((p) => p.product.name)
    expect(him).toEqual(expect.arrayContaining(['Initial Cufflinks', 'Men Palestine Coin Necklace']))
    expect(him).not.toContain('Hoop Earrings')
    expect(him).not.toContain('Pearl Necklace')
    const her = recommend(list, all).picks.map((p) => p.product.name)
    expect(her).not.toContain('Initial Cufflinks')
    expect(her).not.toContain('Men Palestine Coin Necklace')
  })

  it('shows one piece per family, so five colours of one necklace don’t fill the list', () => {
    const colours = ['Pink', 'Orange', 'Purple', 'Turquoise'].map((c) => named(`Charmie ${c} Necklace`, { sold: 20 }))
    const r = recommend([...colours, named('Moon Ring', { kind: 'ring' }), named('Star Bracelet', { kind: 'bracelet' })], all)
    expect(r.picks.filter((p) => p.product.name.startsWith('Charmie'))).toHaveLength(1)
  })

  it('ranks gold pieces up when gold is asked for, and notes when there are few', () => {
    const gold = named('Gold Name Necklace', { gold: true, personal: 'name' })
    const r = recommend([named('Silver A'), named('Silver B', { kind: 'ring' }), gold, named('Silver C', { kind: 'bracelet' })], { ...all, finish: 'gold' })
    expect(r.picks[0].product.id).toBe(gold.id)
    expect(r.picks[0].reasons).toContain('gold')
    expect(r.fewGold).toBe(true)
  })

  it('trusts the product’s own tags over guesses from its name', () => {
    // The name says "men", but the shop tagged it for her: it's hers.
    const tagged = named('Men Style Chain', { tags: { for: ['her'], occasions: ['eid'], styles: ['faith'] } })
    const guessed = named('Ayat Al Kursi Necklace')
    const her = recommend([tagged, guessed, piece()], { ...all, style: 'faith', occasion: 'eid' })
    const pick = her.picks.find((p) => p.product.id === tagged.id)!
    expect(pick.reasons).toEqual(expect.arrayContaining(['style', 'occasion']))
    expect(recommend([tagged, piece(), piece()], { ...all, for: 'him' }).picks.map((p) => p.product.id)).not.toContain(tagged.id)
  })

  it('lets “her”, “mom” and “a friend” share pieces, but keeps a child’s piece for children', () => {
    const forMom = named('Family Names Necklace', { tags: { for: ['mom'], occasions: ['mothers-day'], styles: ['name'] } })
    const forKid = named('Baby Bracelet', { tags: { for: ['child'], occasions: ['baby'], styles: ['name'] } })
    const friend = recommend([forMom, forKid, piece()], { ...all, for: 'friend' }).picks.map((p) => p.product.id)
    expect(friend).toContain(forMom.id)
    expect(friend).not.toContain(forKid.id)
    expect(recommend([forMom, forKid, piece()], { ...all, for: 'me' }).picks.map((p) => p.product.id)).not.toContain(forKid.id)
  })

  it('never offers gift vouchers (no category) as a piece', () => {
    const voucher = named('Gift Voucher', { categories: [], kind: 'other', sold: 99 })
    expect(recommend([voucher, piece(), piece()], all).picks.map((p) => p.product.id)).not.toContain(voucher.id)
  })

  it('gives at most three reasons plus the budget line', () => {
    const p = named('Ayat Al Kursi Name Necklace', { personal: 'name', gold: true, featured: true, sold: 9 })
    const reasons = recommend([p, piece(), piece()], { ...all, style: 'faith', occasion: 'eid', finish: 'gold' }).picks.find((x) => x.product.id === p.id)!.reasons
    expect(reasons).toEqual(['style', 'name', 'occasion', 'budget'])
  })
})

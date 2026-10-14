import { describe, expect, it } from 'vitest'

import { choiceSoldOut, ordered, resolve, sizeCm, stepsFor, withSingles, type Choice, type Question, type Variant } from '@/lib/choices'

const c = (id: string, extra = 0, when: string[] = []): Choice => ({ id, label: id, extra, picture: null, photo: null, when })
const photo = (name: string) => ({ large: `/${name}-l.jpg`, thumb: `/${name}-t.jpg` })

// Zaytona (spec product 13): Small is gold only; the olive branch is only asked for Big.
const size: Question = { id: 'size', name: 'Size', look: 'size', when: [], choices: [c('small'), c('big', 5)] }
const finish: Question = { id: 'finish', name: 'Finish', look: 'finish', when: [], choices: [c('silver', 0, ['big']), c('gold', 3)] }
const branch: Question = { id: 'branch', name: 'Olive branch', look: 'other', when: ['big'], choices: [c('plain'), c('branch', 4)] }
const design: Question = { id: 'design', name: 'Design', look: 'design', when: [], choices: [c('map'), c('coin')] }
const zaytona = [finish, branch, size]

describe('choices', () => {
  it('asks in the shop order: design, size, …, finish, other', () => {
    expect(ordered([...zaytona, design]).map((q) => q.id)).toEqual(['design', 'size', 'finish', 'branch'])
  })

  it('hides questions and choices whose conditions are not met', () => {
    const small = stepsFor(zaytona, { size: 'small' })
    expect(small.steps.map((s) => s.id)).toEqual(['size', 'finish'])
    expect(small.steps[1].choices.map((x) => x.id)).toEqual(['gold'])

    const big = stepsFor(zaytona, { size: 'big' })
    expect(big.steps.map((s) => s.id)).toEqual(['size', 'finish', 'branch'])
    expect(big.steps[1].choices.map((x) => x.id)).toEqual(['silver', 'gold'])
  })

  it('drops answers that no longer make sense when an earlier one changes', () => {
    const { answers } = stepsFor(zaytona, { size: 'small', finish: 'silver', branch: 'branch' })
    expect(answers).toEqual({ size: 'small' })
  })

  it('fills in questions with a single choice', () => {
    expect(withSingles(zaytona, { size: 'small' })).toEqual({ size: 'small', finish: 'gold' })
  })

  it('adds up choice extras and knows when every question is answered', () => {
    const r = resolve(30, zaytona, [], { size: 'big', finish: 'gold' })
    expect(r.complete).toBe(false)
    expect(r.price).toBe(38)
    const done = resolve(30, zaytona, [], { size: 'big', finish: 'gold', branch: 'branch' })
    expect(done.complete).toBe(true)
    expect(done.price).toBe(42)
  })

  it('lets the most specific combination set price, stock and photo', () => {
    const variants: Variant[] = [
      { id: 'v1', when: ['gold'], price: 50, stock: null, photo: photo('gold') },
      { id: 'v2', when: ['big', 'gold'], price: 60, stock: 2, photo: null },
      { id: 'v3', when: ['small', 'big'], price: null, stock: 9, photo: null },
    ]
    const r = resolve(30, zaytona, variants, { size: 'big', finish: 'gold', branch: 'plain' })
    expect(r.price).toBe(60) // v2 names two questions
    expect(r.stock).toBe(2)
    expect(r.stockVariant?.id).toBe('v2')
    expect(r.photo?.large).toBe('/gold-l.jpg') // v2 has none, so v1's
    // Choices of one question are alternatives: v3 applies to both sizes.
    expect(resolve(30, zaytona, variants, { size: 'small', finish: 'gold' }).stock).toBe(9)
  })

  it('shows a choice photo when no combination has one', () => {
    const q: Question = { ...design, choices: [{ ...c('map'), photo: photo('map') }, c('coin')] }
    expect(resolve(10, [q], [], { design: 'map' }).photo?.thumb).toBe('/map-t.jpg')
    expect(resolve(10, [q], [], { design: 'coin' }).photo).toBeNull()
  })

  it('marks choices that lead to nothing left', () => {
    const variants: Variant[] = [{ id: 'v', when: ['coin'], price: null, stock: 0, photo: null }]
    expect(choiceSoldOut([design], variants, {}, 'design', 'coin')).toBe(true)
    expect(choiceSoldOut([design], variants, {}, 'design', 'map')).toBe(false)
  })

  it('ignores conditions on deleted choices', () => {
    const q: Question = { ...branch, when: ['gone'] }
    expect(stepsFor([size, q], {}).steps.map((s) => s.id)).toEqual(['size', 'branch'])
  })

  it('reads sizes in cm from labels', () => {
    expect(sizeCm('1.5 cm')).toBe(1.5)
    expect(sizeCm('٢٫٥ سم')).toBe(2.5)
    expect(sizeCm('19 mm')).toBe(1.9)
    expect(sizeCm('Small')).toBeNull()
  })
})

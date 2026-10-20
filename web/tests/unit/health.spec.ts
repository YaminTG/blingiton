import { describe, expect, it } from 'vitest'

import { mediaPath } from '@/lib/healthReport'
import {
  buildBaseline,
  expectedOrders,
  findProblems,
  planAlerts,
  type Baseline,
  type HealthInput,
  type OrderLite,
  type Problem,
  type ProblemKind,
  type Signal,
} from '@/lib/healthRules'
import { problemText } from '@/lib/healthText'

const NOW = new Date('2026-10-20T15:00:00Z') // 18:00 in Amman
const H = 3600_000
const ago = (hours: number) => new Date(NOW.getTime() - hours * H).toISOString()

/** A shop with `perDay` web orders a day of 30 JOD, spread over the day, for 28 days. */
function history(perDay: number): OrderLite[] {
  const out: OrderLite[] = []
  for (let i = 0; i < perDay * 28; i++) {
    out.push({ id: i + 1, number: 20001 + i, status: 'completed', total: 30, payment: 'cash', web: true, createdAt: ago(((i * 24) / perDay) % (28 * 24) + 1) })
  }
  return out
}

const quiet = (): Baseline => buildBaseline(history(2), { checkoutSessions: 200, visitSessions: 5000 }, 28)

function input(over: Partial<HealthInput> = {}): HealthInput {
  return {
    now: NOW,
    production: true,
    smtp: true,
    baseline: quiet(),
    lastWebOrderAt: ago(2),
    checkoutsSinceLastOrder: 0,
    signals: [],
    recentOrders: [],
    missingConfirmations: [],
    products: {},
    noPhoto: [],
    noPrice: [],
    deep: null,
    backups: [],
    failedJobs: [],
    ...over,
  }
}

const kinds = (list: Problem[]) => list.map((p) => p.kind)
const signal = (kind: Signal['kind'], hoursAgo: number, extra: Partial<Signal> = {}): Signal => ({ kind, at: ago(hoursAgo), ...extra })

describe('the shop’s normal', () => {
  it('works out order value, sales a day and conversion from web orders only', () => {
    const orders = [...history(2), { id: 999, number: 1, status: 'completed', total: 500, payment: 'cash', web: false, createdAt: ago(5) }]
    const b = buildBaseline(orders, { checkoutSessions: 200, visitSessions: 5000 }, 28)
    expect(b.orders).toBe(56)
    expect(b.aov).toBe(30)
    expect(b.perDay).toBe(60)
    expect(b.checkoutRate).toBeCloseTo(0.28)
  })

  it('expects about a day’s orders over 24 hours, and never zero in a quiet hour', () => {
    const b = quiet()
    expect(expectedOrders(b, new Date(ago(24)), NOW)).toBeCloseTo(2, 5)
    expect(Math.min(...b.hourly)).toBeGreaterThan(0)
  })

  it('has no conversion rates until there is enough history', () => {
    const b = buildBaseline(history(2).slice(0, 3), { checkoutSessions: 5, visitSessions: 20 }, 28)
    expect(b.checkoutRate).toBeNull()
    expect(b.visitRate).toBeNull()
  })
})

describe('finding problems', () => {
  it('finds nothing in a shop that is selling normally', () => {
    expect(findProblems(input({ checkoutsSinceLastOrder: 2 }))).toEqual([])
  })

  it('calls an emergency when two people hit checkout errors since the last order', () => {
    const p = findProblems(input({ checkoutsSinceLastOrder: 2, signals: [signal('checkout-error', 1, { source: 'a' }), signal('checkout-failed', 0.5, { source: 'b' })] }))
    expect(p[0]).toMatchObject({ kind: 'checkout-down', tier: 'emergency', atRisk: 60 })
  })

  it('calls checkout down when many checkouts bring no order', () => {
    // 28% of checkouts order: 17 without one is very unlikely (λ ≈ 4.8).
    expect(findProblems(input({ checkoutsSinceLastOrder: 17 }))[0]).toMatchObject({ kind: 'checkout-down', tier: 'emergency' })
    expect(findProblems(input({ checkoutsSinceLastOrder: 12 }))[0]).toMatchObject({ kind: 'checkout-down', tier: 'urgent' })
    expect(kinds(findProblems(input({ checkoutsSinceLastOrder: 6 })))).not.toContain('checkout-down')
  })

  it('treats one error while orders still come in as intermittent, not an emergency', () => {
    const p = findProblems(input({ checkoutsSinceLastOrder: 1, signals: [signal('checkout-failed', 1, { source: 'a', detail: 'network' })] }))
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ kind: 'checkout-errors', tier: 'soon' })
  })

  it('flags orders stopping only when the gap is unusual for the time of day', () => {
    expect(kinds(findProblems(input({ lastWebOrderAt: ago(20) })))).not.toContain('orders-stopped')
    expect(findProblems(input({ lastWebOrderAt: ago(60) }))[0]).toMatchObject({ kind: 'orders-stopped', tier: 'urgent' })
  })

  it('doesn’t flag quiet spells before the shop has 10 web orders', () => {
    const b = buildBaseline(history(2).slice(0, 5), { checkoutSessions: 10, visitSessions: 100 }, 28)
    expect(findProblems(input({ baseline: b, lastWebOrderAt: ago(150) }))).toEqual([])
  })

  it('reports missing confirmation emails with the money involved', () => {
    const order = { id: 7, number: 20107, status: 'processing', total: 80, payment: 'cash', web: true, createdAt: ago(1) }
    const p = findProblems(input({ missingConfirmations: [order], signals: [signal('email-failed', 1, { detail: 'SMTP 535' })] }))
    expect(p[0]).toMatchObject({ kind: 'confirmations-missing', tier: 'urgent', atRisk: 20 })
    expect(p[0].detail).toMatchObject({ numbers: '#20107', error: 'SMTP 535' })
  })

  it('ranks a broken checkout page above a broken product page, and the product by what it sells', () => {
    const p = findProblems(
      input({
        products: { 5: { id: 5, name: 'Name necklace', slug: 'name-necklace', price: 35, value: 4 }, 6: { id: 6, name: 'Old ring', slug: 'old-ring', price: 10, value: 0.1 } },
        deep: {
          at: ago(0.5),
          checkedPages: 60,
          checkedImages: 50,
          rates: 'live',
          cursor: 0,
          missing: [],
          images: [],
          pages: [
            { path: '/en/product/old-ring', kind: 'product', status: 500, product: 6 },
            { path: '/en/checkout', kind: 'checkout', status: 500 },
            { path: '/en/product/name-necklace', kind: 'product', status: 404, product: 5 },
          ],
        },
      }),
    )
    expect(p.map((x) => [x.key, x.tier])).toEqual([
      ['page:/en/checkout', 'emergency'],
      ['page:/en/product/name-necklace', 'urgent'],
      ['page:/en/product/old-ring', 'soon'],
    ])
  })

  it('reports one “site down” instead of every page when the main pages all fail', () => {
    const p = findProblems(
      input({
        deep: {
          at: ago(0.5),
          checkedPages: 6,
          checkedImages: 0,
          rates: null,
          cursor: 0,
          missing: [],
          images: [{ url: '/api/media/file/x.webp', status: 0, product: null }],
          pages: ['/en', '/ar', '/en/shop', '/ar/shop', '/en/checkout', '/ar/checkout'].map((path) => ({ path, kind: path.endsWith('checkout') ? ('checkout' as const) : ('key' as const), status: 0 })),
        },
      }),
    )
    expect(kinds(p)).toEqual(['site-down'])
  })

  it('collapses most pages failing into one “site down”, even when the home page works', () => {
    const pages = Array.from({ length: 87 }, (_, i) => ({ path: `/en/product/p${i}`, kind: 'product' as const, status: 0, product: i }))
    const p = findProblems(input({ deep: { at: ago(0.5), checkedPages: 88, checkedImages: 0, rates: 'live', cursor: 0, missing: [], images: [], pages } }))
    expect(kinds(p)).toEqual(['site-down'])
    expect(p[0].detail).toMatchObject({ pages: 87, checked: 88 })
  })

  it('reports missing pages only once the crawl confirms they still 404', () => {
    const signals = [signal('not-found', 30, { path: '/product/old', referrer: 'instagram.com' }), signal('not-found', 20, { path: '/product/old' }), signal('not-found', 5, { path: '/product/old' })]
    const deep = { at: ago(0.5), checkedPages: 10, checkedImages: 0, rates: null, cursor: 0, images: [], pages: [] }
    expect(findProblems(input({ signals, deep: { ...deep, missing: [] } }))).toEqual([])
    expect(findProblems(input({ signals, deep: { ...deep, missing: ['/product/old'] } }))[0]).toMatchObject({ kind: 'missing-page', tier: 'soon', detail: { hits: 3, outside: 'instagram.com' } })
  })

  it('reports a sold-out piece only once two different people tried to buy it', () => {
    const products = { 9: { id: 9, name: 'Moon ring', slug: 'moon-ring', price: 21, value: 1 } }
    const one = [signal('checkout-rejected', 3, { detail: 'gone', product: 9, source: 'a' }), signal('checkout-rejected', 2, { detail: 'gone', product: 9, source: 'a' })]
    expect(findProblems(input({ products, signals: one }))).toEqual([])
    const two = [...one, signal('checkout-rejected', 1, { detail: 'gone', product: 9, source: 'b' })]
    expect(findProblems(input({ products, signals: two }))[0]).toMatchObject({ kind: 'sold-out-in-bags', detail: { product: 'Moon ring', people: 2 } })
  })

  it('flags a spike in failed orders against the usual rate', () => {
    const failed = [1, 2, 3].map((i) => ({ id: i, number: 20200 + i, status: 'failed', total: 40, payment: 'card_online', web: true, createdAt: ago(i) }))
    expect(findProblems(input({ recentOrders: failed }))[0]).toMatchObject({ kind: 'failed-orders', tier: 'urgent', atRisk: 120 })
  })

  it('only checks the background jobs’ heartbeat when asked to', () => {
    expect(kinds(findProblems(input()))).not.toContain('jobs-stopped')
    expect(kinds(findProblems(input({ lastRunAt: ago(2) })))).toContain('jobs-stopped')
    expect(kinds(findProblems(input({ lastRunAt: ago(0.1) })))).not.toContain('jobs-stopped')
  })
})

describe('alerts', () => {
  const title = (p: Problem) => problemText(p, 'en')[0]
  const urgent: Problem = { key: 'no-smtp', kind: 'no-smtp', tier: 'urgent', atRisk: null, detail: {} }
  const emergency: Problem = { key: 'checkout-down', kind: 'checkout-down', tier: 'emergency', atRisk: 60, detail: { checkouts: 9 } }
  const soon: Problem = { key: 'no-photo', kind: 'no-photo', tier: 'soon', atRisk: null, detail: { n: 2, names: 'a, b' } }
  // 08:00 Amman, before the morning summary.
  const morning = new Date('2026-10-20T05:00:00Z')
  const at = (base: Date, hours: number) => new Date(base.getTime() + hours * H)

  it('emails an urgent problem once, not on every run', () => {
    const first = planAlerts([urgent], null, morning, title)
    expect(first.now).toEqual([urgent])
    const second = planAlerts([urgent], first.book, at(morning, 0.2), title)
    expect(second.now).toEqual([])
  })

  it('repeats an emergency every 2 hours while it lasts', () => {
    const first = planAlerts([emergency], null, morning, title)
    expect(planAlerts([emergency], first.book, at(morning, 1), title).now).toEqual([])
    expect(planAlerts([emergency], first.book, at(morning, 2), title).now).toEqual([emergency])
  })

  it('emails again when a problem gets worse', () => {
    const first = planAlerts([{ ...emergency, tier: 'urgent' }], null, morning, title)
    expect(planAlerts([emergency], first.book, at(morning, 0.2), title).now).toEqual([emergency])
  })

  it('says an emergency is fixed straight away, other fixes with the next email', () => {
    const e = planAlerts([emergency], null, morning, title)
    expect(planAlerts([], e.book, at(morning, 0.2), title).fixed.map((x) => x.kind)).toEqual(['checkout-down'])

    const u = planAlerts([urgent], null, morning, title)
    const gone = planAlerts([], u.book, at(morning, 0.2), title)
    expect(gone.fixed).toEqual([])
    const nextEmail = planAlerts([emergency], gone.book, at(morning, 0.4), title)
    expect(nextEmail.fixed.map((x) => x.kind)).toEqual(['no-smtp'])
  })

  it('keeps “this week” problems for the 9:00 summary, once a day', () => {
    const early = planAlerts([soon], null, morning, title)
    expect(early.now).toEqual([])
    expect(early.digest).toEqual([])
    const nine = planAlerts([soon], early.book, at(morning, 1.1), title)
    expect(nine.digest).toEqual([soon])
    expect(planAlerts([soon], nine.book, at(morning, 3), title).digest).toEqual([])
  })

  it('doesn’t re-alert a problem that flickers off and back on', () => {
    const first = planAlerts([urgent], null, morning, title)
    const off = planAlerts([], first.book, at(morning, 0.2), title)
    expect(planAlerts([urgent], off.book, at(morning, 0.4), title).now).toEqual([])
  })
})

describe('wording', () => {
  const all: ProblemKind[] = [
    'site-down',
    'checkout-down',
    'checkout-errors',
    'orders-stopped',
    'checkout-refused',
    'sold-out-in-bags',
    'failed-orders',
    'payment-pending',
    'confirmations-missing',
    'email-failing',
    'no-smtp',
    'page-down',
    'image-broken',
    'no-photo',
    'no-price',
    'missing-page',
    'backup',
    'jobs-failing',
    'jobs-stopped',
    'rates-fallback',
  ]
  it('has a title and an action for every problem in English and Arabic', () => {
    for (const kind of all) {
      for (const lang of ['en', 'ar'] as const) {
        const [title, todo] = problemText({ kind, detail: { n: 2 } }, lang)
        expect(title.length, `${kind} ${lang}`).toBeGreaterThan(5)
        expect(todo.length, `${kind} ${lang}`).toBeGreaterThan(5)
      }
    }
  })
})

describe('photo reports', () => {
  const base = 'https://blingitonjewels.com'
  it('reads our photo’s path, also through next/image', () => {
    expect(mediaPath('https://blingitonjewels.com/api/media/file/ring-800x800.webp', base)).toBe('/api/media/file/ring-800x800.webp')
    expect(mediaPath('/_next/image?url=%2Fapi%2Fmedia%2Ffile%2Fring.webp&w=640&q=75', base)).toBe('/api/media/file/ring.webp')
  })
  it('ignores anything that isn’t one of our photos', () => {
    expect(mediaPath('https://evil.example/api/media/file/x.webp', base)).toBeNull()
    expect(mediaPath('/_next/image?url=https%3A%2F%2Fevil.example%2Fx.png&w=64', base)).toBeNull()
    expect(mediaPath('/logo.png', base)).toBeNull()
    expect(mediaPath('data:image/png;base64,AAAA', base)).toBeNull()
  })
})

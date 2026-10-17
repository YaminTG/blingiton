// Numbers behind the admin's customer insights (components/admin/CustomerInsights.tsx) and each
// customer's Insights tab (components/admin/CustomerView.tsx). Purchases come from orders, browsing
// from `customer-activity` (only consenting customers with a completed order, see lib/activity.ts).
// Browsing is reported as interest only: a view says someone looked, not that they meant to buy.

import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { Customer, Order } from '@/payload-types'

import { readDetail } from './activity'
import { isPurchase, PURCHASE_STATUSES, type Segment } from './customerStats'
import { trackingState } from './customers'
import { dictionary } from './dictionary'
import { ACTIVE_DAYS, buildPersonas, type Persona } from './personas'
import { stoneLabel } from './stones'

export const PERIODS = ['30', '90', '365', 'all'] as const
export type Period = (typeof PERIODS)[number]
type Lang = 'en' | 'ar'
type Row = Record<string, unknown>

const rows = async (payload: Payload, q: ReturnType<typeof sql>) =>
  ((await (payload.db as unknown as PostgresAdapter).drizzle.execute(q)) as unknown as { rows: Row[] }).rows

const idOf = (v: unknown) => (v && typeof v === 'object' && 'id' in v ? Number((v as { id: unknown }).id) : typeof v === 'number' ? v : null)
const productsOf = (o: Pick<Order, 'items'>) => (o.items ?? []).map((it) => ({ id: idOf(it.product), name: it.name, qty: it.quantity ?? 1, total: it.lineTotal ?? 0 }))
const inc = <K>(m: Map<K, number>, k: K, by = 1) => m.set(k, (m.get(k) ?? 0) + by)

type ProductInfo = { name: string; categories: number[]; options: { id: string; name: string; choices: Map<string, string> }[] }

/** Names, categories and question/choice labels for products, in the admin's language. Drafts too: past orders may name them. */
async function productInfo(payload: Payload, ids: number[], lang: Lang) {
  const out = new Map<number, ProductInfo>()
  if (!ids.length) return out
  const found = await payload.find({
    collection: 'products',
    where: { id: { in: ids } },
    select: { name: true, categories: true, personalization: true },
    depth: 0,
    limit: 0,
    pagination: false,
    draft: true,
    locale: lang,
  })
  for (const p of found.docs)
    out.set(p.id, {
      name: p.name,
      categories: (p.categories ?? []).map(idOf).filter((v): v is number => Boolean(v)),
      options: (p.personalization?.options ?? []).map((o) => ({
        id: o.id ?? '',
        name: o.name ?? '',
        choices: new Map((o.choices ?? []).map((c) => [c.id ?? '', c.label ?? ''])),
      })),
    })
  return out
}

async function categoryNames(payload: Payload, ids: number[], lang: Lang) {
  if (!ids.length) return new Map<number, string>()
  const found = await payload.find({ collection: 'categories', where: { id: { in: ids } }, select: { name: true }, depth: 0, limit: 0, pagination: false, locale: lang })
  return new Map(found.docs.map((c) => [c.id, c.name]))
}

/** "Size: Medium", "Chain: 45 cm", "Gold" … for one `detail` pair. */
function pickLabel(key: string, value: string, info: ProductInfo | undefined, lang: Lang) {
  const t = dictionary(lang)
  if (key.startsWith('q:')) {
    const q = info?.options.find((o) => o.id === key.slice(2))
    const choice = q?.choices.get(value)
    return q && choice ? `${q.name}: ${choice}` : null
  }
  if (key === 'chain') return `${lang === 'ar' ? 'السلسلة' : 'Chain'}: ${value} ${t.cm}`
  if (key === 'stone') return value === 'none' ? `${lang === 'ar' ? 'الحجر' : 'Stone'}: ${t.none}` : `${lang === 'ar' ? 'الحجر' : 'Stone'}: ${stoneLabel(Number(value), 'gem', lang === 'ar')}`
  if (key === 'finish') return value === 'gold' ? t.gold : value === 'silver' ? t.silver : null
  if (key === 'font') return `${lang === 'ar' ? 'الخط' : 'Lettering'}: ${t.styles[value as keyof typeof t.styles] ?? value}`
  return null
}

// --- The insights page ---------------------------------------------------------------------------

export type CountryRow = { country: string; customers: number; orders: number; revenue: number; averageOrder: number; share: number }
export type SegmentRow = { segment: Exclude<Segment, 'none'>; customers: number; share: number; revenue: number; revenueShare: number; avgOrders: number; averageOrder: number; avgDaysBetween: number | null; activeShare: number }
export type InterestRow = { product: number; name: string; customers: number; views: number; seconds: number; adds: number; repeatCustomers: number; boughtAfter: number }

export type Insights = {
  period: Period
  since: Date | null
  kpis: {
    buyers: number
    newBuyers: number
    returning: number
    returningShare: number
    orders: number
    revenue: number
    averageOrder: number
    repeatOrderShare: number
    avgOrdersPerBuyer: number
  }
  countries: CountryRow[]
  segments: SegmentRow[]
  personas: Persona[]
  productNames: Map<number, string>
  categoryNames: Map<number, string>
  topCustomers: Pick<Customer, 'id' | 'name' | 'country' | 'orderCount' | 'totalSpent' | 'lastOrderAt' | 'segment'>[]
  tracking: { agreed: number; on: number; activeInPeriod: number }
  interest: InterestRow[]
}

export async function loadInsights(payload: Payload, period: Period, lang: Lang): Promise<Insights> {
  const since = period === 'all' ? null : new Date(Date.now() - Number(period) * 86400_000)
  const inPeriod = (iso: string | null | undefined) => Boolean(iso) && (!since || Date.parse(iso!) >= since.getTime())

  const [ordersFound, customersFound] = await Promise.all([
    payload.find({
      collection: 'orders',
      where: { status: { in: [...PURCHASE_STATUSES] } },
      select: { total: true, createdAt: true, status: true, shipping: true, customerRecord: true, items: true },
      sort: 'createdAt',
      depth: 0,
      limit: 0,
      pagination: false,
    }),
    payload.find({
      collection: 'customers',
      select: { name: true, country: true, orderCount: true, verifiedOrders: true, totalSpent: true, firstOrderAt: true, lastOrderAt: true, daysBetween: true, segment: true, tracking: true },
      depth: 0,
      limit: 0,
      pagination: false,
    }),
  ])
  const allOrders = ordersFound.docs
  const customers = customersFound.docs
  const buyers = customers.filter((c) => (c.orderCount ?? 0) > 0)
  const firstOrder = new Map(buyers.map((c) => [c.id, c.firstOrderAt]))

  // KPIs over the period's orders.
  const orders = allOrders.filter((o) => inPeriod(o.createdAt))
  const revenue = orders.reduce((s, o) => s + (o.total ?? 0), 0)
  const repeatOrders = orders.filter((o) => {
    const first = firstOrder.get(idOf(o.customerRecord) ?? 0)
    return first && Date.parse(first) < Date.parse(o.createdAt)
  }).length
  const returning = buyers.filter((c) => (c.orderCount ?? 0) >= 2).length

  // Sales by country (the order's delivery country).
  const byCountry = new Map<string, { customers: Set<number>; orders: number; revenue: number }>()
  for (const o of orders) {
    const key = o.shipping?.country?.trim() || '–'
    const e = byCountry.get(key) ?? { customers: new Set<number>(), orders: 0, revenue: 0 }
    const cid = idOf(o.customerRecord)
    if (cid) e.customers.add(cid)
    e.orders++
    e.revenue += o.total ?? 0
    byCountry.set(key, e)
  }
  const countries = [...byCountry.entries()]
    .map(([country, e]) => ({ country, customers: e.customers.size, orders: e.orders, revenue: e.revenue, averageOrder: e.orders ? e.revenue / e.orders : 0, share: revenue ? e.revenue / revenue : 0 }))
    .sort((a, b) => b.revenue - a.revenue)

  // Segments, all time: how often each group buys.
  const totalSpentAll = buyers.reduce((s, c) => s + (c.totalSpent ?? 0), 0)
  const now = Date.now()
  const segments = (['loyal', 'returning', 'one-time'] as const).map((segment): SegmentRow => {
    const m = buyers.filter((c) => c.segment === segment)
    const spent = m.reduce((s, c) => s + (c.totalSpent ?? 0), 0)
    const count = m.reduce((s, c) => s + (c.orderCount ?? 0), 0)
    const gaps = m.filter((c) => typeof c.daysBetween === 'number')
    return {
      segment,
      customers: m.length,
      share: buyers.length ? m.length / buyers.length : 0,
      revenue: spent,
      revenueShare: totalSpentAll ? spent / totalSpentAll : 0,
      avgOrders: m.length ? count / m.length : 0,
      averageOrder: count ? spent / count : 0,
      avgDaysBetween: gaps.length ? Math.round(gaps.reduce((s, c) => s + (c.daysBetween ?? 0), 0) / gaps.length) : null,
      activeShare: m.length ? m.filter((c) => c.lastOrderAt && now - Date.parse(c.lastOrderAt) <= ACTIVE_DAYS * 86400_000).length / m.length : 0,
    }
  })

  // Personas, all time: what each group buys.
  const boughtIds = [...new Set(allOrders.flatMap((o) => productsOf(o).map((p) => p.id)).filter((v): v is number => Boolean(v)))]
  const info = await productInfo(payload, boughtIds, lang)
  const perCustomer = new Map<number, { categories: Map<number, number>; products: Map<number, number> }>()
  for (const o of allOrders) {
    const cid = idOf(o.customerRecord)
    if (!cid) continue
    const e = perCustomer.get(cid) ?? { categories: new Map(), products: new Map() }
    for (const p of productsOf(o)) {
      if (!p.id) continue
      inc(e.products, p.id, p.qty)
      for (const cat of info.get(p.id)?.categories ?? []) inc(e.categories, cat, p.qty)
    }
    perCustomer.set(cid, e)
  }
  const personas = buildPersonas(
    buyers.map((c) => ({
      id: c.id,
      segment: (c.segment ?? 'none') as Segment,
      country: c.country ?? null,
      orderCount: c.orderCount ?? 0,
      totalSpent: c.totalSpent ?? 0,
      lastOrderAt: c.lastOrderAt ?? null,
      daysBetween: c.daysBetween ?? null,
      categories: perCustomer.get(c.id)?.categories ?? new Map(),
      products: perCustomer.get(c.id)?.products ?? new Map(),
    })),
  )

  // Interest from tracked customers in the period, and how often a view was followed by buying it.
  const after = since ?? new Date(0)
  const [interestRows, firstViews, active] = await Promise.all([
    rows(
      payload,
      sql`select product,
        count(distinct customer_id) filter (where type = 'view')::int as customers,
        count(*) filter (where type = 'view')::int as views,
        coalesce(sum(seconds) filter (where type = 'time'), 0)::int as seconds,
        count(*) filter (where type = 'add')::int as adds
        from customer_activity where created_at >= ${after} group by product
        order by customers desc, views desc limit 15`,
    ),
    rows(
      payload,
      sql`select customer_id as customer, product, min(created_at) as first_view, count(distinct created_at::date)::int as days
        from customer_activity where type = 'view' and created_at >= ${after} group by customer_id, product`,
    ),
    rows(payload, sql`select count(distinct customer_id)::int as n from customer_activity where created_at >= ${after}`),
  ])
  const purchasesBy = new Map<number, { at: number; products: Set<number> }[]>()
  for (const o of allOrders) {
    const cid = idOf(o.customerRecord)
    if (!cid) continue
    purchasesBy.set(cid, [...(purchasesBy.get(cid) ?? []), { at: Date.parse(o.createdAt), products: new Set(productsOf(o).map((p) => p.id ?? 0)) }])
  }
  const boughtAfter = new Map<number, number>()
  const repeatViewers = new Map<number, number>()
  for (const r of firstViews) {
    const product = Number(r.product)
    const seen = new Date(r.first_view as string).getTime()
    if (Number(r.days) >= 2) inc(repeatViewers, product)
    if ((purchasesBy.get(Number(r.customer)) ?? []).some((o) => o.at >= seen && o.products.has(product))) inc(boughtAfter, product)
  }
  const interestIds = interestRows.map((r) => Number(r.product))
  const missing = interestIds.filter((id) => !info.has(id))
  for (const [id, p] of await productInfo(payload, missing, lang)) info.set(id, p)
  const interest = interestRows.map((r) => {
    const product = Number(r.product)
    return {
      product,
      name: info.get(product)?.name ?? `#${product}`,
      customers: Number(r.customers),
      views: Number(r.views),
      seconds: Number(r.seconds),
      adds: Number(r.adds),
      repeatCustomers: repeatViewers.get(product) ?? 0,
      boughtAfter: boughtAfter.get(product) ?? 0,
    }
  })

  const catIds = [...new Set(personas.flatMap((p) => p.topCategories.map(([id]) => id)))]

  return {
    period,
    since,
    kpis: {
      buyers: buyers.length,
      newBuyers: buyers.filter((c) => inPeriod(c.firstOrderAt)).length,
      returning,
      returningShare: buyers.length ? returning / buyers.length : 0,
      orders: orders.length,
      revenue,
      averageOrder: orders.length ? revenue / orders.length : 0,
      repeatOrderShare: orders.length ? repeatOrders / orders.length : 0,
      avgOrdersPerBuyer: buyers.length ? buyers.reduce((s, c) => s + (c.orderCount ?? 0), 0) / buyers.length : 0,
    },
    countries,
    segments,
    personas,
    productNames: new Map([...info.entries()].map(([id, p]) => [id, p.name])),
    categoryNames: await categoryNames(payload, catIds, lang),
    topCustomers: [...buyers].sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0)).slice(0, 10),
    tracking: {
      agreed: customers.filter((c) => c.tracking?.consent).length,
      on: customers.filter((c) => trackingState(c) === 'on').length,
      activeInPeriod: Number(active[0]?.n ?? 0),
    },
    interest,
  }
}

// --- One customer --------------------------------------------------------------------------------

export type ProductInterest = {
  product: number
  name: string
  views: number
  days: number
  seconds: number
  adds: number
  lastSeen: string
  /** Picks they made, most frequent first: [label, times]. */
  picks: [string, number][]
  bought: boolean
  boughtAfterViewing: boolean
}

export type BeforeOrder = { number: number | null | undefined; id: number; createdAt: string; viewed: { product: number; name: string; views: number; bought: boolean }[] }

export type CustomerInsight = {
  orders: Pick<Order, 'id' | 'number' | 'status' | 'total' | 'createdAt' | 'items'>[]
  bought: { product: number | null; name: string; qty: number; spent: number; times: number }[]
  categories: [string, number][]
  interest: ProductInterest[]
  beforeOrders: BeforeOrder[]
  rows: number
}

export async function loadCustomerInsight(payload: Payload, id: number, lang: Lang): Promise<CustomerInsight> {
  const [{ docs: orders }, activity] = await Promise.all([
    payload.find({
      collection: 'orders',
      where: { customerRecord: { equals: id } },
      select: { number: true, status: true, total: true, createdAt: true, items: true },
      sort: '-createdAt',
      depth: 0,
      limit: 0,
      pagination: false,
    }),
    rows(payload, sql`select type, product, detail, seconds, created_at from customer_activity where customer_id = ${id} order by created_at limit 20000`),
  ])
  const purchases = orders.filter((o) => isPurchase(o.status))

  // What they bought.
  const bought = new Map<string, { product: number | null; name: string; qty: number; spent: number; times: number }>()
  for (const o of purchases)
    for (const p of productsOf(o)) {
      const key = p.id ? `#${p.id}` : p.name
      const e = bought.get(key) ?? { product: p.id, name: p.name, qty: 0, spent: 0, times: 0 }
      e.qty += p.qty
      e.spent += p.total
      e.times++
      bought.set(key, e)
    }

  const ids = [...new Set([...[...bought.values()].map((b) => b.product), ...activity.map((r) => Number(r.product))].filter((v): v is number => Boolean(v)))]
  const info = await productInfo(payload, ids, lang)
  for (const b of bought.values()) if (b.product && info.has(b.product)) b.name = info.get(b.product)!.name

  const catCount = new Map<number, number>()
  for (const b of bought.values()) for (const c of (b.product && info.get(b.product)?.categories) || []) inc(catCount, c, b.qty)
  const cats = await categoryNames(payload, [...catCount.keys()], lang)

  // Browsing, per product.
  const purchaseTimes = purchases.map((o) => ({ at: Date.parse(o.createdAt), products: new Set(productsOf(o).map((p) => p.id)) }))
  const per = new Map<number, { views: number; days: Set<string>; seconds: number; adds: number; first: number; last: string; picks: Map<string, number> }>()
  for (const r of activity) {
    const product = Number(r.product)
    const at = new Date(r.created_at as string)
    const e = per.get(product) ?? { views: 0, days: new Set<string>(), seconds: 0, adds: 0, first: at.getTime(), last: at.toISOString(), picks: new Map() }
    if (r.type === 'view') {
      e.views++
      e.days.add(at.toISOString().slice(0, 10))
    }
    if (r.type === 'time') e.seconds += Number(r.seconds ?? 0)
    if (r.type === 'add') e.adds++
    if (r.type === 'choice')
      for (const [k, v] of readDetail(r.detail as string)) {
        const label = pickLabel(k, v, info.get(product), lang)
        if (label) inc(e.picks, label)
      }
    e.last = at.toISOString()
    per.set(product, e)
  }
  const interest = [...per.entries()]
    .map(([product, e]): ProductInterest => ({
      product,
      name: info.get(product)?.name ?? `#${product}`,
      views: e.views,
      days: e.days.size,
      seconds: e.seconds,
      adds: e.adds,
      lastSeen: e.last,
      picks: [...e.picks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
      bought: purchaseTimes.some((o) => o.products.has(product)),
      boughtAfterViewing: purchaseTimes.some((o) => o.at >= e.first && o.products.has(product)),
    }))
    .sort((a, b) => b.views - a.views || b.seconds - a.seconds)

  // What they looked at between one purchase and the next (only where browsing was recorded).
  const chronological = [...purchases].reverse()
  const beforeOrders: BeforeOrder[] = []
  for (let i = 0; i < chronological.length; i++) {
    const o = chronological[i]
    const from = i ? Date.parse(chronological[i - 1].createdAt) : 0
    const to = Date.parse(o.createdAt)
    const views = new Map<number, number>()
    for (const r of activity) {
      const at = new Date(r.created_at as string).getTime()
      if (r.type === 'view' && at >= from && at < to) inc(views, Number(r.product))
    }
    if (!views.size) continue
    const inOrder = new Set(productsOf(o).map((p) => p.id))
    beforeOrders.push({
      id: o.id,
      number: o.number,
      createdAt: o.createdAt,
      viewed: [...views.entries()]
        .map(([product, n]) => ({ product, name: info.get(product)?.name ?? `#${product}`, views: n, bought: inOrder.has(product) }))
        .sort((a, b) => Number(b.bought) - Number(a.bought) || b.views - a.views),
    })
  }

  return {
    orders,
    bought: [...bought.values()].sort((a, b) => b.qty - a.qty),
    categories: [...catCount.entries()].sort((a, b) => b[1] - a[1]).map(([cid, n]) => [cats.get(cid) ?? `#${cid}`, n]),
    interest,
    beforeOrders: beforeOrders.reverse(),
    rows: activity.length,
  }
}

// Customer personas for the insights page: buyers grouped by how often they buy (one-time /
// returning / loyal) and where they live (Jordan / abroad). Every number on a persona is counted
// from real orders; nothing is guessed about who the people are. No server imports: unit tests use it.

import type { Segment } from './customerStats'

export type Market = 'jordan' | 'abroad'

export type PersonaCustomer = {
  id: number
  segment: Segment
  country: string | null
  orderCount: number
  totalSpent: number
  lastOrderAt: string | null
  daysBetween: number | null
  /** Pieces bought per category id. */
  categories: Map<number, number>
  /** Pieces bought per product id. */
  products: Map<number, number>
}

export type Persona = {
  key: string
  segment: Exclude<Segment, 'none'>
  market: Market
  customers: number
  /** Of all buyers. */
  share: number
  revenue: number
  revenueShare: number
  avgOrders: number
  avgSpend: number
  averageOrder: number
  /** Average days between purchases, over members with two or more. */
  avgDaysBetween: number | null
  /** Members whose last purchase was within ACTIVE_DAYS. */
  activeShare: number
  /** [country, members], most first. */
  topCountries: [string, number][]
  /** [category id, members who bought from it], most first. */
  topCategories: [number, number][]
  /** [product id, pieces bought], most first. */
  topProducts: [number, number][]
}

export const ACTIVE_DAYS = 90

export const marketOf = (country: string | null | undefined): Market => (!country || /^jordan$/i.test(country.trim()) ? 'jordan' : 'abroad')

const top = <K>(m: Map<K, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
const add = <K>(m: Map<K, number>, k: K, by = 1) => m.set(k, (m.get(k) ?? 0) + by)

export function buildPersonas(customers: PersonaCustomer[], now = Date.now()): Persona[] {
  const buyers = customers.filter((c) => c.segment !== 'none')
  const revenueAll = buyers.reduce((s, c) => s + c.totalSpent, 0)
  const groups = new Map<string, PersonaCustomer[]>()
  for (const c of buyers) {
    const key = `${c.segment}:${marketOf(c.country)}`
    groups.set(key, [...(groups.get(key) ?? []), c])
  }

  return [...groups.entries()]
    .map(([key, members]): Persona => {
      const [segment, market] = key.split(':') as [Persona['segment'], Market]
      const revenue = members.reduce((s, c) => s + c.totalSpent, 0)
      const orders = members.reduce((s, c) => s + c.orderCount, 0)
      const gaps = members.filter((c) => c.daysBetween !== null)
      const countries = new Map<string, number>()
      const categories = new Map<number, number>()
      const products = new Map<number, number>()
      for (const c of members) {
        add(countries, c.country || '–')
        for (const id of c.categories.keys()) add(categories, id)
        for (const [id, qty] of c.products) add(products, id, qty)
      }
      const active = members.filter((c) => c.lastOrderAt && now - Date.parse(c.lastOrderAt) <= ACTIVE_DAYS * 86400_000).length
      return {
        key,
        segment,
        market,
        customers: members.length,
        share: members.length / buyers.length,
        revenue,
        revenueShare: revenueAll ? revenue / revenueAll : 0,
        avgOrders: orders / members.length,
        avgSpend: revenue / members.length,
        averageOrder: orders ? revenue / orders : 0,
        avgDaysBetween: gaps.length ? Math.round(gaps.reduce((s, c) => s + (c.daysBetween ?? 0), 0) / gaps.length) : null,
        activeShare: active / members.length,
        topCountries: top(countries, 3),
        topCategories: top(categories, 3),
        topProducts: top(products, 3),
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
}

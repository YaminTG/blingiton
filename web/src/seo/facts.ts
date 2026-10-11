// The facts a writer (this session or the Claude API) is allowed to use for a product or category.
// Anything not in here — or in Site settings → SEO writing → facts — must not be claimed.

import type { Category, Media, Product } from '@/payload-types'

type LocalizedValue<T> = T | { en?: T | null; ar?: T | null } | null | undefined
const en = <T>(v: LocalizedValue<T>): T | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) && ('en' in v || 'ar' in v) ? ((v as { en?: T }).en ?? undefined) : ((v as T) ?? undefined)

export type ProductFacts = {
  id: number
  name: string
  kind: string
  categories: string[]
  priceJOD: number
  wasJOD?: number
  availability: string
  personalization?: { type: string; stones?: string; chainLengthsCm?: string[] }
  options?: { name: string; choices: { label: string; extraJOD: number }[] }[]
  searchPhrases?: string
  oldSiteText?: string
  photos: number
}

const MAX_OLD_TEXT = 600

/** `product` should be loaded with depth ≥ 1 and locale 'all' (or 'en'). */
export function productFacts(product: Product): ProductFacts {
  const cats = (product.categories ?? []).filter((c): c is Category => typeof c === 'object').map((c) => en(c.name) ?? '')
  const p = product.personalization
  const old = product.legacy?.description?.replace(/\s+/g, ' ').trim()
  return {
    id: product.id,
    name: en(product.name) ?? '',
    kind: product.kind,
    categories: cats.filter(Boolean),
    priceJOD: product.price,
    wasJOD: product.compareAtPrice ?? undefined,
    availability: product.availability,
    personalization:
      p?.type && p.type !== 'none'
        ? { type: p.type, stones: p.stones !== 'none' ? (p.stones ?? undefined) : undefined, chainLengthsCm: p.chainLengths?.length ? p.chainLengths : undefined }
        : undefined,
    options: p?.options?.length
      ? p.options.map((o) => ({
          name: en(o.name) ?? '',
          choices: (o.choices ?? []).map((c) => ({ label: en(c.label) ?? '', extraJOD: c.extraPrice ?? 0 })),
        }))
      : undefined,
    searchPhrases: en(product.keywords) || undefined,
    oldSiteText: old ? (old.length > MAX_OLD_TEXT ? `${old.slice(0, MAX_OLD_TEXT)}…` : old) : undefined,
    photos: (product.images ?? []).length,
  }
}

export type CategoryFacts = { id: number; name: string; parent?: string; productCount: number; examples: string[]; oldSiteText?: string }

export function categoryFacts(category: Category, productNames: string[], parentName?: string): CategoryFacts {
  return {
    id: category.id,
    name: en(category.name) ?? '',
    parent: parentName,
    productCount: productNames.length,
    examples: productNames.slice(0, 12),
    oldSiteText: category.legacy?.description?.slice(0, MAX_OLD_TEXT) || undefined,
  }
}

export const mainImage = (product: Product): Media | undefined => {
  const first = product.images?.[0]
  return first && typeof first === 'object' ? first : undefined
}

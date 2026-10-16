import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload, type Where } from 'payload'

import type { Category, Media, Page, Product, Review, SiteSetting } from '@/payload-types'

import type { BagProduct } from './cart'
import type { Photo, Question, Variant } from './choices'
import type { Locale } from './locales'
import { serverUrl } from './site'
import { tags } from './tags'
import { paths } from './urls'

// Public reads go through access control as an anonymous visitor (overrideAccess: false),
// so drafts and unapproved content can never leak onto the site.
const payload = () => getPayload({ config })
const asVisitor = { overrideAccess: false, depth: 1 } as const

export const PAGE_SIZE = 24

export const getSettings = unstable_cache(
  async (locale: Locale): Promise<SiteSetting> => (await payload()).findGlobal({ slug: 'site-settings', locale, ...asVisitor }),
  ['site-settings'],
  { tags: [tags.settings] },
)

export const getProduct = (locale: Locale, slug: string) =>
  unstable_cache(
    async (): Promise<Product | null> => {
      const res = await (await payload()).find({ collection: 'products', locale, where: { slug: { equals: slug } }, limit: 1, ...asVisitor })
      return res.docs[0] ?? null
    },
    ['product', locale, slug],
    { tags: [tags.products] },
  )()

/** Approved reviews only (the collection's access rule hides the rest), newest first. */
export const getProductReviews = (productId: number) =>
  unstable_cache(
    async (): Promise<Review[]> =>
      (await (await payload()).find({ collection: 'reviews', where: { product: { equals: productId } }, sort: '-date', limit: 50, overrideAccess: false, depth: 0 })).docs,
    ['product-reviews', String(productId)],
    { tags: [tags.products, tags.product(productId)] },
  )()

type ProductList = { docs: Product[]; totalDocs: number; totalPages: number; page: number }

export type PriceBand = 'lt40' | '40to60' | 'gt60'
export type SortOrder = 'loved' | 'low' | 'high'
export type ListOptions = {
  categoryId?: number
  featured?: boolean
  page?: number
  limit?: number
  exclude?: number
  price?: PriceBand
  /** true: any personalised piece; 'name': name pieces only. */
  personal?: boolean | 'name'
  kind?: Product['kind']
  sort?: SortOrder
}

const priceWhere: Record<PriceBand, Where> = {
  lt40: { price: { less_than: 40 } },
  '40to60': { and: [{ price: { greater_than_equal: 40 } }, { price: { less_than_equal: 60 } }] },
  gt60: { price: { greater_than: 60 } },
}
const sorts: Record<SortOrder, string[]> = {
  loved: ['-featured', '-createdAt'],
  low: ['price', '-featured'],
  high: ['-price', '-featured'],
}

export const listProducts = unstable_cache(
  async (locale: Locale, opts: ListOptions = {}): Promise<ProductList> => {
    // A product without a price yet (0 JOD) stays out of listings until the shop sets one.
    const and: Where[] = [{ price: { greater_than: 0 } }]
    if (opts.categoryId) and.push({ categories: { in: [opts.categoryId] } })
    if (opts.featured) and.push({ featured: { equals: true } })
    if (opts.exclude) and.push({ id: { not_equals: opts.exclude } })
    if (opts.price) and.push(priceWhere[opts.price])
    if (opts.personal === 'name') and.push({ 'personalization.type': { equals: 'name' } })
    else if (opts.personal) and.push({ 'personalization.type': { not_equals: 'none' } })
    if (opts.kind) and.push({ kind: { equals: opts.kind } })
    const res = await (await payload()).find({
      collection: 'products',
      locale,
      where: { and },
      sort: sorts[opts.sort ?? 'loved'],
      page: opts.page ?? 1,
      limit: opts.limit ?? PAGE_SIZE,
      ...asVisitor,
    })
    return { docs: res.docs, totalDocs: res.totalDocs, totalPages: res.totalPages, page: res.page ?? 1 }
  },
  ['products-list', 'v2'],
  { tags: [tags.products] },
)

export const listCategories = unstable_cache(
  async (locale: Locale): Promise<Category[]> =>
    (await (await payload()).find({ collection: 'categories', locale, sort: 'order', limit: 100, ...asVisitor })).docs,
  ['categories'],
  { tags: [tags.categories] },
)

export const getCategory = (locale: Locale, slug: string) =>
  unstable_cache(
    async (): Promise<Category | null> =>
      (await (await payload()).find({ collection: 'categories', locale, where: { slug: { equals: slug } }, limit: 1, ...asVisitor })).docs[0] ?? null,
    ['category', locale, slug],
    { tags: [tags.categories] },
  )()

export const getPage = (locale: Locale, slug: string) =>
  unstable_cache(
    async (): Promise<Page | null> =>
      (await (await payload()).find({ collection: 'pages', locale, where: { slug: { equals: slug } }, limit: 1, ...asVisitor })).docs[0] ?? null,
    ['page', locale, slug],
    { tags: [tags.pages] },
  )()

/** Everything the sitemap and the Merchant feed need, in one light query per collection. */
export const getIndexables = unstable_cache(
  async () => {
    const p = await payload()
    const [products, categories, pages] = await Promise.all([
      p.find({ collection: 'products', locale: 'en', limit: 0, overrideAccess: false, depth: 1, select: { slug: true, name: true, updatedAt: true, images: true, price: true, availability: true, description: true, shortDescription: true, categories: true } }),
      p.find({ collection: 'categories', locale: 'en', limit: 0, overrideAccess: false, depth: 0, select: { slug: true, updatedAt: true } }),
      p.find({ collection: 'pages', locale: 'en', limit: 0, overrideAccess: false, depth: 0, select: { slug: true, title: true, updatedAt: true } }),
    ])
    return { products: products.docs as Product[], categories: categories.docs as Category[], pages: pages.docs as Page[] }
  },
  ['indexables', 'v2'],
  { tags: [tags.products, tags.categories, tags.pages] },
)

/**
 * Resolves an old or renamed address (`/product/old-slug`, `/product-category/necklaces/daily-wear`,
 * `/shop/old-slug`) to its current page, using the Redirects collection.
 */
export const lookupRedirect = unstable_cache(
  async (from: string, locale: Locale): Promise<string | null> => {
    const key = normalizePath(from)
    const res = await (await payload()).find({ collection: 'redirects', where: { from: { equals: key } }, limit: 1, depth: 1, overrideAccess: false })
    const to = res.docs[0]?.to
    if (!to) return null
    if (to.type === 'custom' && to.url) return to.url
    const ref = to.reference
    const doc = ref && typeof ref.value === 'object' ? ref.value : null
    if (!ref || !doc || !('slug' in doc) || !doc.slug) return null
    if (ref.relationTo === 'products') return paths.product(locale, doc.slug)
    if (ref.relationTo === 'categories') return paths.category(locale, doc.slug)
    if (ref.relationTo === 'pages') return paths.page(locale, doc.slug)
    return null
  },
  ['redirect'],
  { tags: [tags.redirects, tags.products, tags.categories] },
)

/** An unpublished product's address: send visitors (and Google) to its category instead of a 404. */
export const retiredProductTarget = unstable_cache(
  async (slug: string, locale: Locale): Promise<string | null> => {
    const p = await payload()
    const res = await p.find({ collection: 'products', where: { slug: { equals: slug } }, limit: 1, depth: 1, overrideAccess: true, select: { categories: true } })
    const category = (res.docs[0]?.categories ?? []).find((c): c is Category => typeof c === 'object' && Boolean(c?.slug))
    return category ? paths.category(locale, category.slug ?? '') : null
  },
  ['retired-product'],
  { tags: [tags.products, tags.categories] },
)

/** Names, photos and prices for the bag and checkout. Only published products come back. */
export const getBagProducts = unstable_cache(
  async (locale: Locale, ids: number[]): Promise<BagProduct[]> => {
    if (!ids.length) return []
    const res = await (await payload()).find({ collection: 'products', locale, where: { id: { in: ids } }, limit: ids.length, ...asVisitor })
    return res.docs.map(toBagProduct)
  },
  ['bag-products', 'v3'],
  { tags: [tags.products] },
)

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

const photoOf = (value: number | Media | null | undefined): Photo | null => {
  const media = mediaOf(value)
  const large = imageUrl(media, 'large')
  return large ? { large, thumb: imageUrl(media, 'thumb') ?? large } : null
}

export const toBagProduct = (p: Product): BagProduct => {
  const pers = p.personalization
  const questions: Question[] = (pers?.options ?? []).map((o) => ({
    id: o.id ?? '',
    name: o.name,
    look: o.look ?? 'other',
    when: ids(o.when),
    choices: (o.choices ?? []).map((c) => ({
      id: c.id ?? '',
      label: c.label,
      extra: c.extraPrice ?? 0,
      picture: c.picture ?? null,
      photo: photoOf(c.photo),
      when: ids(c.when),
    })),
  }))
  const variants: Variant[] = (pers?.variants ?? []).map((v) => ({
    id: v.id ?? '',
    when: ids(v.when),
    price: v.price ?? null,
    stock: v.stock ?? null,
    photo: photoOf(v.photo),
  }))
  // Only "in stock" pieces count their stock; made-to-order pieces are made as they sell.
  const out = p.availability === 'sold_out' || (p.availability === 'in_stock' && typeof p.stock === 'number' && p.stock <= 0)
  return {
    id: p.id,
    slug: p.slug ?? '',
    name: p.name,
    price: p.price,
    image: imageUrl(mediaOf(p.images?.[0]), 'thumb'),
    type: pers?.type ?? 'none',
    textOptional: Boolean(pers?.textOptional),
    stones: pers?.stones ?? 'none',
    goldExtra: pers?.goldPlated ? (pers.goldPlatedExtra ?? 0) : 0,
    questions,
    variants,
    soldOut: out,
    made: p.availability !== 'in_stock',
  }
}

export const normalizePath = (path: string) => {
  let p = path
  try {
    p = decodeURIComponent(path)
  } catch {
    // keep as-is
  }
  return p.toLowerCase().replace(/\/+$/, '') || '/'
}

export const mediaOf = (value: number | Media | null | undefined): Media | null => (value && typeof value === 'object' ? value : null)

/**
 * Best URL for a photo at a given size, falling back to the original. Our own files come back
 * as site-relative paths (what next/image expects); cloud storage URLs stay absolute.
 */
export const imageUrl = (media: Media | null, size: 'thumb' | 'card' | 'large' = 'card') => {
  const url = media ? (media.sizes?.[size]?.url ?? media.url ?? null) : null
  return url && url.startsWith(serverUrl) ? url.slice(serverUrl.length) : url
}

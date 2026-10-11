import type { MetadataRoute } from 'next'

import { getIndexables, imageUrl, mediaOf } from '@/lib/data'
import { locales, type Locale } from '@/lib/locales'
import { absolute, paths } from '@/lib/urls'

// Rebuilt from the database; the save hooks refresh it through the products/categories cache tags.
export const revalidate = 3600

const entry = (build: (l: Locale) => string, lastModified?: string | Date, images?: string[]): MetadataRoute.Sitemap =>
  locales.map((l) => ({
    url: absolute(build(l)),
    lastModified: lastModified ? new Date(lastModified) : undefined,
    alternates: { languages: Object.fromEntries(locales.map((x) => [x, absolute(build(x))])) },
    images,
  }))

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products, categories, pages } = await getIndexables()
  return [
    ...entry(paths.home),
    ...entry(paths.shop),
    ...categories.flatMap((c) => entry((l) => paths.category(l, c.slug ?? ''), c.updatedAt)),
    ...products.flatMap((p) => {
      const images = (p.images ?? []).map((m) => imageUrl(mediaOf(m), 'large')).filter((u): u is string => Boolean(u)).map(absolute)
      return entry((l) => paths.product(l, p.slug ?? ''), p.updatedAt, images)
    }),
    ...pages.flatMap((pg) => entry((l) => paths.page(l, pg.slug ?? ''), pg.updatedAt)),
  ]
}

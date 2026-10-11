import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

import { JsonLd } from '@/components/JsonLd'
import { isFiltered, readFilters, type RawParams } from '@/components/shop/filters'
import { ShopView } from '@/components/shop/ShopView'
import { getCategory, imageUrl, listCategories, listProducts, lookupRedirect, mediaOf } from '@/lib/data'
import { dictionary } from '@/lib/dictionary'
import { isLocale, type Locale } from '@/lib/locales'
import { isProduction } from '@/lib/site'
import { absolute, alternates, paths } from '@/lib/urls'
import { breadcrumbJsonLd, categoryCrumbs, itemListJsonLd } from '@/seo/jsonld'

type Props = { params: Promise<{ locale: string; category: string }>; searchParams: Promise<RawParams> }

async function load(locale: Locale, slug: string) {
  const category = await getCategory(locale, slug)
  if (category) return category
  // Renamed or old address: send it on, permanently.
  const target = await lookupRedirect(`/shop/${slug}`, locale)
  if (target) permanentRedirect(target)
  notFound()
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, category: slug } = await params
  if (!isLocale(locale)) return {}
  const category = await getCategory(locale, slug)
  if (!category) return {}
  const f = readFilters(await searchParams)
  const filtered = isFiltered(f)
  const t = dictionary(locale)
  const title = category.meta?.title || `${category.name} | Blingiton`
  const description = category.meta?.description || category.intro || undefined
  const share = imageUrl(mediaOf(category.meta?.image) ?? mediaOf(category.image), 'large')
  return {
    title: { absolute: f.page > 1 ? title.replace(' | Blingiton', ` – ${t.page} ${f.page} | Blingiton`) : title },
    description,
    alternates: alternates(locale, (l) => paths.category(l, slug), !filtered && f.page > 1 ? `?page=${f.page}` : ''),
    openGraph: { title, description, url: absolute(paths.category(locale, slug)), images: share ? [absolute(share)] : undefined },
    ...(filtered && isProduction ? { robots: { index: false, follow: true } } : {}),
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { locale, category: slug } = await params
  if (!isLocale(locale)) notFound()
  const t = dictionary(locale)
  const category = await load(locale, slug)
  const f = readFilters(await searchParams)
  const [all, list] = await Promise.all([
    listCategories(locale),
    listProducts(locale, { categoryId: category.id, page: f.page, price: f.price, personal: f.personal, sort: f.sort }),
  ])
  if (f.page > 1 && f.page > list.totalPages) notFound()
  const crumbs = [...categoryCrumbs(category, all, locale, t.home)]
  crumbs.splice(1, 0, { name: t.shop, path: paths.shop(locale) })
  const subcategories = all.filter((c) => (typeof c.parent === 'object' ? c.parent?.id : c.parent) === category.id)

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd(crumbs), itemListJsonLd(list.docs, locale)]} />
      <ShopView
        locale={locale}
        t={t}
        title={category.name}
        lead={category.intro || t.shopLead}
        categories={all.filter((c) => !c.parent)}
        current={category}
        subcategories={subcategories}
        filters={f}
        list={list}
        base={paths.category(locale, slug)}
      />
    </>
  )
}

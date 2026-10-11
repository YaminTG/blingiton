import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { JsonLd } from '@/components/JsonLd'
import { isFiltered, readFilters, type RawParams } from '@/components/shop/filters'
import { ShopView } from '@/components/shop/ShopView'
import { getSettings, listCategories, listProducts } from '@/lib/data'
import { dictionary } from '@/lib/dictionary'
import { isLocale } from '@/lib/locales'
import { isProduction } from '@/lib/site'
import { alternates, paths } from '@/lib/urls'
import { breadcrumbJsonLd, itemListJsonLd } from '@/seo/jsonld'

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<RawParams> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const f = readFilters(await searchParams)
  // Editable in Site settings → SEO: home & shop; these are only fallbacks.
  const settings = await getSettings(locale)
  const title = settings.pageSeo?.shopTitle || (locale === 'ar' ? 'تسوّق مجوهرات فضة 925 مصنوعة يدوياً في الأردن | Blingiton' : 'Shop 925 Silver Jewelry Handmade in Jordan | Blingiton')
  const description =
    settings.pageSeo?.shopDescription ||
    (locale === 'ar'
      ? 'سلاسل وأساور وحلق وخواتم وقطع بالأسماء من الفضة 925، مصنوعة يدوياً في الأردن. القطع المخصّصة جاهزة خلال 4 أيام.'
      : 'Necklaces, bracelets, earrings, rings and name pieces in 925 sterling silver, handmade in Jordan. Personalised pieces ready in 4 days.')
  const filtered = isFiltered(f)
  return {
    title: { absolute: f.page > 1 ? `${title.replace(' | Blingiton', '')} – ${dictionary(locale).page} ${f.page} | Blingiton` : title },
    description,
    // Filtered and re-sorted views point Google at the plain listing and stay out of the index.
    alternates: alternates(locale, paths.shop, !filtered && f.page > 1 ? `?page=${f.page}` : ''),
    ...(filtered && isProduction ? { robots: { index: false, follow: true } } : {}),
  }
}

export default async function Shop({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = dictionary(locale)
  const f = readFilters(await searchParams)
  const [categories, list] = await Promise.all([
    listCategories(locale),
    listProducts(locale, { page: f.page, price: f.price, personal: f.personal, sort: f.sort }),
  ])
  if (f.page > 1 && f.page > list.totalPages) notFound()

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: t.home, path: paths.home(locale) }, { name: t.shop, path: paths.shop(locale) }]), itemListJsonLd(list.docs, locale)]} />
      <ShopView
        locale={locale}
        t={t}
        title={t.shop}
        lead={t.shopLead}
        categories={categories.filter((c) => !c.parent)}
        current={null}
        subcategories={[]}
        filters={f}
        list={list}
        base={paths.shop(locale)}
      />
    </>
  )
}

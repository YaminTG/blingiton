import { formatMoney } from './currency'
import type { Locale } from './locales'
import { locales } from './locales'
import { serverUrl } from './site'

// Every public URL is built here, so pages, sitemap, structured data and redirects agree.
export const paths = {
  home: (l: Locale) => `/${l}`,
  shop: (l: Locale) => `/${l}/shop`,
  category: (l: Locale, slug: string) => `/${l}/shop/${slug}`,
  product: (l: Locale, slug: string) => `/${l}/product/${slug}`,
  page: (l: Locale, slug: string) => `/${l}/${slug}`,
  checkout: (l: Locale) => `/${l}/checkout`,
  review: (l: Locale) => `/${l}/review`,
  yourData: (l: Locale) => `/${l}/your-data`,
  orderStatus: (l: Locale) => `/${l}/order-status`,
  finder: (l: Locale) => `/${l}/finder`,
}

export const absolute = (path: string) => (path.startsWith('http') ? path : `${serverUrl}${path}`)

/** Canonical + hreflang alternates for a path that exists in every locale. */
export function alternates(locale: Locale, build: (l: Locale) => string, query = '') {
  const languages = Object.fromEntries(locales.map((l) => [l, absolute(build(l) + query)])) as Record<string, string>
  languages['x-default'] = absolute(build('en') + query)
  return { canonical: absolute(build(locale) + query), languages }
}

/** An amount in JOD, for places that always show the shop's own currency (emails, llms.txt). Pages use <Price>. */
export const money = (amount: number, locale: Locale) => formatMoney(amount, 'JOD', locale)

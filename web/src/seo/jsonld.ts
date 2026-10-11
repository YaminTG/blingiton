// schema.org structured data. Only facts stored in the CMS are emitted; nothing is inferred.

import type { Category, Product, Review, SiteSetting } from '@/payload-types'
import { imageUrl, mediaOf } from '@/lib/data'
import type { Locale } from '@/lib/locales'
import { absolute, paths } from '@/lib/urls'

import { BRAND } from './rules'

const availability: Record<Product['availability'], string> = {
  in_stock: 'https://schema.org/InStock',
  made_to_order: 'https://schema.org/MadeToOrder',
  sold_out: 'https://schema.org/OutOfStock',
}

// Delivery days, matching what checkout promises (dictionary co.ammanTime / co.jordanTime and the
// product page's "Made to order in 4 days"). International (DHL, any country) isn't expressible per country.
const days = (min: number, max: number) => ({ '@type': 'QuantitativeValue', minValue: min, maxValue: max, unitCode: 'DAY' })
const MADE_TO_ORDER = days(4, 4)
const READY = days(0, 1)

function shippingJsonLd(settings: SiteSetting, madeToOrder: boolean) {
  const d = settings.delivery
  const zone = (fee: number | null | undefined, transit: [number, number], region?: string) =>
    fee == null
      ? null
      : {
          '@type': 'OfferShippingDetails',
          shippingRate: { '@type': 'MonetaryAmount', value: fee, currency: 'JOD' },
          shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'JO', ...(region ? { addressRegion: [region] } : {}) },
          deliveryTime: { '@type': 'ShippingDeliveryTime', handlingTime: madeToOrder ? MADE_TO_ORDER : READY, transitTime: days(...transit) },
        }
  // Amman (ISO 3166-2 JO-AM) is the more specific zone, so it wins over the rest of Jordan.
  const zones = [zone(d?.amman, [1, 2], 'AM'), zone(d?.jordan, [2, 3])].filter(Boolean)
  return zones.length ? zones : undefined
}

/** Nothing is claimed until the shop has set a return window in Site settings. */
function returnPolicyJsonLd(settings: SiteSetting, personal: boolean) {
  const daysAllowed = settings.delivery?.returnDays
  if (daysAllowed == null) return undefined
  const allowed = daysAllowed > 0 && (!personal || Boolean(settings.delivery?.personalisedReturns))
  return {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: 'JO',
    returnPolicyCategory: allowed ? 'https://schema.org/MerchantReturnFiniteReturnWindow' : 'https://schema.org/MerchantReturnNotPermitted',
    ...(allowed ? { merchantReturnDays: daysAllowed } : {}),
  }
}

function ratingJsonLd(reviews: Review[]) {
  if (!reviews.length) return {}
  const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
  return {
    aggregateRating: { '@type': 'AggregateRating', ratingValue: average.toFixed(1), reviewCount: reviews.length, bestRating: 5, worstRating: 1 },
    review: reviews.slice(0, 10).map((r) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.author },
      datePublished: r.date.slice(0, 10),
      reviewBody: r.body || undefined,
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
    })),
  }
}

/** `reviews` must be approved reviews only; schema.org reviews have to match what the page shows. */
export function productJsonLd(product: Product, locale: Locale, settings: SiteSetting, reviews: Review[]) {
  const images = (product.images ?? []).map((m) => imageUrl(mediaOf(m), 'large')).filter((u): u is string => Boolean(u)).map(absolute)
  const url = absolute(paths.product(locale, product.slug ?? ''))
  const personal = Boolean(product.personalization?.type && product.personalization.type !== 'none')
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.name,
    description: product.description || product.shortDescription || undefined,
    image: images,
    sku: `BL-${product.id}`,
    brand: { '@type': 'Brand', name: BRAND },
    url,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'JOD',
      price: product.price.toFixed(2),
      availability: availability[product.availability],
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: BRAND },
      shippingDetails: shippingJsonLd(settings, product.availability === 'made_to_order' || personal),
      hasMerchantReturnPolicy: returnPolicyJsonLd(settings, personal),
    },
    ...ratingJsonLd(reviews),
  }
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: absolute(item.path) })),
  }
}

export function itemListJsonLd(products: Product[], locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: absolute(paths.product(locale, p.slug ?? '')), name: p.name })),
  }
}

export function storeJsonLd(settings: SiteSetting, locale: Locale) {
  const a = settings.address
  const sameAs = [settings.social?.instagram, settings.social?.tiktok, settings.social?.facebook].filter(Boolean)
  return {
    '@context': 'https://schema.org',
    '@type': 'JewelryStore',
    '@id': `${absolute('/')}#store`,
    name: settings.businessName || BRAND,
    url: absolute(paths.home(locale)),
    logo: absolute('/logo.png'),
    image: absolute('/logo.png'),
    telephone: settings.phone || (settings.whatsapp ? `+${settings.whatsapp}` : undefined),
    email: settings.email || undefined,
    priceRange: '$$',
    currenciesAccepted: 'JOD',
    address: {
      '@type': 'PostalAddress',
      streetAddress: a?.street || undefined,
      addressLocality: a?.city || undefined,
      postalCode: a?.postalCode || undefined,
      addressCountry: a?.country || 'JO',
    },
    geo: a?.latitude && a?.longitude ? { '@type': 'GeoCoordinates', latitude: a.latitude, longitude: a.longitude } : undefined,
    openingHoursSpecification: settings.openingHours?.length
      ? settings.openingHours.map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.days, opens: h.opens, closes: h.closes }))
      : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  }
}

export function websiteJsonLd(locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND,
    url: absolute(paths.home(locale)),
    inLanguage: locale,
    publisher: { '@id': `${absolute('/')}#store` },
  }
}

export const categoryCrumbs = (category: Category, all: Category[], locale: Locale, homeLabel: string) => {
  const chain: Category[] = [category]
  let parent = category.parent
  while (parent) {
    const p = typeof parent === 'object' ? parent : all.find((c) => c.id === parent)
    if (!p || chain.includes(p)) break
    chain.unshift(p)
    parent = p.parent
  }
  return [{ name: homeLabel, path: paths.home(locale) }, ...chain.map((c) => ({ name: c.name, path: paths.category(locale, c.slug ?? '') }))]
}

/** Safe for inline <script>: JSON.stringify does not escape "<". */
export const serializeJsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c')

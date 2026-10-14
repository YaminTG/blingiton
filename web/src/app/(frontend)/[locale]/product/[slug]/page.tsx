import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'

import { Icon } from '@/components/Icon'
import { JsonLd } from '@/components/JsonLd'
import { ProductCard } from '@/components/ProductCard'
import { Gallery } from '@/components/product/Gallery'
import { LivePrice } from '@/components/product/LivePrice'
import { ProductForm, type FormProduct } from '@/components/product/ProductForm'
import { Price } from '@/components/store/Money'
import type { Category } from '@/payload-types'
import { getProduct, getProductReviews, getSettings, imageUrl, listCategories, listProducts, lookupRedirect, mediaOf, retiredProductTarget, toBagProduct } from '@/lib/data'
import { dictionary } from '@/lib/dictionary'
import { isLocale, type Locale } from '@/lib/locales'
import { absolute, alternates, paths } from '@/lib/urls'
import { breadcrumbJsonLd, categoryCrumbs, productJsonLd } from '@/seo/jsonld'

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ name?: string | string[]; style?: string | string[] }> }

async function load(locale: Locale, slug: string) {
  const product = await getProduct(locale, slug)
  if (product) return product
  // Old WooCommerce links, renamed slugs and unpublished products all resolve here.
  const target = (await lookupRedirect(`/product/${slug}`, locale)) ?? (await retiredProductTarget(slug, locale))
  if (target) permanentRedirect(target)
  notFound()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const product = await getProduct(locale, slug)
  if (!product) return {}
  const title = product.meta?.title || `${product.name} | Blingiton`
  const description = product.meta?.description || product.shortDescription || undefined
  const share = imageUrl(mediaOf(product.meta?.image) ?? mediaOf(product.images?.[0]), 'large')
  return {
    title: { absolute: title },
    description,
    alternates: alternates(locale, (l) => paths.product(l, slug)),
    openGraph: { title, description, url: absolute(paths.product(locale, slug)), images: share ? [absolute(share)] : undefined },
  }
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { locale, slug } = await params
  const query = await searchParams
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const initial = { name: first(query.name)?.slice(0, 60), style: first(query.style) }
  if (!isLocale(locale)) notFound()
  const t = dictionary(locale)
  const product = await load(locale, slug)
  const [settings, allCategories, reviews] = await Promise.all([getSettings(locale), listCategories(locale), getProductReviews(product.id)])
  const average = reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : ''
  const reviewDate = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-JO-u-nu-latn' : 'en-GB', { dateStyle: 'medium' })

  const categories = (product.categories ?? []).filter((c): c is Category => typeof c === 'object')
  // Most specific category (a subcategory if there is one) for the breadcrumb trail.
  const primary = categories.find((c) => c.parent) ?? categories[0]
  const crumbs = primary ? categoryCrumbs(primary, allCategories, locale, t.home) : [{ name: t.home, path: paths.home(locale) }]
  crumbs.push({ name: product.name, path: paths.product(locale, slug) })

  // Four related pieces: same category first, topped up from the rest of the shop.
  let related = primary ? (await listProducts(locale, { categoryId: primary.id, limit: 4, exclude: product.id })).docs : []
  if (related.length < 4) {
    const more = (await listProducts(locale, { featured: true, limit: 8, exclude: product.id })).docs
    related = [...related, ...more.filter((m) => !related.some((r) => r.id === m.id))].slice(0, 4)
  }

  const photos = (product.images ?? [])
    .map(mediaOf)
    .filter((m) => m !== null)
    .map((m) => ({ id: m.id, large: imageUrl(m, 'large') ?? '', thumb: imageUrl(m, 'thumb') ?? '', alt: m.alt || product.name }))
  const pers = product.personalization
  const personal = Boolean(pers?.type && pers.type !== 'none')
  const bag = toBagProduct(product)
  // "From …" when the choices change the price; the lowest price any combination can have.
  const varies = bag.goldExtra > 0 || bag.questions.some((q) => q.choices.some((c) => c.extra)) || bag.variants.some((v) => v.price !== null && v.price !== bag.price)
  const fromPrice = varies ? Math.min(bag.price, ...bag.variants.flatMap((v) => (v.price !== null ? [v.price] : []))) : null
  const formProduct: FormProduct = {
    ...bag,
    shape: pers?.previewShape ?? null,
    defaultStyle: pers?.defaultStyle ?? 'script',
    sample: pers?.sampleText ?? '',
    goldPlated: Boolean(pers?.goldPlated),
    chains: (pers?.chainLengths ?? []).map(Number).sort((a, b) => a - b),
    madeToOrder: product.availability === 'made_to_order' || personal,
  }
  const url = absolute(paths.product(locale, slug))
  const askHref = settings.whatsapp ? `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(t.askMessage(product.name, url))}` : null
  const details = product.description || (pers?.type === 'engrave' ? t.detailsEngrave : personal ? t.detailsName : t.detailsStd)

  return (
    <>
      <JsonLd data={[productJsonLd(product, locale, settings, reviews), breadcrumbJsonLd(crumbs)]} />
      <nav className="wrap crumbs" aria-label="Breadcrumb">
        <ol>
          {crumbs.map((c, i) =>
            i < crumbs.length - 1 ? (
              <li key={c.path}>
                <Link href={c.path}>{c.name}</Link>
              </li>
            ) : (
              <li key={c.path} aria-current="page">
                {c.name}
              </li>
            ),
          )}
        </ol>
      </nav>
      <div className="wrap pdp">
        <Gallery photos={photos} label={t.photos} showLabel={photos.map((_, i) => t.showPhoto(i + 1))} />
        <section className="info" aria-labelledby="p-title">
          <h1 id="p-title">{product.name}</h1>
          <p className="price-lg">
            <LivePrice base={product.price} from={fromPrice} fromLabel={t.b.from} />
            {product.compareAtPrice && product.compareAtPrice > product.price ? (
              <s>
                <Price jod={product.compareAtPrice} />
              </s>
            ) : null}
          </p>
          {product.shortDescription ? <p className="desc">{product.shortDescription}</p> : null}
          <ProductForm locale={locale} product={formProduct} askHref={askHref} initial={initial} />
          <div className="acc">
            <details open>
              <summary>
                {t.details}
                <Icon name="chevron" />
              </summary>
              <p className="acc-body">{details}</p>
            </details>
            <details>
              <summary>
                {t.delivery}
                <Icon name="chevron" />
              </summary>
              <p>{t.deliveryBody}</p>
            </details>
            <details>
              <summary>
                {t.silverCare}
                <Icon name="chevron" />
              </summary>
              <p>{t.careBody}</p>
            </details>
          </div>
        </section>
      </div>

      {reviews.length ? (
        <section className="section" style={{ paddingTop: 0 }} aria-labelledby="reviews-h">
          <div className="wrap">
            <div className="section-head">
              <h2 className="h2" id="reviews-h">
                {t.reviewsH2}
              </h2>
              <p className="reviews-sum">{t.ratingSummary(average, reviews.length)}</p>
            </div>
            <ul className="review-list">
              {reviews.map((r) => (
                <li key={r.id} className="review">
                  <p className="stars" role="img" aria-label={t.starsLabel(r.rating)}>
                    {'★'.repeat(r.rating)}
                    <span>{'★'.repeat(5 - r.rating)}</span>
                  </p>
                  {r.body ? (
                    <p lang={r.language ?? undefined} dir="auto">
                      {r.body}
                    </p>
                  ) : null}
                  <p className="review-by">
                    {r.author}
                    {r.verifiedPurchase ? ` · ${t.verified}` : ''} · <time dateTime={r.date}>{reviewDate.format(new Date(r.date))}</time>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {related.length ? (
        <section className="section" style={{ paddingTop: 0 }} aria-labelledby="also-h">
          <div className="wrap">
            <div className="section-head">
              <h2 className="h2" id="also-h">
                {t.alsoH2}
              </h2>
            </div>
            <div className="grid four">
              {related.map((r) => (
                <ProductCard key={r.id} product={r} locale={locale} t={t} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}

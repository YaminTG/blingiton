import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { HeroTry } from '@/components/home/HeroTry'
import { Icon } from '@/components/Icon'
import { JsonLd } from '@/components/JsonLd'
import { ProductCard } from '@/components/ProductCard'
import type { Media, Product } from '@/payload-types'
import { getProduct, getSettings, imageUrl, listCategories, listProducts, mediaOf } from '@/lib/data'
import { dictionary } from '@/lib/dictionary'
import { isLocale } from '@/lib/locales'
import { absolute, alternates, money, paths } from '@/lib/urls'
import { storeJsonLd, websiteJsonLd } from '@/seo/jsonld'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const settings = await getSettings(locale)
  // Editable in Site settings → SEO: home & shop; these are only fallbacks.
  const title =
    settings.pageSeo?.homeTitle || (locale === 'ar' ? 'سلسال اسم ومجوهرات فضة 925 يدوية في الأردن | Blingiton' : 'Silver Name Necklaces & Jewelry in Jordan | Blingiton')
  const description = settings.pageSeo?.homeDescription || dictionary(locale).heroLead
  return {
    title: { absolute: title },
    description,
    alternates: alternates(locale, paths.home),
    openGraph: { title, description, url: absolute(paths.home(locale)), images: imageUrl(mediaOf(settings.defaultShareImage), 'large') ?? '/logo.png' },
  }
}

// The crop the shop chose for a photo (its focal point), as CSS object-position.
const focus = (m: Media | null) => (m && typeof m.focalX === 'number' && typeof m.focalY === 'number' ? `${m.focalX}% ${m.focalY}%` : undefined)

export default async function Home({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = dictionary(locale)
  const [settings, categories, loved, cheapestName] = await Promise.all([
    getSettings(locale),
    listCategories(locale),
    listProducts(locale, { featured: true, limit: 8 }),
    listProducts(locale, { personal: 'name', kind: 'necklace', sort: 'low', limit: 1 }),
  ])
  const home = settings.home
  // Settings load one level deep, so fetch the hero product itself to get its photo.
  const heroSlug = home?.heroProduct && typeof home.heroProduct === 'object' ? (home.heroProduct as Product).slug : null
  const hero = heroSlug ? await getProduct(locale, heroSlug) : null
  const heroMedia = mediaOf(hero?.images?.[0])
  const heroSrc = imageUrl(heroMedia, 'thumb')
  const gift = mediaOf(home?.giftPhoto)
  const giftSrc = imageUrl(gift, 'large')
  const instagram = (home?.instagramPhotos ?? []).map(mediaOf).filter((m): m is Media => m !== null)
  const igUrl = settings.social?.instagram || null
  const igHandle = igUrl ? `@${igUrl.replace(/\/+$/, '').split('/').pop()}` : ''
  const fromPrice = cheapestName.docs[0]?.price
  const homeCategories = categories.filter((c) => !c.parent && c.showOnHome)
  const customWa = settings.whatsapp ? `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(t.customMessage)}` : null
  const [h1a, h1glitter, h1b, h1c] = t.heroH1

  return (
    <>
      <JsonLd data={[storeJsonLd(settings, locale), websiteJsonLd(locale)]} />
      <section className="hero">
        <HeroTry
          locale={locale}
          productHref={hero?.slug ? paths.product(locale, hero.slug) : null}
          note={fromPrice ? t.tryNote(money(fromPrice, locale)) : null}
          photo={heroSrc && hero ? { src: heroSrc, alt: heroMedia?.alt || hero.name, caption: `${hero.name} · ${money(hero.price, locale)}` } : null}
          intro={
            <>
              <span className="pill">
                <Icon name="sparkle" className="pill-ico" />
                <span>{t.heroPill}</span>
              </span>
              <h1>
                {h1a}
                <span className="glitter-text">{h1glitter}</span>
                {h1b}
                <br />
                {h1c}
              </h1>
              <p className="lead">{t.heroLead}</p>
            </>
          }
        />
      </section>

      <section className="section" aria-labelledby="cats-h">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="caps eyebrow">{t.catsEyebrow}</span>
              <h2 className="h2" id="cats-h">
                {t.catsH2}
              </h2>
            </div>
          </div>
          <div className="cats">
            {homeCategories.map((c) => {
              const src = imageUrl(mediaOf(c.image), 'thumb')
              return (
                <Link key={c.id} className="cat" href={paths.category(locale, c.slug ?? '')}>
                  {src ? <Image src={src} alt="" width={156} height={156} sizes="156px" /> : <span className="cat-blank" />}
                  <span>{c.name}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {loved.docs.length ? (
        <section className="section" style={{ paddingTop: 0 }} aria-labelledby="loved-h">
          <div className="wrap">
            <div className="section-head">
              <div>
                <span className="caps eyebrow">{t.lovedEyebrow}</span>
                <h2 className="h2" id="loved-h">
                  {t.lovedH2}
                </h2>
              </div>
              <Link className="more" href={paths.shop(locale)}>
                <span>{t.seeAll}</span>
                <Icon name="arrow" className="flip" />
              </Link>
            </div>
            <div className="grid four">
              {loved.docs.map((p) => (
                <ProductCard key={p.id} product={p} locale={locale} t={t} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="gift-h">
        <div className="wrap">
          <div className="gift">
            {giftSrc ? (
              <div className="gift-photo">
                <Image className="main" src={giftSrc} alt={gift?.alt || ''} width={gift?.width ?? 594} height={gift?.height ?? 871} sizes="(min-width: 1024px) 480px, 100vw" style={{ objectPosition: focus(gift) }} />
                <div className="rope" aria-hidden="true" />
              </div>
            ) : null}
            <div>
              <span className="caps eyebrow">{t.giftEyebrow}</span>
              <h2 className="h2" id="gift-h">
                {t.giftH2}
              </h2>
              <p className="lead">{t.giftLead}</p>
              <ul className="gift-list">
                {(['gift', 'pen', 'sparkle'] as const).map((icon, i) => (
                  <li key={icon}>
                    <span className="ico">
                      <Icon name={icon} />
                    </span>
                    <span>{t.gifts[i]}</span>
                  </li>
                ))}
              </ul>
              <Link className="btn btn-primary" href={paths.shop(locale)}>
                {t.giftCta}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="custom" style={{ paddingTop: 0 }} aria-labelledby="custom-h">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="caps eyebrow">{t.customEyebrow}</span>
              <h2 className="h2" id="custom-h">
                {t.customH2}
              </h2>
            </div>
          </div>
          <ol className="steps">
            {t.steps.map(([title, body]) => (
              <li key={title} className="step">
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
          {customWa ? (
            <a className="btn btn-outline custom-cta" href={customWa} target="_blank" rel="noopener">
              <Icon name="whatsapp" />
              <span>{t.customCta}</span>
            </a>
          ) : null}
        </div>
      </section>

      <section className="trust" aria-label={t.whyLabel}>
        <div className="wrap">
          <ul>
            {(['sparkle', 'card', 'truck', 'clock'] as const).map((icon, i) => (
              <li key={icon}>
                <span className="ico">
                  <Icon name={icon} />
                </span>
                <span>{t.trust[i]}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {igUrl && instagram.length ? (
        <section className="section" aria-labelledby="ig-h">
          <div className="wrap">
            <div className="section-head">
              <div>
                <span className="caps eyebrow" dir="ltr">
                  {igHandle}
                </span>
                <h2 className="h2" id="ig-h">
                  {t.igH2(home?.followers || '')}
                </h2>
              </div>
              <a className="more" href={igUrl} target="_blank" rel="noopener">
                <span>{t.igCta}</span>
                <Icon name="arrow" className="flip" />
              </a>
            </div>
            <div className="ig">
              {instagram.map((m) => (
                <a key={m.id} href={igUrl} target="_blank" rel="noopener">
                  <Image src={imageUrl(m, 'large') ?? ''} alt={m.alt || ''} width={m.width ?? 768} height={m.height ?? 1024} sizes="(min-width: 768px) 25vw, 50vw" style={{ objectPosition: focus(m) }} />
                </a>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}

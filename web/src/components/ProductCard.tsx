import Image from 'next/image'
import Link from 'next/link'

import type { Product } from '@/payload-types'
import { CardAdd } from '@/components/store/Chrome'
import { imageUrl, mediaOf } from '@/lib/data'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/locales'
import { money, paths } from '@/lib/urls'

export function ProductCard({ product, locale, t, priority = false }: { product: Product; locale: Locale; t: Dictionary; priority?: boolean }) {
  const media = mediaOf(product.images?.[0])
  const src = imageUrl(media, 'card')
  const personal = Boolean(product.personalization?.type && product.personalization.type !== 'none')
  const soldOut = product.availability === 'sold_out'
  // Pieces without choices go straight into the bag; personalised ones need the product page.
  const quickAdd = !personal && !soldOut && !(product.personalization?.options?.length || product.personalization?.goldPlated)
  return (
    <article className="card">
      <div className="card-img">
        {src ? <Image src={src} alt={media?.alt || product.name} width={594} height={594} sizes="(min-width: 1024px) 280px, (min-width: 768px) 33vw, 50vw" priority={priority} /> : null}
        {soldOut ? <span className="card-tag">{t.soldOut}</span> : personal ? <span className="card-tag">{t.personalise}</span> : null}
      </div>
      <h3 className="card-name">
        <Link className="card-link" href={paths.product(locale, product.slug ?? '')}>
          <span className="sr-only">{product.name}</span>
        </Link>
        {product.name}
      </h3>
      <div className="card-row">
        <span className="price">{money(product.price, locale)}</span>
        {quickAdd ? <CardAdd id={product.id} label={t.addNamed(product.name)} /> : null}
      </div>
    </article>
  )
}

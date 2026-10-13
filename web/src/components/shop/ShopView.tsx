import Link from 'next/link'

import { ProductCard } from '@/components/ProductCard'
import { Price, PriceRange } from '@/components/store/Money'
import type { Category, Product } from '@/payload-types'
import type { PriceBand, SortOrder } from '@/lib/data'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/locales'
import { paths } from '@/lib/urls'

import { listingHref, type Filters } from './filters'
import { SortMenu } from './SortMenu'

type Props = {
  locale: Locale
  t: Dictionary
  title: string
  lead: string
  /** Top-level categories for the chip row. */
  categories: Category[]
  /** The category being shown (null for the whole shop). */
  current: Category | null
  /** Subcategories of the current category. */
  subcategories: Category[]
  filters: Filters
  list: { docs: Product[]; totalDocs: number; totalPages: number }
  base: string
}

/** The preview's shop: pink header, sticky filter bar, product grid. Every filter is a plain link. */
export function ShopView({ locale, t, title, lead, categories, current, subcategories, filters, list, base }: Props) {
  const keep = { price: filters.price, personal: filters.personal, sort: filters.sort }
  const currentTop = current ? (typeof current.parent === 'object' && current.parent ? current.parent.id : current.parent || current.id) : null
  const bands: PriceBand[] = ['lt40', '40to60', 'gt60']
  const sortHrefs = Object.fromEntries((['loved', 'low', 'high'] as SortOrder[]).map((s) => [s, listingHref(base, { ...keep, sort: s })])) as Record<SortOrder, string>

  return (
    <>
      <section className="shop-head">
        <div className="wrap">
          <h1 id="shop-title">{title}</h1>
          {lead ? <p className="lead">{lead}</p> : null}
          {subcategories.length ? (
            <div className="chips">
              {subcategories.map((c) => (
                <Link key={c.id} className="chip" href={paths.category(locale, c.slug ?? '')}>
                  {c.name}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className="filters">
        <div className="wrap">
          <nav className="scroller" aria-label={t.catLabel}>
            <Link className="chip" href={listingHref(paths.shop(locale), keep)} aria-current={current ? undefined : 'page'}>
              {t.all}
            </Link>
            {categories.map((c) => (
              <Link key={c.id} className="chip" href={listingHref(paths.category(locale, c.slug ?? ''), keep)} aria-current={c.id === currentTop ? 'page' : undefined}>
                {c.name}
              </Link>
            ))}
          </nav>
          <div className="row2">
            <div className="opts" role="group" aria-label={t.priceLabel}>
              {bands.map((b) => (
                <Link key={b} className="chip" rel="nofollow" href={listingHref(base, { ...keep, price: filters.price === b ? undefined : b })} aria-pressed={filters.price === b} role="button">
                  {/* One span each: the chip is a flex box, which would add its gap to the space. */}
                  {b === 'lt40' ? (
                    <span>
                      {t.priceUnder} <Price jod={40} />
                    </span>
                  ) : b === 'gt60' ? (
                    <span>
                      {t.priceOver} <Price jod={60} />
                    </span>
                  ) : (
                    <PriceRange from={40} to={60} />
                  )}
                </Link>
              ))}
              <Link className="chip" rel="nofollow" href={listingHref(base, { ...keep, personal: !filters.personal })} aria-pressed={filters.personal} role="button">
                {t.personalOnly}
              </Link>
            </div>
            <SortMenu label={t.sortLabel} labels={t.sorts} value={filters.sort} hrefs={sortHrefs} />
          </div>
        </div>
      </div>

      <section className="wrap results" aria-labelledby="shop-title">
        <p className="count-line" aria-live="polite">
          {t.results(list.totalDocs)}
        </p>
        {list.docs.length ? (
          <div className="grid four">
            {list.docs.map((p, i) => (
              <ProductCard key={p.id} product={p} locale={locale} t={t} priority={i < 4} />
            ))}
          </div>
        ) : (
          <div className="no-results">
            <p>{t.noResults}</p>
            <Link className="btn btn-outline" href={base}>
              {t.clear}
            </Link>
          </div>
        )}
        {list.totalPages > 1 ? (
          <nav className="pager" aria-label={t.page}>
            {filters.page > 1 ? (
              <Link className="btn btn-outline" href={listingHref(base, { ...keep, page: filters.page - 1 })} rel="prev">
                {t.previous}
              </Link>
            ) : null}
            <span className="pill">
              {t.page} {filters.page} / {list.totalPages}
            </span>
            {filters.page < list.totalPages ? (
              <Link className="btn btn-outline" href={listingHref(base, { ...keep, page: filters.page + 1 })} rel="next">
                {t.next}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </>
  )
}

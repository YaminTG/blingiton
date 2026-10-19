import type { ServerProps } from 'payload'

import { can, isAdmin } from '@/access'
import { serverUrl } from '@/lib/site'
import { scoreBand } from '@/seo/score'

import { Funnel } from './Funnel'
import { OrderPipeline } from './OrderPipeline'
import { SecuritySummary } from './Security'
import { ScoreBadge } from './SeoScoreCell'

const copy = {
  en: {
    hello: (name: string) => `Hi ${name}`,
    intro: 'Your orders first, then how the shop looks to Google today.',
    live: 'Live products',
    drafts: 'Drafts',
    average: 'Average SEO score',
    attention: 'Need a look',
    spread: 'SEO scores across live products',
    bands: { good: '90+ great', fair: '70–89 okay', poor: 'under 70' },
    lowest: 'Lowest scores: quickest wins',
    all: 'All products by score',
    add: 'Add a product',
    store: 'Open the shop',
    settings: 'Site settings',
  },
  ar: {
    hello: (name: string) => `أهلاً ${name}`,
    intro: 'طلباتك أولاً، ثم كيف يبدو المتجر لجوجل اليوم.',
    live: 'منتجات منشورة',
    drafts: 'مسودات',
    average: 'متوسط تقييم السيو',
    attention: 'تحتاج مراجعة',
    spread: 'توزيع تقييمات السيو للمنتجات المنشورة',
    bands: { good: '90+ ممتاز', fair: '70–89 مقبول', poor: 'أقل من 70' },
    lowest: 'الأقل تقييماً: أسرع تحسين',
    all: 'كل المنتجات حسب التقييم',
    add: 'أضف منتجاً',
    store: 'افتح المتجر',
    settings: 'إعدادات الموقع',
  },
}

/** Shown above the collection cards on the admin home: shop health at a glance. */
export async function Dashboard({ payload, i18n, user }: ServerProps) {
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const t = copy[lang]
  const admin = payload.config.routes.admin
  const products = `${admin}/collections/products`
  // Each part shows only to people allowed to work on that area (src/access).
  const orders = can(user, 'orders')
  const catalog = can(user, 'catalog')

  const [live, drafts] = await Promise.all([
    payload.find({
      collection: 'products',
      where: { _status: { equals: 'published' } },
      select: { name: true, seoScore: true, seoStatus: true },
      sort: 'seoScore',
      limit: 0,
      pagination: false,
      depth: 0,
      locale: lang,
    }),
    payload.count({ collection: 'products', where: { _status: { equals: 'draft' } } }),
  ])
  const scored = live.docs.filter((d) => typeof d.seoScore === 'number')
  const average = scored.length ? Math.round(scored.reduce((s, d) => s + (d.seoScore ?? 0), 0) / scored.length) : null
  const counts = { good: 0, fair: 0, poor: 0 }
  for (const d of scored) counts[scoreBand(d.seoScore) as keyof typeof counts]++
  const attention = live.docs.filter((d) => d.seoStatus === 'attention').length
  const lowest = scored.slice(0, 6)
  const firstName = (user as { name?: string } | undefined)?.name?.split(' ')[0] ?? ''

  return (
    <section className="bl-dash" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Styled like the gift bag: florals down both edges, the glitter logo in the middle. */}
      <header className="bl-dash__hello">
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative, served as-is */}
        <img className="bl-dash__badge" src="/logo.png" alt="" width={112} height={112} />
        <div className="bl-dash__greet">
          <h2>{t.hello(firstName)}</h2>
          <p>{t.intro}</p>
        </div>
        <nav className="bl-dash__actions">
          {catalog ? (
            <a className="bl-btn bl-btn--primary" href={`${products}/create`}>
              + {t.add}
            </a>
          ) : null}
          <a className="bl-btn" href={serverUrl} target="_blank" rel="noreferrer">
            {t.store} ↗
          </a>
          {can(user, 'settings') ? (
            <a className="bl-btn" href={`${admin}/globals/site-settings`}>
              {t.settings}
            </a>
          ) : null}
        </nav>
      </header>

      {isAdmin(user) ? <SecuritySummary payload={payload} lang={lang} admin={admin} /> : null}

      {orders ? <OrderPipeline payload={payload} lang={lang} admin={admin} /> : null}

      {catalog ? (
        <>
      <div className="bl-dash__stats">
        <a className="bl-stat" href={`${products}?where[_status][equals]=published`}>
          <span className="bl-stat__value">{live.docs.length}</span>
          <span className="bl-stat__label">{t.live}</span>
        </a>
        <a className="bl-stat" href={`${products}?where[_status][equals]=draft`}>
          <span className="bl-stat__value">{drafts.totalDocs}</span>
          <span className="bl-stat__label">{t.drafts}</span>
        </a>
        <a className={`bl-stat bl-stat--${scoreBand(average)}`} href={`${products}?sort=seoScore`}>
          <span className="bl-stat__value">{average ?? '–'}</span>
          <span className="bl-stat__label">{t.average}</span>
        </a>
        <a className="bl-stat" href={`${products}?where[seoStatus][equals]=attention`}>
          <span className="bl-stat__value">{attention}</span>
          <span className="bl-stat__label">{t.attention}</span>
        </a>
      </div>

      <div className="bl-dash__grid">
        <div className="bl-card">
          <h3>{t.spread}</h3>
          <div className="bl-spread" role="img" aria-label={`${counts.good} / ${counts.fair} / ${counts.poor}`}>
            {(['good', 'fair', 'poor'] as const).map((b) =>
              counts[b] ? <span key={b} className={`bl-spread--${b}`} style={{ flexGrow: counts[b] }} /> : null,
            )}
          </div>
          <ul className="bl-legend">
            {(['good', 'fair', 'poor'] as const).map((b) => (
              <li key={b} className={`bl-legend--${b}`}>
                <strong>{counts[b]}</strong> {t.bands[b]}
              </li>
            ))}
          </ul>
        </div>

        <div className="bl-card">
          <h3>{t.lowest}</h3>
          <ul className="bl-lowest">
            {lowest.map((d) => (
              <li key={d.id}>
                <a href={`${products}/${d.id}`}>{d.name}</a>
                <ScoreBadge score={d.seoScore ?? null} />
              </li>
            ))}
          </ul>
          <a className="bl-more" href={`${products}?sort=seoScore`}>
            {t.all} →
          </a>
        </div>
      </div>
        </>
      ) : null}

      {orders ? <Funnel payload={payload} lang={lang} admin={admin} /> : null}
    </section>
  )
}

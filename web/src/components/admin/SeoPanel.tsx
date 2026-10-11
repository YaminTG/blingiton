import type { NumberFieldServerComponent } from 'payload'

import { productScore } from '@/seo/productScore'
import { scoreBand } from '@/seo/score'

const copy = {
  en: {
    title: 'SEO score',
    newDoc: 'The score appears after the first save.',
    toFix: 'To improve',
    done: 'Done',
    perfect: 'Everything Google looks for is in place.',
    later: 'Updates a few seconds after saving. Reload to see the latest.',
    band: { good: 'Great', fair: 'Okay', poor: 'Needs work', none: '' },
  },
  ar: {
    title: 'تقييم السيو',
    newDoc: 'يظهر التقييم بعد الحفظ الأول.',
    toFix: 'للتحسين',
    done: 'مكتمل',
    perfect: 'كل ما يبحث عنه جوجل موجود.',
    later: 'يتحدّث بعد ثوانٍ من الحفظ. أعد تحميل الصفحة لرؤية آخر نتيجة.',
    band: { good: 'ممتاز', fair: 'مقبول', poor: 'يحتاج عمل', none: '' },
  },
}

/**
 * Sidebar panel on the product page: the score as a ring, then what to fix (biggest wins first)
 * and what is already done. Computed from the saved product in both languages.
 */
export const SeoPanel: NumberFieldServerComponent = async ({ id, payload, i18n, req }) => {
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const t = copy[lang]
  if (!id) {
    return (
      <div className="bl-seo">
        <div className="bl-seo__head">{t.title}</div>
        <p className="bl-seo__muted">{t.newDoc}</p>
      </div>
    )
  }

  const doc = await payload.findByID({ collection: 'products', id, locale: 'all', depth: 1, draft: true, req, overrideAccess: false })
  const { score, checks } = await productScore(payload, doc, req)
  const band = scoreBand(score)
  const open = checks.filter((c) => c.points < c.max).sort((a, b) => b.max - b.points - (a.max - a.points))
  const done = checks.filter((c) => c.points === c.max)
  const r = 34
  const circumference = 2 * Math.PI * r

  return (
    <div className={`bl-seo bl-seo--${band}`}>
      <div className="bl-seo__top">
        <svg className="bl-seo__ring" viewBox="0 0 80 80" aria-hidden>
          <circle cx="40" cy="40" r={r} className="bl-seo__track" />
          <circle
            cx="40"
            cy="40"
            r={r}
            className="bl-seo__value"
            strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
            transform="rotate(-90 40 40)"
          />
          <text x="40" y="46" textAnchor="middle">
            {score}
          </text>
        </svg>
        <div>
          <div className="bl-seo__head">{t.title}</div>
          <div className="bl-seo__band">{t.band[band]}</div>
        </div>
      </div>

      {open.length ? (
        <>
          <div className="bl-seo__group">{t.toFix}</div>
          <ul className="bl-seo__list">
            {open.map((c) => (
              <li key={c.id} className={c.points ? 'is-partial' : 'is-missing'}>
                <span className="bl-seo__label">{c.label[lang]}</span>
                <span className="bl-seo__pts">+{c.max - c.points}</span>
                {c.note && <span className="bl-seo__note">{c.note[lang]}</span>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="bl-seo__muted">{t.perfect}</p>
      )}

      {done.length > 0 && (
        <details className="bl-seo__done">
          <summary>
            {t.done} ({done.length})
          </summary>
          <ul className="bl-seo__list">
            {done.map((c) => (
              <li key={c.id} className="is-ok">
                <span className="bl-seo__label">{c.label[lang]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="bl-seo__muted bl-seo__foot">{t.later}</p>
    </div>
  )
}

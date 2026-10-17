import { Gutter } from '@payloadcms/ui'
import type { DocumentViewServerProps } from 'payload'

import { SEGMENT_LABELS } from '@/lib/customerStats'
import { trackingState } from '@/lib/customers'
import { loadCustomerInsight } from '@/lib/insights'
import { money } from '@/lib/urls'
import type { Customer, User } from '@/payload-types'

import { duration } from './CustomerInsights'
import { ForgetCustomerButton } from './CustomerTools'
import { StatusPill } from './OrderCells'

type Lang = 'en' | 'ar'

const copy = {
  en: {
    purchases: 'Purchases',
    completed: 'Completed',
    spent: 'Total spent',
    aov: 'Average order',
    first: 'First purchase',
    last: 'Last purchase',
    every: 'Days between orders',
    segment: 'Segment',
    history: 'Order history',
    order: 'Order',
    date: 'Date',
    status: 'Status',
    pieces: 'Pieces',
    total: 'Total',
    noOrders: 'No orders linked yet.',
    buys: 'What they buy',
    piece: 'Piece',
    qty: 'Pieces',
    times: 'Orders',
    categories: 'Categories',
    browsing: 'Browsing insights',
    off: (withdrawn: string | null) =>
      withdrawn ? `Not recorded: withdrawn on ${withdrawn}.` : 'Not recorded: they didn’t tick “Remember me on this device” at checkout.',
    waiting: (agreed: string) => `Agreed on ${agreed}. Recording starts after their first completed order.`,
    on: (agreed: string, since: string) => `Recorded since ${since} (agreed on ${agreed}).`,
    caveat: 'Views show interest, not a plan to buy.',
    viewed: 'Most viewed',
    views: 'Views',
    days: 'Days',
    time: 'Time',
    picks: 'Options tried',
    added: 'Added',
    bought: 'Bought',
    yes: 'Yes',
    after: 'After viewing',
    before: 'Looked at before ordering',
    beforeNote: 'Pieces viewed between one order and the next. ✓ = in that order.',
    nothing: 'Nothing recorded yet.',
  },
  ar: {
    purchases: 'الطلبات',
    completed: 'مكتملة',
    spent: 'إجمالي الإنفاق',
    aov: 'متوسط الطلب',
    first: 'أول طلب',
    last: 'آخر طلب',
    every: 'أيام بين الطلبات',
    segment: 'الفئة',
    history: 'سجل الطلبات',
    order: 'الطلب',
    date: 'التاريخ',
    status: 'الحالة',
    pieces: 'القطع',
    total: 'الإجمالي',
    noOrders: 'لا طلبات مرتبطة بعد.',
    buys: 'ماذا يشتري',
    piece: 'القطعة',
    qty: 'القطع',
    times: 'الطلبات',
    categories: 'الأقسام',
    browsing: 'تحليل التصفح',
    off: (withdrawn: string | null) => (withdrawn ? `لا يُسجَّل: سُحبت الموافقة في ${withdrawn}.` : 'لا يُسجَّل: لم يختر «تذكّرني على هذا الجهاز» عند الطلب.'),
    waiting: (agreed: string) => `وافق في ${agreed}. يبدأ التسجيل بعد أول طلب مكتمل.`,
    on: (agreed: string, since: string) => `يُسجَّل منذ ${since} (وافق في ${agreed}).`,
    caveat: 'المشاهدة تعني اهتماماً، لا نية شراء.',
    viewed: 'الأكثر مشاهدة',
    views: 'المشاهدات',
    days: 'الأيام',
    time: 'الوقت',
    picks: 'خيارات جرّبها',
    added: 'أضاف',
    bought: 'اشترى',
    yes: 'نعم',
    after: 'بعد المشاهدة',
    before: 'ما شاهده قبل الطلب',
    beforeNote: 'القطع التي شاهدها بين طلب والذي يليه. ✓ = ضمن ذلك الطلب.',
    nothing: 'لا شيء مسجّل بعد.',
  },
}

const date = (iso: string | null | undefined, lang: Lang) => (iso ? new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–')

/** The customer's Insights tab: totals, order history, what they buy and (with consent) what they look at. */
export async function CustomerView(props: DocumentViewServerProps) {
  const { payload, i18n } = props
  const doc = (props as unknown as { doc?: Customer }).doc
  const user = props.initPageResult?.req.user as User | null | undefined
  if (!doc?.id) return null
  const lang: Lang = i18n.language === 'ar' ? 'ar' : 'en'
  const t = copy[lang]
  const admin = payload.config.routes.admin
  const d = await loadCustomerInsight(payload, doc.id, lang)
  const state = trackingState(doc)
  const agreed = date(doc.tracking?.consentAt, lang)
  const since = date([doc.tracking?.consentAt, doc.firstVerifiedAt].filter(Boolean).sort().at(-1), lang)

  return (
    <Gutter>
      <section className="bl-dash bl-insights" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="bl-dash__stats">
          {[
            [t.purchases, (doc.orderCount ?? 0).toLocaleString('en')],
            [t.completed, (doc.verifiedOrders ?? 0).toLocaleString('en')],
            [t.spent, money(doc.totalSpent ?? 0, lang)],
            [t.aov, money(doc.averageOrder ?? 0, lang)],
            [t.first, date(doc.firstOrderAt, lang)],
            [t.last, date(doc.lastOrderAt, lang)],
            [t.every, doc.daysBetween ?? '–'],
            [t.segment, SEGMENT_LABELS[doc.segment ?? 'none'][lang]],
          ].map(([label, value]) => (
            <div className="bl-stat bl-stat--small" key={String(label)}>
              <span className="bl-stat__value">{value}</span>
              <span className="bl-stat__label">{label}</span>
            </div>
          ))}
        </div>

        <div className="bl-dash__grid">
          <div className="bl-card">
            <h3>{t.history}</h3>
            {d.orders.length ? (
              <table className="bl-table">
                <thead>
                  <tr>
                    <th scope="col">{t.order}</th>
                    <th scope="col">{t.date}</th>
                    <th scope="col">{t.status}</th>
                    <th scope="col">{t.pieces}</th>
                    <th scope="col">{t.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.orders.map((o) => (
                    <tr key={o.id}>
                      <th scope="row">
                        <a href={`${admin}/collections/orders/${o.id}`}>#{o.number}</a>
                      </th>
                      <td>{date(o.createdAt, lang)}</td>
                      <td>
                        <StatusPill status={o.status} lang={lang} />
                      </td>
                      <td className="bl-wrap">{(o.items ?? []).map((it) => `${it.name}${(it.quantity ?? 1) > 1 ? ` ×${it.quantity}` : ''}`).join(', ')}</td>
                      <td>{money(o.total ?? 0, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>{t.noOrders}</p>
            )}
          </div>

          {d.bought.length ? (
            <div className="bl-card">
              <h3>{t.buys}</h3>
              <table className="bl-table">
                <thead>
                  <tr>
                    <th scope="col">{t.piece}</th>
                    <th scope="col">{t.qty}</th>
                    <th scope="col">{t.times}</th>
                    <th scope="col">{t.spent}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.bought.map((b) => (
                    <tr key={`${b.product}-${b.name}`}>
                      <th scope="row">{b.product ? <a href={`${admin}/collections/products/${b.product}`}>{b.name}</a> : b.name}</th>
                      <td>{b.qty}</td>
                      <td>{b.times}</td>
                      <td>{money(b.spent, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.categories.length ? (
                <p className="bl-persona__line">
                  <b>{t.categories}:</b> {d.categories.map(([name, n]) => `${name} (${n})`).join(' · ')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="bl-card">
          <h3>{t.browsing}</h3>
          <p className="bl-note">
            {state === 'on' ? t.on(agreed, since) : state === 'waiting' ? t.waiting(agreed) : t.off(doc.tracking?.withdrawnAt ? date(doc.tracking.withdrawnAt, lang) : null)} {d.rows ? t.caveat : ''}
          </p>
          {user?.role === 'admin' && (state !== 'off' || d.rows > 0) ? <ForgetCustomerButton id={doc.id} lang={lang} /> : null}

          {d.interest.length ? (
            <>
              <h4 className="bl-subhead">{t.viewed}</h4>
              <table className="bl-table">
                <thead>
                  <tr>
                    <th scope="col">{t.piece}</th>
                    <th scope="col">{t.views}</th>
                    <th scope="col">{t.days}</th>
                    <th scope="col">{t.time}</th>
                    <th scope="col">{t.picks}</th>
                    <th scope="col">{t.added}</th>
                    <th scope="col">{t.bought}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.interest.slice(0, 15).map((r) => (
                    <tr key={r.product}>
                      <th scope="row">
                        <a href={`${admin}/collections/products/${r.product}`}>{r.name}</a>
                      </th>
                      <td>{r.views}</td>
                      <td>{r.days}</td>
                      <td>{duration(r.seconds, lang)}</td>
                      <td className="bl-wrap">{r.picks.map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)).join(' · ') || '–'}</td>
                      <td>{r.adds || '–'}</td>
                      <td>{r.boughtAfterViewing ? t.after : r.bought ? t.yes : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : state === 'on' ? (
            <p>{t.nothing}</p>
          ) : null}

          {d.beforeOrders.length ? (
            <>
              <h4 className="bl-subhead">{t.before}</h4>
              <p className="bl-note">{t.beforeNote}</p>
              <ul className="bl-before">
                {d.beforeOrders.map((o) => (
                  <li key={o.id}>
                    <a href={`${admin}/collections/orders/${o.id}`}>
                      #{o.number} · {date(o.createdAt, lang)}
                    </a>
                    <span>
                      {o.viewed.map((v) => (
                        <span key={v.product} className={`bl-chip${v.bought ? ' bl-chip--yes' : ''}`}>
                          {v.bought ? '✓ ' : ''}
                          {v.name} ×{v.views}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </section>
    </Gutter>
  )
}

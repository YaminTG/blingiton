import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps, ServerProps } from 'payload'

import { SEGMENT_LABELS } from '@/lib/customerStats'
import { loadInsights, PERIODS, type Period } from '@/lib/insights'
import { ACTIVE_DAYS, type Persona } from '@/lib/personas'
import { money } from '@/lib/urls'

type Lang = 'en' | 'ar'

const copy = {
  en: {
    nav: 'Customer insights',
    title: 'Customer insights',
    intro: 'Who buys from Blingiton, where they live, what they love and how often they come back. Counted from real orders; cancelled, refunded, failed and unpaid ones are left out.',
    periods: { '30': 'Last 30 days', '90': '90 days', '365': '12 months', all: 'All time' } as Record<Period, string>,
    allCustomers: 'All customers',
    kpi: {
      buyers: 'Customers',
      newBuyers: 'New customers in this period',
      returning: (p: string) => `Returning customers (${p})`,
      orders: 'Orders',
      revenue: 'Sales',
      aov: 'Average order',
      repeatShare: 'Orders from returning customers',
      perBuyer: 'Orders per customer',
    },
    countries: 'Sales by country',
    countriesNote: 'By delivery country, for orders in this period.',
    country: 'Country',
    customers: 'Customers',
    orders: 'Orders',
    sales: 'Sales',
    aov: 'Avg order',
    share: 'Share',
    groups: 'Customer groups',
    groupsNote: 'All time. Which groups buy most often and bring in the most.',
    group: 'Group',
    ordersEach: 'Orders each',
    every: 'Days between orders',
    active: `Bought in last ${ACTIVE_DAYS} days`,
    personas: 'Customer personas',
    personasNote: 'Buyers grouped by how often they buy and where they live. Each line is counted from their orders; nothing about who they are is assumed.',
    markets: { jordan: 'Jordan', abroad: 'Abroad' },
    pShare: (n: number, p: string) => `${n.toLocaleString('en')} ${n === 1 ? 'customer' : 'customers'} · ${p} of buyers`,
    pRevenue: (p: string) => `${p} of sales`,
    pSpend: 'Spends per customer',
    pAov: 'Average order',
    pOrders: 'Orders each',
    pEvery: 'Orders every',
    days: (n: number) => `${n} days`,
    pActive: `Bought in last ${ACTIVE_DAYS} days`,
    pCats: 'Buy most from',
    pPieces: 'Favourite pieces',
    pCountries: 'Countries',
    small: 'Small group: read with care',
    interest: 'What returning customers look at',
    interestNote:
      'Only customers who agreed at checkout and have a completed order. A view shows interest, not a plan to buy: “bought after” counts viewers who later ordered that piece.',
    piece: 'Piece',
    viewers: 'Viewers',
    views: 'Views',
    time: 'Time',
    added: 'Added to bag',
    repeat: 'Came back to it',
    boughtAfter: 'Bought after',
    noInterest: 'Nothing recorded yet. This fills in as customers who opted in come back after a delivered order.',
    top: 'Top customers',
    spent: 'Spent',
    last: 'Last order',
    tracking: 'Browsing insights',
    trackingAgreed: 'Customers who agreed at checkout',
    trackingOn: 'Recorded (agreed and have a completed order)',
    trackingActive: 'Seen browsing in this period',
    privacy:
      'Customer details are visible to the team only. Exports are for admins and are written to the audit log. Browsing is recorded only with consent, after a completed order, and deleted after a year or when the customer withdraws.',
    empty: 'No orders yet. Numbers appear here as customers order.',
  },
  ar: {
    nav: 'تحليلات العملاء',
    title: 'تحليلات العملاء',
    intro: 'من يشتري من Blingiton، وأين يعيش، وماذا يحب، وكم مرة يعود. محسوبة من الطلبات الفعلية؛ لا تُحسب الطلبات الملغاة أو المستردة أو الفاشلة أو غير المدفوعة.',
    periods: { '30': 'آخر 30 يوماً', '90': '90 يوماً', '365': '12 شهراً', all: 'كل الوقت' } as Record<Period, string>,
    allCustomers: 'كل العملاء',
    kpi: {
      buyers: 'العملاء',
      newBuyers: 'عملاء جدد في هذه الفترة',
      returning: (p: string) => `عملاء عائدون (${p})`,
      orders: 'الطلبات',
      revenue: 'المبيعات',
      aov: 'متوسط الطلب',
      repeatShare: 'طلبات من عملاء عائدين',
      perBuyer: 'طلبات لكل عميل',
    },
    countries: 'المبيعات حسب الدولة',
    countriesNote: 'حسب دولة التوصيل، لطلبات هذه الفترة.',
    country: 'الدولة',
    customers: 'العملاء',
    orders: 'الطلبات',
    sales: 'المبيعات',
    aov: 'متوسط الطلب',
    share: 'الحصة',
    groups: 'فئات العملاء',
    groupsNote: 'كل الوقت. أي الفئات تشتري أكثر وتجلب أكثر.',
    group: 'الفئة',
    ordersEach: 'طلبات لكل عميل',
    every: 'أيام بين الطلبات',
    active: `اشتروا آخر ${ACTIVE_DAYS} يوماً`,
    personas: 'شخصيات العملاء',
    personasNote: 'المشترون مجمّعون حسب عدد مرات الشراء ومكان السكن. كل سطر محسوب من طلباتهم، ولا نفترض شيئاً عن هويتهم.',
    markets: { jordan: 'الأردن', abroad: 'خارج الأردن' },
    pShare: (n: number, p: string) => `${n.toLocaleString('en')} عميل · ${p} من المشترين`,
    pRevenue: (p: string) => `${p} من المبيعات`,
    pSpend: 'إنفاق العميل',
    pAov: 'متوسط الطلب',
    pOrders: 'طلبات لكل عميل',
    pEvery: 'يطلب كل',
    days: (n: number) => `${n} يوماً`,
    pActive: `اشتروا آخر ${ACTIVE_DAYS} يوماً`,
    pCats: 'يشترون غالباً من',
    pPieces: 'القطع المفضلة',
    pCountries: 'الدول',
    small: 'فئة صغيرة: اقرأها بحذر',
    interest: 'ما يشاهده العملاء العائدون',
    interestNote: 'فقط العملاء الذين وافقوا عند الطلب ولديهم طلب مكتمل. المشاهدة تعني اهتماماً لا نية شراء: «اشتروا بعدها» يعدّ من شاهدوا القطعة ثم طلبوها.',
    piece: 'القطعة',
    viewers: 'المشاهدون',
    views: 'المشاهدات',
    time: 'الوقت',
    added: 'أضافوا للحقيبة',
    repeat: 'عادوا إليها',
    boughtAfter: 'اشتروا بعدها',
    noInterest: 'لا شيء مسجّل بعد. يمتلئ هذا عندما يعود العملاء الموافقون بعد تسليم طلبهم.',
    top: 'أكثر العملاء إنفاقاً',
    spent: 'الإنفاق',
    last: 'آخر طلب',
    tracking: 'تحليل التصفح',
    trackingAgreed: 'عملاء وافقوا عند الطلب',
    trackingOn: 'يُسجَّل لهم (وافقوا ولديهم طلب مكتمل)',
    trackingActive: 'تصفّحوا في هذه الفترة',
    privacy: 'بيانات العملاء يراها الفريق فقط. التصدير للمدراء فقط ويُسجَّل في سجل التدقيق. يُسجَّل التصفح بموافقة العميل فقط، بعد طلب مكتمل، ويُحذف بعد سنة أو عند سحب الموافقة.',
    empty: 'لا طلبات بعد. ستظهر الأرقام هنا عندما يطلب العملاء.',
  },
}

const langOf = (i18n: ServerProps['i18n']): Lang => (i18n.language === 'ar' ? 'ar' : 'en')
const pct = (n: number) => `${Math.round(n * 100)}%`
const num = (n: number, digits = 0) => n.toLocaleString('en', { maximumFractionDigits: digits })
const date = (iso: string | null | undefined, lang: Lang) => (iso ? new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–')
export const duration = (s: number, lang: Lang) => {
  if (s < 60) return lang === 'ar' ? `${s} ث` : `${s}s`
  const m = Math.round(s / 60)
  return lang === 'ar' ? `${m} د` : `${m} min`
}

/** A share as a thin bar behind the number, for table cells. */
const Bar = ({ value, label }: { value: number; label: string }) => (
  <span className="bl-bar">
    <span className="bl-bar__fill" style={{ width: `${Math.max(1, value * 100)}%` }} />
    <span className="bl-bar__label">{label}</span>
  </span>
)

/** In the side menu, after the collections. */
export function InsightsNavLink({ i18n, payload }: ServerProps) {
  return (
    <a className="nav__link bl-navlink" href={`${payload.config.routes.admin}/customer-insights`}>
      <span className="nav__link-label">{copy[langOf(i18n)].nav}</span>
    </a>
  )
}

function PersonaCard({ p, t, lang, names, cats }: { p: Persona; t: (typeof copy)['en']; lang: Lang; names: Map<number, string>; cats: Map<number, string> }) {
  return (
    <article className="bl-persona">
      <header>
        <h4>
          {SEGMENT_LABELS[p.segment][lang]} · {t.markets[p.market]}
        </h4>
        <p>
          {t.pShare(p.customers, pct(p.share))} · <strong>{t.pRevenue(pct(p.revenueShare))}</strong>
        </p>
        {p.customers < 5 ? <span className="bl-chip">{t.small}</span> : null}
      </header>
      <dl>
        <div>
          <dt>{t.pSpend}</dt>
          <dd>{money(p.avgSpend, lang)}</dd>
        </div>
        <div>
          <dt>{t.pAov}</dt>
          <dd>{money(p.averageOrder, lang)}</dd>
        </div>
        <div>
          <dt>{t.pOrders}</dt>
          <dd>{num(p.avgOrders, 1)}</dd>
        </div>
        {p.avgDaysBetween !== null ? (
          <div>
            <dt>{t.pEvery}</dt>
            <dd>{t.days(p.avgDaysBetween)}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t.pActive}</dt>
          <dd>{pct(p.activeShare)}</dd>
        </div>
      </dl>
      {p.topCategories.length ? (
        <p className="bl-persona__line">
          <b>{t.pCats}:</b> {p.topCategories.map(([id, n]) => `${cats.get(id) ?? `#${id}`} (${n})`).join(' · ')}
        </p>
      ) : null}
      {p.topProducts.length ? (
        <p className="bl-persona__line">
          <b>{t.pPieces}:</b> {p.topProducts.map(([id, n]) => `${names.get(id) ?? `#${id}`} ×${n}`).join(' · ')}
        </p>
      ) : null}
      {p.market === 'abroad' ? (
        <p className="bl-persona__line">
          <b>{t.pCountries}:</b> {p.topCountries.map(([c, n]) => `${c} (${n})`).join(' · ')}
        </p>
      ) : null}
    </article>
  )
}

/** /admin/customer-insights: customers, countries, groups, personas and what returning customers look at. */
export async function CustomerInsights({ initPageResult, i18n, locale, params, payload, permissions, searchParams, user }: AdminViewServerProps) {
  const admin = payload.config.routes.admin
  if (!initPageResult.req.user) redirect(`${admin}/login?redirect=${encodeURIComponent(`${admin}/customer-insights`)}`)
  const lang = langOf(i18n)
  const t = copy[lang]
  const asked = searchParams?.period
  const period: Period = PERIODS.includes(asked as Period) ? (asked as Period) : '90'
  const d = await loadInsights(payload, period, lang)
  const customers = `${admin}/collections/customers`
  const k = d.kpis

  return (
    <DefaultTemplate
      i18n={i18n}
      locale={locale}
      params={params}
      payload={payload}
      permissions={permissions}
      req={initPageResult.req}
      searchParams={searchParams}
      user={user}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <section className="bl-dash bl-insights" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <header className="bl-insights__head">
            <div>
              <h2>{t.title}</h2>
              <p>{t.intro}</p>
            </div>
            <a className="bl-btn" href={customers}>
              {t.allCustomers} →
            </a>
          </header>
          <nav className="bl-tabs" aria-label={t.title}>
            {PERIODS.map((p) => (
              <a key={p} className={`bl-tabs__tab${p === period ? ' is-active' : ''}`} href={`?period=${p}`} aria-current={p === period ? 'page' : undefined}>
                {t.periods[p]}
              </a>
            ))}
          </nav>

          {!k.buyers ? (
            <div className="bl-card">
              <p>{t.empty}</p>
            </div>
          ) : (
            <>
              <div className="bl-dash__stats">
                <a className="bl-stat" href={`${customers}?where[orderCount][greater_than]=0`}>
                  <span className="bl-stat__value">{num(k.buyers)}</span>
                  <span className="bl-stat__label">{t.kpi.buyers}</span>
                </a>
                <div className="bl-stat">
                  <span className="bl-stat__value">{num(k.newBuyers)}</span>
                  <span className="bl-stat__label">{t.kpi.newBuyers}</span>
                </div>
                <a className="bl-stat" href={`${customers}?where[orderCount][greater_than_equal]=2`}>
                  <span className="bl-stat__value">{num(k.returning)}</span>
                  <span className="bl-stat__label">{t.kpi.returning(pct(k.returningShare))}</span>
                </a>
                <div className="bl-stat">
                  <span className="bl-stat__value">{num(k.orders)}</span>
                  <span className="bl-stat__label">{t.kpi.orders}</span>
                </div>
                <div className="bl-stat">
                  <span className="bl-stat__value">{money(k.revenue, lang)}</span>
                  <span className="bl-stat__label">{t.kpi.revenue}</span>
                </div>
                <div className="bl-stat">
                  <span className="bl-stat__value">{money(k.averageOrder, lang)}</span>
                  <span className="bl-stat__label">{t.kpi.aov}</span>
                </div>
                <div className="bl-stat">
                  <span className="bl-stat__value">{pct(k.repeatOrderShare)}</span>
                  <span className="bl-stat__label">{t.kpi.repeatShare}</span>
                </div>
                <div className="bl-stat">
                  <span className="bl-stat__value">{num(k.avgOrdersPerBuyer, 1)}</span>
                  <span className="bl-stat__label">{t.kpi.perBuyer}</span>
                </div>
              </div>

              <div className="bl-dash__grid">
                <div className="bl-card">
                  <h3>{t.countries}</h3>
                  <p className="bl-note">{t.countriesNote}</p>
                  <table className="bl-table">
                    <thead>
                      <tr>
                        <th scope="col">{t.country}</th>
                        <th scope="col">{t.customers}</th>
                        <th scope="col">{t.orders}</th>
                        <th scope="col">{t.aov}</th>
                        <th scope="col">{t.sales}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.countries.map((c) => (
                        <tr key={c.country}>
                          <th scope="row">
                            <a href={`${customers}?where[country][equals]=${encodeURIComponent(c.country)}`}>{c.country}</a>
                          </th>
                          <td>{c.customers}</td>
                          <td>{c.orders}</td>
                          <td>{money(c.averageOrder, lang)}</td>
                          <td>
                            <Bar value={c.share} label={`${money(c.revenue, lang)} · ${pct(c.share)}`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bl-card">
                  <h3>{t.groups}</h3>
                  <p className="bl-note">{t.groupsNote}</p>
                  <table className="bl-table">
                    <thead>
                      <tr>
                        <th scope="col">{t.group}</th>
                        <th scope="col">{t.customers}</th>
                        <th scope="col">{t.ordersEach}</th>
                        <th scope="col">{t.every}</th>
                        <th scope="col">{t.active}</th>
                        <th scope="col">{t.sales}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.segments.map((s) => (
                        <tr key={s.segment}>
                          <th scope="row">
                            <a href={`${customers}?where[segment][equals]=${s.segment}`}>{SEGMENT_LABELS[s.segment][lang]}</a>
                          </th>
                          <td>
                            {s.customers} <small>({pct(s.share)})</small>
                          </td>
                          <td>{num(s.avgOrders, 1)}</td>
                          <td>{s.avgDaysBetween ?? '–'}</td>
                          <td>{pct(s.activeShare)}</td>
                          <td>
                            <Bar value={s.revenueShare} label={`${money(s.revenue, lang)} · ${pct(s.revenueShare)}`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bl-card">
                <h3>{t.personas}</h3>
                <p className="bl-note">{t.personasNote}</p>
                <div className="bl-personas">
                  {d.personas.map((p) => (
                    <PersonaCard key={p.key} p={p} t={t} lang={lang} names={d.productNames} cats={d.categoryNames} />
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="bl-dash__grid">
            <div className="bl-card">
              <h3>{t.interest}</h3>
              <p className="bl-note">{t.interestNote}</p>
              {d.interest.length ? (
                <table className="bl-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.piece}</th>
                      <th scope="col">{t.viewers}</th>
                      <th scope="col">{t.views}</th>
                      <th scope="col">{t.time}</th>
                      <th scope="col">{t.repeat}</th>
                      <th scope="col">{t.added}</th>
                      <th scope="col">{t.boughtAfter}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.interest.map((r) => (
                      <tr key={r.product}>
                        <th scope="row">
                          <a href={`${admin}/collections/products/${r.product}`}>{r.name}</a>
                        </th>
                        <td>{r.customers}</td>
                        <td>{r.views}</td>
                        <td>{duration(r.seconds, lang)}</td>
                        <td>{r.repeatCustomers || '–'}</td>
                        <td>{r.adds || '–'}</td>
                        <td>{r.boughtAfter ? `${r.boughtAfter} / ${r.customers}` : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>{t.noInterest}</p>
              )}
            </div>

            {d.topCustomers.length ? (
              <div className="bl-card">
                <h3>{t.top}</h3>
                <table className="bl-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.customers}</th>
                      <th scope="col">{t.country}</th>
                      <th scope="col">{t.orders}</th>
                      <th scope="col">{t.spent}</th>
                      <th scope="col">{t.last}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.topCustomers.map((c) => (
                      <tr key={c.id}>
                        <th scope="row">
                          <a href={`${customers}/${c.id}/insights`}>{c.name}</a>
                        </th>
                        <td>{c.country ?? '–'}</td>
                        <td>{c.orderCount ?? 0}</td>
                        <td>{money(c.totalSpent ?? 0, lang)}</td>
                        <td>{date(c.lastOrderAt, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="bl-card">
            <h3>{t.tracking}</h3>
            <ul className="bl-legend bl-legend--plain">
              <li>
                <strong>{num(d.tracking.agreed)}</strong> {t.trackingAgreed}
              </li>
              <li>
                <strong>{num(d.tracking.on)}</strong> {t.trackingOn}
              </li>
              <li>
                <strong>{num(d.tracking.activeInPeriod)}</strong> {t.trackingActive}
              </li>
            </ul>
            <p className="bl-note bl-privacy">{t.privacy}</p>
          </div>
        </section>
      </Gutter>
    </DefaultTemplate>
  )
}

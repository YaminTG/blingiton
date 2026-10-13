import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { AI_SOURCES } from '@/lib/events'
import { money } from '@/lib/urls'

const DAYS = 30

const copy = {
  en: {
    title: `Shop funnel · last ${DAYS} days`,
    intro: 'Each visit counts once per step. Staff signed in to the admin and bots are left out.',
    empty: 'No visits recorded yet. Numbers appear here as people use the shop.',
    steps: { visit: 'Visits', view: 'Viewed a piece', add: 'Added to bag', checkout: 'Started checkout', order: 'Placed an order' },
    ofVisits: (p: string) => `${p} of visits`,
    drop: (p: string) => `${p} dropped off`,
    stats: { conversion: 'Visits that ordered', revenue: 'Revenue', typed: 'Typed a name in a preview', whatsapp: 'Tapped WhatsApp', ai: 'Visits from AI assistants' },
    sources: 'Where visits and orders come from',
    source: 'Source',
    visits: 'Visits',
    added: 'Added',
    orders: 'Orders',
    revenue: 'Revenue',
    rate: 'Ordered',
    pieces: 'Most viewed pieces',
    piece: 'Piece',
    views: 'Views',
    typed: 'Typed a name',
    checkout: 'Checkout',
    landing: 'First page of visits that ordered',
    page: 'Page',
    direct: 'Direct',
    unknown: 'Unknown',
    search: 'search',
    campaign: 'campaign',
    aiTag: 'AI',
  },
  ar: {
    title: `مسار الشراء · آخر ${DAYS} يوماً`,
    intro: 'تُحسب كل زيارة مرة واحدة في كل خطوة. لا تُحسب زيارات الفريق المسجّل في لوحة التحكم ولا الروبوتات.',
    empty: 'لا توجد زيارات مسجّلة بعد. ستظهر الأرقام هنا عندما يستخدم الناس المتجر.',
    steps: { visit: 'الزيارات', view: 'شاهدوا قطعة', add: 'أضافوا إلى الحقيبة', checkout: 'بدؤوا الدفع', order: 'أتمّوا الطلب' },
    ofVisits: (p: string) => `${p} من الزيارات`,
    drop: (p: string) => `توقّف ${p}`,
    stats: { conversion: 'زيارات انتهت بطلب', revenue: 'الإيرادات', typed: 'كتبوا اسماً في المعاينة', whatsapp: 'ضغطوا على واتساب', ai: 'زيارات من مساعدات الذكاء الاصطناعي' },
    sources: 'من أين تأتي الزيارات والطلبات',
    source: 'المصدر',
    visits: 'الزيارات',
    added: 'أضافوا',
    orders: 'الطلبات',
    revenue: 'الإيرادات',
    rate: 'نسبة الطلب',
    pieces: 'القطع الأكثر مشاهدة',
    piece: 'القطعة',
    views: 'المشاهدات',
    typed: 'كتبوا اسماً',
    checkout: 'الدفع',
    landing: 'أول صفحة في الزيارات التي انتهت بطلب',
    page: 'الصفحة',
    direct: 'مباشر',
    unknown: 'غير معروف',
    search: 'بحث',
    campaign: 'حملة',
    aiTag: 'ذكاء اصطناعي',
  },
}

type Copy = (typeof copy)['en']
type Row = Record<string, string | number | null>

/** Start of the report window. (A server component renders once per request, so "now" is fine.) */
const windowStart = () => new Date(Date.now() - DAYS * 86400_000)

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '–')

/** One name per source, the same for visits (events) and orders (attribution). */
function sourceLabel(type: string | null | undefined, source: string | null | undefined, t: Copy) {
  if (type === 'direct') return t.direct
  if (type === 'organic') return `${source || 'Google'} (${t.search})`
  if (type === 'utm') return `${source} (${t.campaign})`
  if (type === 'referral' && source) return source
  return t.unknown
}

/** Below the SEO cards on the admin home: visits → orders, by step, source and piece. */
export async function Funnel({ payload, lang, admin }: { payload: Payload; lang: 'en' | 'ar'; admin: string }) {
  const t = copy[lang]
  const since = windowStart()
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const rows = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: Row[] }).rows

  const [steps, sources, pieces, ordersFound] = await Promise.all([
    rows(sql`select type, count(distinct session)::int as n from events where created_at >= ${since} group by type`),
    rows(sql`select source_type as type, source,
      count(distinct session) filter (where type = 'visit')::int as visits,
      count(distinct session) filter (where type = 'add')::int as adds
      from events where created_at >= ${since} group by source_type, source`),
    rows(sql`select product,
      count(*) filter (where type = 'view')::int as views,
      count(*) filter (where type = 'personalize')::int as typed,
      count(*) filter (where type = 'add')::int as adds,
      count(*) filter (where type = 'checkout')::int as checkout
      from events where created_at >= ${since} and product is not null
      group by product order by views desc, adds desc limit 10`),
    payload.find({
      collection: 'orders',
      where: { and: [{ createdAt: { greater_than_equal: since.toISOString() } }, { status: { not_equals: 'failed' } }] },
      select: { total: true, status: true, attribution: true, items: true },
      depth: 0,
      limit: 0,
      pagination: false,
    }),
  ])

  // Orders typed in by staff aren't web visits.
  const orders = ordersFound.docs.filter((o) => o.attribution?.type !== 'admin')
  const counts = Object.fromEntries(steps.map((r) => [r.type, Number(r.n)])) as Record<string, number>
  const visits = counts.visit ?? 0
  const kept = (o: (typeof orders)[number]) => !['cancelled', 'refunded'].includes(o.status)
  const revenue = orders.filter(kept).reduce((s, o) => s + (o.total ?? 0), 0)

  if (!visits && !orders.length) {
    return (
      <div className="bl-card">
        <h3>{t.title}</h3>
        <p>{t.empty}</p>
      </div>
    )
  }

  const funnel = [
    { key: 'visit', n: visits },
    { key: 'view', n: counts.view ?? 0 },
    { key: 'add', n: counts.add ?? 0 },
    { key: 'checkout', n: counts.checkout ?? 0 },
    { key: 'order', n: orders.length },
  ] as const

  // Sources: visits and adds from events, orders and revenue from the orders' own attribution.
  const bySource = new Map<string, { label: string; ai: boolean; visits: number; adds: number; orders: number; revenue: number }>()
  const entry = (type: string | null | undefined, source: string | null | undefined) => {
    const label = sourceLabel(type, source, t)
    const found = bySource.get(label) ?? { label, ai: AI_SOURCES.includes(source ?? ''), visits: 0, adds: 0, orders: 0, revenue: 0 }
    bySource.set(label, found)
    return found
  }
  for (const r of sources) {
    const e = entry(r.type as string, r.source as string)
    e.visits += Number(r.visits)
    e.adds += Number(r.adds)
  }
  for (const o of orders) {
    const e = entry(o.attribution?.type, o.attribution?.source)
    e.orders++
    if (kept(o)) e.revenue += o.total ?? 0
  }
  const sourceRows = [...bySource.values()]
    .filter((s) => s.visits || s.adds || s.orders)
    .sort((a, b) => b.orders - a.orders || b.visits - a.visits).slice(0, 12)
  const aiVisits = sourceRows.filter((s) => s.ai).reduce((s, r) => s + r.visits, 0)

  // Pieces: names in the admin's language, plus how many orders included each.
  const ids = pieces.map((p) => Number(p.product))
  const names = new Map(
    ids.length
      ? (await payload.find({ collection: 'products', where: { id: { in: ids } }, select: { name: true }, depth: 0, limit: ids.length, locale: lang, draft: true })).docs.map((d) => [d.id, d.name])
      : [],
  )
  const ordered = new Map<number, number>()
  for (const o of orders)
    for (const id of new Set((o.items ?? []).map((it) => (typeof it.product === 'object' ? it.product?.id : it.product)))) if (id) ordered.set(id, (ordered.get(id) ?? 0) + 1)

  const landing = new Map<string, { orders: number; revenue: number }>()
  for (const o of orders) {
    const page = (o.attribution?.landingPage ?? '').split('?')[0] || '–'
    const e = landing.get(page) ?? { orders: 0, revenue: 0 }
    e.orders++
    if (kept(o)) e.revenue += o.total ?? 0
    landing.set(page, e)
  }
  const landingRows = [...landing.entries()].sort((a, b) => b[1].orders - a[1].orders).slice(0, 6)

  return (
    <>
      <div className="bl-card">
        <h3>{t.title}</h3>
        <p className="bl-note">{t.intro}</p>
        <ol className="bl-funnel">
          {funnel.map((s, i) => {
            const prev = i ? funnel[i - 1].n : 0
            const width = visits ? Math.max(0.5, (s.n / visits) * 100) : 0
            return (
              <li key={s.key} title={`${t.steps[s.key]}: ${s.n.toLocaleString('en')} (${t.ofVisits(pct(s.n, visits))})`}>
                <span className="bl-funnel__label">{t.steps[s.key]}</span>
                <span className="bl-funnel__track">
                  <span className="bl-funnel__bar" style={{ width: `${width}%` }} />
                </span>
                <span className="bl-funnel__value">
                  <strong>{s.n.toLocaleString('en')}</strong> {i ? <small>{t.ofVisits(pct(s.n, visits))}</small> : null}
                </span>
                {i && prev > s.n ? <span className="bl-funnel__drop">{t.drop(pct(prev - s.n, prev))}</span> : null}
              </li>
            )
          })}
        </ol>
      </div>

      <div className="bl-dash__stats">
        <div className="bl-stat">
          <span className="bl-stat__value">{pct(orders.length, visits)}</span>
          <span className="bl-stat__label">{t.stats.conversion}</span>
        </div>
        <div className="bl-stat">
          <span className="bl-stat__value">{money(revenue, lang)}</span>
          <span className="bl-stat__label">{t.stats.revenue}</span>
        </div>
        <div className="bl-stat">
          <span className="bl-stat__value">{(counts.personalize ?? 0).toLocaleString('en')}</span>
          <span className="bl-stat__label">{t.stats.typed}</span>
        </div>
        <div className="bl-stat">
          <span className="bl-stat__value">{(counts.whatsapp ?? 0).toLocaleString('en')}</span>
          <span className="bl-stat__label">{t.stats.whatsapp}</span>
        </div>
        <div className="bl-stat">
          <span className="bl-stat__value">{aiVisits.toLocaleString('en')}</span>
          <span className="bl-stat__label">{t.stats.ai}</span>
        </div>
      </div>

      <div className="bl-dash__grid">
        <div className="bl-card">
          <h3>{t.sources}</h3>
          <table className="bl-table">
            <thead>
              <tr>
                <th scope="col">{t.source}</th>
                <th scope="col">{t.visits}</th>
                <th scope="col">{t.added}</th>
                <th scope="col">{t.orders}</th>
                <th scope="col">{t.rate}</th>
                <th scope="col">{t.revenue}</th>
              </tr>
            </thead>
            <tbody>
              {sourceRows.map((s) => (
                <tr key={s.label}>
                  <th scope="row">
                    {s.label} {s.ai ? <span className="bl-chip">{t.aiTag}</span> : null}
                  </th>
                  <td>{s.visits}</td>
                  <td>{s.adds}</td>
                  <td>{s.orders}</td>
                  <td>{pct(s.orders, s.visits)}</td>
                  <td>{s.revenue ? money(s.revenue, lang) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bl-card">
          <h3>{t.pieces}</h3>
          <table className="bl-table">
            <thead>
              <tr>
                <th scope="col">{t.piece}</th>
                <th scope="col">{t.views}</th>
                <th scope="col">{t.typed}</th>
                <th scope="col">{t.added}</th>
                <th scope="col">{t.checkout}</th>
                <th scope="col">{t.orders}</th>
              </tr>
            </thead>
            <tbody>
              {pieces.map((p) => {
                const id = Number(p.product)
                return (
                  <tr key={id}>
                    <th scope="row">
                      <a href={`${admin}/collections/products/${id}`}>{names.get(id) ?? `#${id}`}</a>
                    </th>
                    <td>{p.views}</td>
                    <td>{p.typed || '–'}</td>
                    <td>{p.adds}</td>
                    <td>{p.checkout}</td>
                    <td>{ordered.get(id) ?? 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {landingRows.length ? (
          <div className="bl-card">
            <h3>{t.landing}</h3>
            <table className="bl-table">
              <thead>
                <tr>
                  <th scope="col">{t.page}</th>
                  <th scope="col">{t.orders}</th>
                  <th scope="col">{t.revenue}</th>
                </tr>
              </thead>
              <tbody>
                {landingRows.map(([page, e]) => (
                  <tr key={page}>
                    <th scope="row" dir="ltr">
                      {page}
                    </th>
                    <td>{e.orders}</td>
                    <td>{e.revenue ? money(e.revenue, lang) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </>
  )
}

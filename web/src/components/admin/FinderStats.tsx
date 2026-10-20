import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { dictionary } from '@/lib/dictionary'
import { parseAnswers, QUESTIONS, type Question } from '@/lib/finder'
import { money } from '@/lib/urls'

const DAYS = 30

const copy = {
  en: {
    title: `Gift finder · last ${DAYS} days`,
    intro: 'Each visit counts once per step. Orders are the ones where the customer clicked a pick on the visit they ordered in.',
    empty: 'Nobody has used the gift finder yet.',
    steps: { started: 'Started', finished: 'Saw their picks', clicked: 'Clicked a pick', added: 'Added a pick to the bag', orders: 'Ordered' },
    ofStarted: (p: string) => `${p} of starts`,
    revenue: 'Revenue from finder orders',
    asked: 'What people ask for',
    tags: (done: number, all: number) => `Gift-finder tags checked on ${done} of ${all} products.`,
    review: 'Review the rest',
    questions: { for: 'For', occasion: 'Occasion', budget: 'Budget', style: 'Style', finish: 'Finish' } as Record<Question, string>,
  },
  ar: {
    title: `دليل الهدايا · آخر ${DAYS} يوماً`,
    intro: 'تُحسب كل زيارة مرة واحدة في كل خطوة. الطلبات هي التي ضغط فيها العميل على اقتراح في نفس الزيارة.',
    empty: 'لم يستخدم أحد دليل الهدايا بعد.',
    steps: { started: 'بدؤوا', finished: 'رأوا الاقتراحات', clicked: 'ضغطوا على اقتراح', added: 'أضافوا اقتراحاً للحقيبة', orders: 'طلبوا' },
    ofStarted: (p: string) => `${p} ممن بدؤوا`,
    revenue: 'إيرادات طلبات الدليل',
    asked: 'ما يبحث عنه الناس',
    tags: (done: number, all: number) => `تمت مراجعة وسوم دليل الهدايا في ${done} من ${all} منتجاً.`,
    review: 'راجع الباقي',
    questions: { for: 'لمن', occasion: 'المناسبة', budget: 'الميزانية', style: 'الأسلوب', finish: 'اللون' } as Record<Question, string>,
  },
}

type Row = Record<string, string | number | null>
/** Start of the report window. (A server component renders once per request, so "now" is fine.) */
const windowStart = () => new Date(Date.now() - DAYS * 86400_000)
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '–')

/** On the admin home, under the shop funnel: how the gift finder is used and what it sells. */
/** How many products' gift-finder tags the shop has checked, with a link to the rest. */
async function TagReview({ payload, lang, admin }: { payload: Payload; lang: 'en' | 'ar'; admin: string }) {
  const t = copy[lang]
  const [all, done] = await Promise.all([
    payload.count({ collection: 'products' }),
    payload.count({ collection: 'products', where: { 'finder.checked': { equals: true } } }),
  ])
  if (!all.totalDocs) return null
  return (
    <p className="bl-note">
      {t.tags(done.totalDocs, all.totalDocs)}{' '}
      {done.totalDocs < all.totalDocs ? (
        <a className="bl-more" href={`${admin}/collections/products?where[finder.checked][not_equals]=true`}>
          {t.review} →
        </a>
      ) : null}
    </p>
  )
}

export async function FinderStats({ payload, lang, admin }: { payload: Payload; lang: 'en' | 'ar'; admin: string }) {
  const t = copy[lang]
  const since = windowStart()
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const rows = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: Row[] }).rows

  const [steps, added, done, orders] = await Promise.all([
    rows(sql`select type, count(distinct session)::int as n from events where created_at >= ${since} and type in ('finder', 'finder-done', 'finder-click') group by type`),
    // Visits that put a piece they'd clicked in the finder into the bag.
    rows(sql`select count(distinct a.session)::int as n from events a where a.type = 'add' and a.created_at >= ${since}
      and exists (select 1 from events c where c.type = 'finder-click' and c.session = a.session and c.product = a.product)`),
    rows(sql`select path from events where type = 'finder-done' and created_at >= ${since} and path is not null limit 5000`),
    payload.find({
      collection: 'orders',
      where: { and: [{ createdAt: { greater_than_equal: since.toISOString() } }, { 'attribution.finder': { equals: true } }, { status: { not_in: ['failed', 'cancelled', 'refunded'] } }] },
      select: { total: true },
      depth: 0,
      limit: 0,
      pagination: false,
    }),
  ])
  const n = Object.fromEntries(steps.map((r) => [r.type, Number(r.n)])) as Record<string, number>
  const started = n.finder ?? 0
  if (!started && !orders.docs.length) {
    return (
      <div className="bl-card">
        <h3>{t.title}</h3>
        <p>{t.empty}</p>
        <TagReview payload={payload} lang={lang} admin={admin} />
      </div>
    )
  }

  // The most common answer to each question, worded as the shopper saw it.
  const f = dictionary(lang).finder
  const tally = new Map<Question, Map<string, number>>()
  for (const r of done) {
    const query = String(r.path ?? '').split('?')[1] ?? ''
    const a = parseAnswers(Object.fromEntries(new URLSearchParams(query)))
    for (const q of QUESTIONS) {
      const v = q === 'budget' ? (a.budget ? (a.budget.max === null ? (a.budget.min ? `${a.budget.min}+ JOD` : f.budgetAny) : `${a.budget.min}–${a.budget.max} JOD`) : null) : a[q] ? f.options[q][a[q]!] : null
      if (!v) continue
      const m = tally.get(q) ?? new Map<string, number>()
      m.set(v, (m.get(v) ?? 0) + 1)
      tally.set(q, m)
    }
  }
  const top = QUESTIONS.map((q) => {
    const m = tally.get(q)
    if (!m?.size) return null
    const [value, count] = [...m.entries()].sort((x, y) => y[1] - x[1])[0]
    return { q, value, share: pct(count, [...m.values()].reduce((s, x) => s + x, 0)) }
  }).filter(Boolean) as { q: Question; value: string; share: string }[]

  const list = [
    { key: 'started', n: started },
    { key: 'finished', n: n['finder-done'] ?? 0 },
    { key: 'clicked', n: n['finder-click'] ?? 0 },
    { key: 'added', n: Number(added[0]?.n ?? 0) },
    { key: 'orders', n: orders.docs.length },
  ] as const
  const revenue = orders.docs.reduce((s, o) => s + (o.total ?? 0), 0)

  return (
    <div className="bl-card">
      <h3>{t.title}</h3>
      <p className="bl-note">{t.intro}</p>
      <TagReview payload={payload} lang={lang} admin={admin} />
      <ol className="bl-funnel">
        {list.map((s, i) => (
          <li key={s.key}>
            <span className="bl-funnel__label">{t.steps[s.key]}</span>
            <span className="bl-funnel__track">
              <span className="bl-funnel__bar" style={{ width: `${started ? Math.max(0.5, (s.n / started) * 100) : 0}%` }} />
            </span>
            <span className="bl-funnel__value">
              <strong>{s.n.toLocaleString('en')}</strong> {i ? <small>{t.ofStarted(pct(s.n, started))}</small> : null}
            </span>
          </li>
        ))}
      </ol>
      <p>
        <strong>{t.revenue}:</strong> {money(revenue, lang)}
      </p>
      {top.length ? (
        <>
          <h4>{t.asked}</h4>
          <ul className="bl-legend bl-legend--plain">
            {top.map((x) => (
              <li key={x.q}>
                {t.questions[x.q]}: <strong>{x.value}</strong> ({x.share})
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

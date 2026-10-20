import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { money } from '@/lib/urls'

const DAYS = 30

const copy = {
  en: {
    title: 'Most wanted back',
    intro: 'Sold-out pieces people asked to be emailed about. Put one back in stock and save: everyone waiting gets one email, automatically.',
    empty: 'Nobody is waiting for a sold-out piece right now.',
    piece: 'Piece',
    waiting: 'Waiting',
    which: 'Choices',
    whole: 'any',
    sent: (n: number) => `${n} back-in-stock ${n === 1 ? 'email' : 'emails'} sent in the last ${DAYS} days`,
    orders: (n: number, total: string) => `${n} ${n === 1 ? 'order' : 'orders'} from those emails (${total})`,
    all: 'All requests',
  },
  ar: {
    title: 'الأكثر طلباً للعودة',
    intro: 'قطع نفدت وطلب الزبائن رسالة عند عودتها. أعد واحدة إلى المخزون واحفظ: يصل كل من ينتظر رسالة واحدة تلقائياً.',
    empty: 'لا أحد ينتظر قطعة نفدت حالياً.',
    piece: 'القطعة',
    waiting: 'بالانتظار',
    which: 'الاختيارات',
    whole: 'أي',
    sent: (n: number) => `أُرسلت ${n} رسالة عودة للمخزون في آخر ${DAYS} يوماً`,
    orders: (n: number, total: string) => `${n} طلب من هذه الرسائل (${total})`,
    all: 'كل الطلبات',
  },
}

type Row = { product: number; wanted: string | null; n: number }

/** On the admin home (catalog staff): which sold-out pieces people are waiting for, and what the emails sold. */
export async function RestockDemand({ payload, lang, admin }: { payload: Payload; lang: 'en' | 'ar'; admin: string }) {
  const t = copy[lang]
  const since = windowStart()
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const [rows, sent, orders] = await Promise.all([
    db
      .execute(
        sql`select product_id as product, max(wanted) as wanted, count(*)::int as n from restock_requests
          where status = 'waiting' group by product_id, variant order by n desc limit 8`,
      )
      .then((r) => (r as unknown as { rows: Row[] }).rows),
    payload.count({ collection: 'restock-requests', where: { and: [{ status: { equals: 'notified' } }, { notifiedAt: { greater_than_equal: since.toISOString() } }] } }),
    payload.find({
      collection: 'orders',
      where: { and: [{ createdAt: { greater_than_equal: since.toISOString() } }, { 'attribution.source': { equals: 'restock' } }, { status: { not_in: ['failed', 'cancelled', 'refunded'] } }] },
      select: { total: true },
      depth: 0,
      limit: 0,
      pagination: false,
    }),
  ])
  const ids = [...new Set(rows.map((r) => Number(r.product)))]
  const names = new Map(
    ids.length
      ? (await payload.find({ collection: 'products', where: { id: { in: ids } }, select: { name: true }, depth: 0, limit: ids.length, locale: lang, draft: true })).docs.map((d) => [d.id, d.name])
      : [],
  )
  const revenue = orders.docs.reduce((s, o) => s + (o.total ?? 0), 0)
  const list = `${admin}/collections/restock-requests`

  return (
    <div className="bl-card">
      <h3>{t.title}</h3>
      <p className="bl-note">{t.intro}</p>
      {rows.length ? (
        <table className="bl-table">
          <thead>
            <tr>
              <th scope="col">{t.piece}</th>
              <th scope="col">{t.which}</th>
              <th scope="col">{t.waiting}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.product}-${r.wanted}`}>
                <th scope="row">
                  <a href={`${admin}/collections/products/${r.product}`}>{names.get(Number(r.product)) ?? `#${r.product}`}</a>
                </th>
                <td className="bl-wrap">{r.wanted || t.whole}</td>
                <td>
                  <a href={`${list}?where[product][equals]=${r.product}&where[status][equals]=waiting`}>{r.n}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>{t.empty}</p>
      )}
      <p className="bl-note">
        {t.sent(sent.totalDocs)}
        {orders.docs.length ? ` · ${t.orders(orders.docs.length, money(revenue, lang))}` : ''}
      </p>
      <a className="bl-more" href={list}>
        {t.all} →
      </a>
    </div>
  )
}

/** Start of the report window. (A server component renders once per request, so "now" is fine.) */
const windowStart = () => new Date(Date.now() - DAYS * 86400_000)

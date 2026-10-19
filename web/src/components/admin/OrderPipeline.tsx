import type { Payload } from 'payload'

import { caseReasons, caseTypes } from '@/lib/orderCases'
import { duration, orderStages } from '@/lib/orderStages'
import { findStuck } from '@/lib/stuckOrders'

const copy = {
  en: {
    pipeline: 'Orders in progress',
    pipelineNote: 'Open a stage to see its orders, oldest first.',
    stuck: 'Stuck orders',
    stuckNote: 'In one stage longer than you allowed. Move them on before the customer asks.',
    none: 'Nothing is stuck.',
    over: (late: string) => `${late} over`,
    allStuck: 'All stuck orders',
    limits: 'Change the time limits',
    cases: 'Returns & refunds, last 30 days',
    open: 'still open',
    refunded: 'paid back',
    ours: 'our mistakes',
    noCases: 'No cancellations, returns or refunds.',
    allCases: 'All returns & refunds',
  },
  ar: {
    pipeline: 'طلبات قيد العمل',
    pipelineNote: 'افتح مرحلة لترى طلباتها، الأقدم أولاً.',
    stuck: 'طلبات متأخرة',
    stuckNote: 'بقيت في مرحلة أطول من المسموح. حرّكها قبل أن يسأل العميل.',
    none: 'لا يوجد طلب متأخر.',
    over: (late: string) => `تجاوز بـ ${late}`,
    allStuck: 'كل الطلبات المتأخرة',
    limits: 'غيّر المهل الزمنية',
    cases: 'الإرجاع والاسترداد، آخر 30 يوماً',
    open: 'ما زالت مفتوحة',
    refunded: 'مبالغ مستردة',
    ours: 'أخطاء من طرفنا',
    noCases: 'لا يوجد إلغاء أو إرجاع أو استرداد.',
    allCases: 'كل حالات الإرجاع والاسترداد',
  },
}

/** Top of the admin home: where every order is, which ones are stuck, and what came back. */
export async function OrderPipeline({ payload, lang, admin }: { payload: Payload; lang: 'en' | 'ar'; admin: string }) {
  const t = copy[lang]
  const orders = `${admin}/collections/orders`
  const casesUrl = `${admin}/collections/order-cases`
  const now = new Date()
  const since = new Date(now.getTime() - 30 * 86400_000).toISOString()

  const [stageCounts, stuck, cases] = await Promise.all([
    Promise.all(orderStages.map((s) => payload.count({ collection: 'orders', where: { stage: { equals: s.value } } }))),
    findStuck(payload, now),
    payload.find({
      collection: 'order-cases',
      where: { createdAt: { greater_than_equal: since } },
      limit: 0,
      pagination: false,
      depth: 0,
      select: { type: true, caseStatus: true, reason: true, fault: true, refundAmount: true },
    }),
  ])

  const byType = caseTypes.map((c) => ({ ...c, n: cases.docs.filter((d) => d.type === c.value).length }))
  const open = cases.docs.filter((d) => d.caseStatus === 'open' || d.caseStatus === 'waiting').length
  const refunded = cases.docs.reduce((s, d) => s + (d.caseStatus === 'done' ? (d.refundAmount ?? 0) : 0), 0)
  const ours = cases.docs.filter((d) => d.fault === 'shop').length
  const reasons = caseReasons
    .map((r) => ({ ...r, n: cases.docs.filter((d) => d.reason === r.value).length }))
    .filter((r) => r.n)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)

  return (
    <div className="bl-dash__orders">
      <div className="bl-card bl-card--wide">
        <h3>{t.pipeline}</h3>
        <p className="bl-note">{t.pipelineNote}</p>
        <ol className="bl-pipeline">
          {orderStages.map((s, i) => (
            <li key={s.value}>
              <a href={`${orders}?where[stage][equals]=${s.value}&sort=stageSince`}>
                <span className="bl-pipeline__n">{stageCounts[i].totalDocs}</span>
                <span className="bl-pipeline__label">{s.label[lang]}</span>
                {stuck.some((o) => o.stage === s.value) ? <span className="bl-pipeline__stuck">{stuck.filter((o) => o.stage === s.value).length}!</span> : null}
              </a>
            </li>
          ))}
        </ol>
      </div>

      <div className={`bl-card${stuck.length ? ' bl-card--alert' : ''}`}>
        <h3>
          {t.stuck} {stuck.length ? <span className="bl-chip bl-chip--alert">{stuck.length}</span> : null}
        </h3>
        <p className="bl-note">{t.stuckNote}</p>
        {stuck.length ? (
          <ul className="bl-lowest">
            {stuck.slice(0, 8).map((o) => (
              <li key={o.id}>
                <a href={`${orders}/${o.id}`}>{o.title}</a>
                <span className="bl-stage is-stuck">
                  <span className="bl-stage__name">{orderStages.find((s) => s.value === o.stage)?.label[lang]}</span>
                  <small className="bl-stage__stuck">{t.over(duration(now.getTime() - new Date(o.stuckAt!).getTime(), lang))}</small>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t.none}</p>
        )}
        <a className="bl-more" href={`${orders}?where[stuckAt][less_than_equal]=${encodeURIComponent(now.toISOString())}&sort=stuckAt`}>
          {t.allStuck} →
        </a>{' '}
        <a className="bl-more bl-more--quiet" href={`${admin}/globals/site-settings`}>
          {t.limits}
        </a>
      </div>

      <div className="bl-card">
        <h3>{t.cases}</h3>
        {cases.docs.length ? (
          <>
            <ul className="bl-legend bl-legend--plain">
              {byType.map((c) => (
                <li key={c.value}>
                  <strong>{c.n}</strong> {c.label[lang]}
                </li>
              ))}
            </ul>
            <ul className="bl-legend bl-legend--plain">
              <li>
                <strong>{open}</strong> {t.open}
              </li>
              <li>
                <strong>{new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(refunded)}</strong> {lang === 'ar' ? 'د.أ' : 'JOD'} {t.refunded}
              </li>
              <li>
                <strong>{ours}</strong> {t.ours}
              </li>
            </ul>
            {reasons.length ? (
              <ul className="bl-lowest">
                {reasons.map((r) => (
                  <li key={r.value}>
                    <a href={`${casesUrl}?where[reason][equals]=${r.value}`}>{r.label[lang]}</a>
                    <b>{r.n}</b>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p>{t.noCases}</p>
        )}
        <a className="bl-more" href={casesUrl}>
          {t.allCases} →
        </a>
      </div>
    </div>
  )
}

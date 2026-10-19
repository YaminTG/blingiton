import type { UIFieldServerProps } from 'payload'

import { orderStatuses } from '@/lib/orderOptions'
import { clock, duration, isStuck, limitHours, limitsFrom, orderStages, stageRank, type Stage } from '@/lib/orderStages'
import { trackLink, whatsappUpdate } from '@/lib/orderTrack'
import type { Order } from '@/payload-types'

import { OrderActions } from './OrderActions'

const copy = {
  en: {
    title: 'Order journey',
    stuck: (late: string) => `Stuck: ${late} over the limit`,
    left: (left: string) => `${left} left in this stage`,
    customerPage: 'Customer’s order page',
    by: 'by',
  },
  ar: {
    title: 'رحلة الطلب',
    stuck: (late: string) => `متأخر: تجاوز الحد بـ ${late}`,
    left: (left: string) => `بقي ${left} في هذه المرحلة`,
    customerPage: 'صفحة الطلب لدى العميل',
    by: 'بواسطة',
  },
}

const when = (iso: string, lang: 'en' | 'ar') =>
  new Intl.DateTimeFormat(lang === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' }).format(new Date(iso))

/**
 * Sidebar of an order: each stage with when it was reached and by whom, how long the current stage
 * has left (or how overdue it is), the next-stage and WhatsApp buttons, and the customer's own page.
 */
export async function OrderTimeline({ data, payload, i18n, id }: UIFieldServerProps) {
  const order = data as Partial<Order>
  if (!id || !order?.number) return null
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const t = copy[lang]
  const now = clock()
  const history = order.stageHistory ?? []

  const userIds = [...new Set(history.map((h) => (typeof h.by === 'object' ? h.by?.id : h.by)).filter((x): x is number => typeof x === 'number'))]
  const users = userIds.length
    ? (await payload.find({ collection: 'users', where: { id: { in: userIds } }, depth: 0, limit: userIds.length, select: { name: true, email: true } })).docs
    : []
  const nameOf = (by: (typeof history)[number]['by']) => {
    const u = users.find((x) => x.id === (typeof by === 'object' ? by?.id : by))
    return u ? (u as { name?: string }).name || u.email : null
  }

  // The last time each stage was reached (an order can go back a step).
  const reached = new Map<string, (typeof history)[number]>()
  for (const h of history) reached.set(h.step, h)
  const current = order.stage as Stage | null | undefined
  const statusLabel = !current ? orderStatuses.find((s) => s.value === order.status)?.label[lang] : null

  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0, select: { orderFlow: true } })
  const limit = limitHours(current, order.shipping?.method, limitsFrom(settings.orderFlow?.limits))
  const stuck = isStuck(order.stuckAt, now)
  const locale = order.locale === 'ar' ? 'ar' : 'en'

  return (
    <div className="bl-journey" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <h4>{t.title}</h4>
      {statusLabel ? <p className={`bl-status bl-status--${order.status}`}>{statusLabel}</p> : null}
      <ol className="bl-journey__steps">
        {orderStages.map((s) => {
          const h = reached.get(s.value)
          const state = !current ? (h ? 'done' : 'todo') : s.value === current ? 'now' : stageRank(s.value) < stageRank(current) ? 'done' : 'todo'
          const who = h ? nameOf(h.by) : null
          return (
            <li key={s.value} className={`is-${state}${state === 'now' && stuck ? ' is-stuck' : ''}`}>
              <b>{s.label[lang]}</b>
              {h && state !== 'todo' ? (
                <small>
                  {when(h.at, lang)}
                  {who ? ` · ${t.by} ${who}` : ''}
                </small>
              ) : null}
            </li>
          )
        })}
      </ol>
      {current && order.stuckAt && limit ? (
        <p className={`bl-journey__clock${stuck ? ' is-stuck' : ''}`}>
          {stuck ? t.stuck(duration(now - new Date(order.stuckAt).getTime(), lang)) : t.left(duration(new Date(order.stuckAt).getTime() - now, lang))}
        </p>
      ) : null}
      <OrderActions
        id={Number(id)}
        title={order.title ?? ''}
        status={order.status ?? 'processing'}
        stage={current ?? null}
        phone={order.customer?.phone ?? ''}
        update={whatsappUpdate({ ...(order as Order), id: Number(id) })}
        reload
      />
      <a className="bl-more" href={trackLink(locale, Number(id))} target="_blank" rel="noreferrer">
        {t.customerPage} ↗
      </a>
    </div>
  )
}

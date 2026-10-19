import type { DefaultServerCellComponentProps } from 'payload'

import { orderStatuses, paymentMethods } from '@/lib/orderOptions'
import { clock, duration, isStuck, orderStages } from '@/lib/orderStages'
import { whatsappUpdate } from '@/lib/orderTrack'
import { originLabel } from '@/lib/origin'
import type { Order } from '@/payload-types'

import { OrderActions } from './OrderActions'

const langOf = (i18n: DefaultServerCellComponentProps['i18n']) => (i18n.language === 'ar' ? 'ar' : 'en')

/** The stage, how long it has been there, and a red "stuck" flag once it's past the shop's limit. */
export function StageCell({ rowData, i18n }: DefaultServerCellComponentProps) {
  return <StagePill order={rowData as Partial<Order>} lang={langOf(i18n)} />
}

export function StagePill({ order, lang, now = clock() }: { order: Partial<Order>; lang: 'en' | 'ar'; now?: number }) {
  const s = orderStages.find((o) => o.value === order.stage)
  if (!s) return <span className="bl-stage bl-stage--none">–</span>
  const since = order.stageSince ? duration(now - new Date(order.stageSince).getTime(), lang) : null
  const stuck = isStuck(order.stuckAt, now)
  return (
    <span className={`bl-stage bl-stage--${s.value}${stuck ? ' is-stuck' : ''}`}>
      <span className="bl-stage__name">{s.label[lang]}</span>
      {stuck ? (
        <small className="bl-stage__stuck">
          {lang === 'ar' ? 'متأخر' : 'Stuck'} · {since}
        </small>
      ) : since && s.value !== 'delivered' ? (
        <small>{since}</small>
      ) : null}
    </span>
  )
}

/** Quick buttons: confirm, move to the next stage, WhatsApp the customer an update. */
export function ActionsCell({ rowData }: DefaultServerCellComponentProps) {
  const o = rowData as Order
  return (
    <OrderActions
      id={o.id}
      title={o.title ?? ''}
      status={o.status}
      stage={o.stage ?? null}
      phone={o.customer?.phone ?? ''}
      update={o.number ? whatsappUpdate(o) : ''}
    />
  )
}

/** Status as a coloured pill, like WooCommerce's order list. */
export function StatusCell({ cellData, i18n }: DefaultServerCellComponentProps) {
  return <StatusPill status={cellData as Order['status']} lang={langOf(i18n)} />
}

export function StatusPill({ status, lang }: { status: Order['status'] | undefined; lang: 'en' | 'ar' }) {
  const s = orderStatuses.find((o) => o.value === status)
  return <span className={`bl-status bl-status--${status ?? 'none'}`}>{s ? s.label[lang] : '–'}</span>
}

/** "45 JOD" with the payment method under it. */
export function TotalCell({ cellData, rowData, i18n }: DefaultServerCellComponentProps) {
  const lang = langOf(i18n)
  const method = paymentMethods.find((m) => m.value === (rowData as Partial<Order>).payment?.method)
  const total = typeof cellData === 'number' ? new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(cellData) : '–'
  return (
    <span className="bl-total">
      <b>
        {total} {lang === 'ar' ? 'د.أ' : 'JOD'}
      </b>
      {method ? <small>{method.label[lang]}</small> : null}
    </span>
  )
}

export function OriginCell({ rowData, i18n }: DefaultServerCellComponentProps) {
  const o = (rowData as Partial<Order>).attribution
  const title = [o?.campaign && `campaign: ${o.campaign}`, o?.medium && `medium: ${o.medium}`, o?.referrer, o?.landingPage].filter(Boolean).join('\n')
  return (
    <span className="bl-origin" title={title || undefined}>
      {originLabel(o, langOf(i18n))}
    </span>
  )
}

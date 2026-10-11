import type { DefaultServerCellComponentProps } from 'payload'

import { orderStatuses, paymentMethods } from '@/lib/orderOptions'
import { originLabel } from '@/lib/origin'
import type { Order } from '@/payload-types'

const langOf = (i18n: DefaultServerCellComponentProps['i18n']) => (i18n.language === 'ar' ? 'ar' : 'en')

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

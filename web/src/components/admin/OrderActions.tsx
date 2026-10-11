'use client'

import type { DefaultCellComponentProps } from 'payload'

import { toast, useConfig, useRowLabel, useTranslation } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { OrderStatus } from '@/lib/orderOptions'

const copy = {
  en: { processing: 'Processing', complete: 'Complete', whatsapp: 'WhatsApp the customer', saved: (no: string) => `Order ${no} updated`, failed: 'Couldn’t update the order' },
  ar: { processing: 'قيد التجهيز', complete: 'إكمال', whatsapp: 'راسل العميل على واتساب', saved: (no: string) => `تم تحديث الطلب ${no}`, failed: 'تعذّر تحديث الطلب' },
}

/** Local Jordanian numbers (07…) become 9627…, so wa.me opens the right chat. */
const waNumber = (phone: string) => {
  let d = phone.replace(/\D/g, '').replace(/^00/, '')
  if (d.startsWith('0')) d = `962${d.slice(1)}`
  return d
}

type Row = { id: number; status?: OrderStatus; title?: string; customer?: { phone?: string } }

/** Quick status buttons in the orders list, like WooCommerce's: pending/on hold → Processing → Complete. */
export function OrderActions({ rowData }: DefaultCellComponentProps) {
  const row = rowData as Row
  const { i18n } = useTranslation()
  const t = copy[i18n.language === 'ar' ? 'ar' : 'en']
  const { config } = useConfig()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const next: OrderStatus | null = row.status === 'pending' || row.status === 'on-hold' ? 'processing' : row.status === 'processing' ? 'completed' : null
  const phone = row.customer?.phone ? waNumber(row.customer.phone) : ''

  async function move(status: OrderStatus) {
    setBusy(true)
    try {
      const res = await fetch(`${config.serverURL}${config.routes.api}/orders/${row.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error(String(res.status))
      toast.success(t.saved(row.title?.split(' ')[0] ?? ''))
      router.refresh()
    } catch {
      toast.error(t.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="bl-actions">
      {next ? (
        <button type="button" className={`bl-action bl-action--${next}`} disabled={busy} onClick={() => move(next)} title={next === 'processing' ? t.processing : t.complete}>
          {next === 'processing' ? '⋯' : '✓'}
          <span>{next === 'processing' ? t.processing : t.complete}</span>
        </button>
      ) : null}
      {phone ? (
        <a className="bl-action bl-action--wa" href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer" title={t.whatsapp} aria-label={t.whatsapp}>
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.2-.2-.5-.3z"
            />
          </svg>
        </a>
      ) : null}
    </span>
  )
}

/** "2 × Dainty Name Necklace" on each item row of an order. */
export function ItemRowLabel() {
  const { data, rowNumber } = useRowLabel<{ name?: string; quantity?: number }>()
  if (!data?.name) return <span>#{(rowNumber ?? 0) + 1}</span>
  return (
    <span>
      {data.quantity && data.quantity > 1 ? `${data.quantity} × ` : ''}
      {data.name}
    </span>
  )
}

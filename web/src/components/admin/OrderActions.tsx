'use client'

import { toast, useConfig, useRowLabel, useTranslation } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { OrderStatus } from '@/lib/orderOptions'
import { nextStage, orderStages, type Stage } from '@/lib/orderStages'

const copy = {
  en: {
    confirm: 'Confirm',
    to: 'Mark as',
    whatsapp: 'WhatsApp the customer an update',
    saved: (no: string) => `Order ${no} updated`,
    failed: 'Couldn’t update the order',
  },
  ar: {
    confirm: 'تأكيد',
    to: 'انقل إلى',
    whatsapp: 'أرسل للعميل تحديثاً على واتساب',
    saved: (no: string) => `تم تحديث الطلب ${no}`,
    failed: 'تعذّر تحديث الطلب',
  },
}

/** Local Jordanian numbers (07…) become 9627…, so wa.me opens the right chat. */
export const waNumber = (phone: string) => {
  let d = phone.replace(/\D/g, '').replace(/^00/, '')
  if (d.startsWith('0')) d = `962${d.slice(1)}`
  return d
}

/** `reload`: on the order page, so the form shows the new stage and a later Save can't send the old one back. */
type Props = { id: number; title: string; status: OrderStatus; stage: Stage | null; phone: string; update: string; reload?: boolean }

/**
 * Quick buttons in the orders list and on the order page: pending / on hold → Confirm; then one step along
 * the pipeline (paid → preparing → packed → shipped → delivered). The WhatsApp button opens the
 * chat with a message saying where the order is, in the customer's language, with their order link.
 */
export function OrderActions({ id, title, status, stage, phone, update, reload }: Props) {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const t = copy[lang]
  const { config } = useConfig()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  // Pending payment, or on hold while payment is arranged on WhatsApp: confirm first.
  const unconfirmed = status === 'pending' || status === 'on-hold'
  const next = unconfirmed ? null : nextStage(stage)
  const nextLabel = orderStages.find((s) => s.value === next)?.label[lang]
  const wa = phone ? `https://wa.me/${waNumber(phone)}${update ? `?text=${encodeURIComponent(update)}` : ''}` : ''

  async function save(data: { status: OrderStatus } | { stage: Stage }) {
    setBusy(true)
    try {
      const res = await fetch(`${config.serverURL}${config.routes.api}/orders/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(String(res.status))
      toast.success(t.saved(title.split(' ')[0] ?? ''))
      if (reload) window.location.reload()
      else router.refresh()
    } catch {
      toast.error(t.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="bl-actions">
      {unconfirmed ? (
        <button type="button" className="bl-action" disabled={busy} onClick={() => save({ status: 'processing' })}>
          ✓ <span>{t.confirm}</span>
        </button>
      ) : next ? (
        <button type="button" className={`bl-action bl-action--${next}`} disabled={busy} onClick={() => save({ stage: next })} title={`${t.to}: ${nextLabel}`}>
          → <span>{nextLabel}</span>
        </button>
      ) : null}
      {wa ? (
        <a className="bl-action bl-action--wa" href={wa} target="_blank" rel="noopener noreferrer" title={t.whatsapp} aria-label={t.whatsapp}>
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

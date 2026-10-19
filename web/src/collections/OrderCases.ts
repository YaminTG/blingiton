import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { admins, may } from '@/access'
import { l } from '@/fields/label'
import { caseReasons, caseStatuses, caseTypes, refundMethods } from '@/lib/orderCases'
import type { OrderCase } from '@/payload-types'

const idOf = (v: number | { id: number } | null | undefined) => (v && typeof v === 'object' ? v.id : (v ?? null))

/** Title, customer and "closed on" follow the order and the case's own status. */
const caseBeforeChange: CollectionBeforeChangeHook<OrderCase> = async ({ data, originalDoc, req }) => {
  const orderId = idOf(data.order ?? originalDoc?.order)
  if (orderId) {
    const order = await req.payload.findByID({ collection: 'orders', id: orderId, depth: 0, req, select: { number: true, customerRecord: true } })
    const type = caseTypes.find((t) => t.value === (data.type ?? originalDoc?.type))?.label.en ?? ''
    data.title = `${type} · #${order.number}`
    data.customer = idOf(order.customerRecord)
  }
  const status = data.caseStatus ?? originalDoc?.caseStatus
  const closed = status === 'done' || status === 'declined'
  data.closedAt = closed ? (originalDoc?.closedAt ?? new Date().toISOString()) : null
  if (!originalDoc && req.user?.collection === 'users') data.openedBy = req.user.id
  return data
}

/**
 * A finished cancellation cancels the order; a finished refund (or return/cancellation with money
 * back) of the whole total marks it refunded. Partial refunds leave the order as it is.
 */
const caseAfterChange: CollectionAfterChangeHook<OrderCase> = async ({ doc, previousDoc, req }) => {
  if (doc.caseStatus !== 'done' || previousDoc?.caseStatus === 'done') return doc
  const orderId = idOf(doc.order)
  if (!orderId) return doc
  const order = await req.payload.findByID({ collection: 'orders', id: orderId, depth: 0, req, select: { status: true, total: true } })
  const fullRefund = (doc.refundAmount ?? 0) > 0 && (doc.refundAmount ?? 0) >= (order.total ?? 0)
  const status = fullRefund ? 'refunded' : doc.type === 'cancellation' ? 'cancelled' : null
  if (status && order.status !== status) {
    await req.payload.update({ collection: 'orders', id: orderId, data: { status }, req })
  }
  return doc
}

export const OrderCases: CollectionConfig = {
  slug: 'order-cases',
  labels: { singular: l('Return / refund', 'إرجاع / استرداد'), plural: l('Returns & refunds', 'الإرجاع والاسترداد') },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'caseStatus', 'reason', 'fault', 'refundAmount', 'createdAt'],
    group: l('Shop', 'المتجر'),
    description: l(
      'Every cancellation, return, exchange and refund, with the reason, so you can see what goes wrong and how often. Add one from the order too.',
      'كل إلغاء وإرجاع واستبدال واسترداد مع السبب، لترى ما الذي يحدث وكم مرة. يمكنك إضافته من صفحة الطلب أيضاً.',
    ),
  },
  defaultSort: '-createdAt',
  access: { read: may('orders', 'customers'), create: may('orders'), update: may('orders'), delete: admins },
  hooks: { beforeChange: [caseBeforeChange], afterChange: [caseAfterChange] },
  fields: [
    { name: 'title', type: 'text', admin: { hidden: true } },
    {
      type: 'row',
      fields: [
        { name: 'order', type: 'relationship', relationTo: 'orders', required: true, index: true, label: l('Order', 'الطلب'), admin: { width: '50%' } },
        { name: 'type', type: 'select', required: true, defaultValue: 'return', label: l('What', 'النوع'), options: caseTypes.map((t) => ({ ...t })), admin: { width: '25%' } },
        {
          name: 'caseStatus',
          type: 'select',
          required: true,
          defaultValue: 'open',
          index: true,
          label: l('Status', 'الحالة'),
          options: caseStatuses.map((s) => ({ ...s })),
          admin: { width: '25%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'reason', type: 'select', required: true, index: true, label: l('Reason', 'السبب'), options: caseReasons.map((r) => ({ ...r })), admin: { width: '50%' } },
        {
          name: 'fault',
          type: 'select',
          label: l('Whose side', 'من أي جهة'),
          options: [
            { value: 'shop', label: l('Ours (workshop / packing)', 'من طرفنا (المشغل / التغليف)') },
            { value: 'courier', label: l('Courier', 'شركة التوصيل') },
            { value: 'customer', label: l('Customer', 'العميل') },
            { value: 'none', label: l('Nobody', 'لا أحد') },
          ],
          admin: { width: '50%', description: l('So mistakes that are ours can be counted and fixed.', 'لنحصي أخطاءنا ونصلحها.') },
        },
      ],
    },
    {
      name: 'items',
      type: 'array',
      label: l('Which pieces', 'أي قطع'),
      labels: { singular: l('Piece', 'قطعة'), plural: l('Pieces', 'قطع') },
      admin: { description: l('Leave empty when it’s the whole order.', 'اتركه فارغاً إذا كان الطلب كاملاً.') },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'name', type: 'text', required: true, label: l('Piece', 'القطعة'), admin: { width: '80%' } },
            { name: 'quantity', type: 'number', min: 1, defaultValue: 1, label: l('Qty', 'الكمية'), admin: { width: '20%' } },
          ],
        },
      ],
    },
    {
      name: 'exchangeFor',
      type: 'textarea',
      label: l('Exchanged for', 'استُبدل بـ'),
      admin: { condition: (data) => data?.type === 'exchange', description: l('The new piece, size or name. Make a new order if it costs more.', 'القطعة أو المقاس أو الاسم الجديد. أنشئ طلباً جديداً إذا كان أغلى.') },
    },
    {
      type: 'row',
      admin: { condition: (data) => data?.type !== 'exchange' },
      fields: [
        { name: 'refundAmount', type: 'number', min: 0, label: l('Money back (JOD)', 'المبلغ المسترد (د.أ)'), admin: { width: '33%' } },
        { name: 'refundMethod', type: 'select', label: l('Paid back by', 'طريقة الاسترداد'), options: refundMethods.map((m) => ({ ...m })), admin: { width: '33%' } },
        { name: 'refundedAt', type: 'date', label: l('Paid back on', 'تاريخ الاسترداد'), admin: { width: '33%' } },
      ],
    },
    { name: 'note', type: 'textarea', label: l('What happened', 'ماذا حدث'), admin: { description: l('Only the team sees this.', 'يراها الفريق فقط.') } },
    { name: 'customer', type: 'relationship', relationTo: 'customers', index: true, label: l('Customer', 'العميل'), admin: { position: 'sidebar', readOnly: true } },
    { name: 'openedBy', type: 'relationship', relationTo: 'users', label: l('Opened by', 'فتحه'), admin: { position: 'sidebar', readOnly: true } },
    {
      name: 'closedAt',
      type: 'date',
      label: l('Closed on', 'أُغلق في'),
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: l('Marking a cancellation “Done” cancels the order; a refund of the full total marks it refunded.', 'إنهاء الإلغاء يلغي الطلب؛ واسترداد كامل المبلغ يجعله مسترداً.'),
      },
    },
  ],
}

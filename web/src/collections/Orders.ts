import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { admins, loggedIn } from '@/access'
import { l } from '@/fields/label'
import { later } from '@/hooks/revalidate'
import { sendOrderEmails } from '@/lib/orderEmails'
import { FIRST_ORDER_NUMBER, orderStatuses, paymentMethods, type OrderStatus } from '@/lib/orderOptions'
import type { Order } from '@/payload-types'

/** Statuses that mean "we have the order", so the customer gets the confirmation email. */
const RECEIVED: OrderStatus[] = ['processing', 'on-hold']

const orderBeforeChange: CollectionBeforeChangeHook<Order> = async ({ data, originalDoc, operation, req }) => {
  if (operation === 'create' && !data.number) {
    const last = await req.payload.find({ collection: 'orders', sort: '-number', limit: 1, depth: 0, select: { number: true }, req })
    data.number = Math.max(FIRST_ORDER_NUMBER - 1, last.docs[0]?.number ?? 0) + 1
  }
  // Line totals and the order total always follow the items, including orders made by hand in the admin.
  if (data.items || data.deliveryFee != null) {
    const items = data.items ?? originalDoc?.items ?? []
    for (const it of items) it.lineTotal = (it.unitPrice ?? 0) * (it.quantity ?? 1)
    data.subtotal = items.reduce((s, it) => s + (it.lineTotal ?? 0), 0)
    data.total = data.subtotal + (data.deliveryFee ?? originalDoc?.deliveryFee ?? 0)
  }
  const number = data.number ?? originalDoc?.number
  const name = data.customer?.name ?? originalDoc?.customer?.name ?? ''
  data.title = `#${number} ${name}`.trim()
  return data
}

const orderAfterChange: CollectionAfterChangeHook<Order> = ({ doc, previousDoc, operation, context, req }) => {
  if (context.orderEmails) return doc
  const was = operation === 'create' ? undefined : previousDoc?.status
  if (doc.status === was) return doc
  if (RECEIVED.includes(doc.status) && !doc.emails?.receivedAt) later(() => sendOrderEmails(req.payload, doc.id, 'received'))
  if (doc.status === 'completed' && !doc.emails?.completedAt) later(() => sendOrderEmails(req.payload, doc.id, 'completed'))
  return doc
}

// Orders reach the database only through the checkout (src/lib/orders.ts, server side) or the
// admin. The public API can't read, create or change them.
export const Orders: CollectionConfig = {
  slug: 'orders',
  labels: { singular: l('Order', 'طلب'), plural: l('Orders', 'الطلبات') },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'createdAt', 'status', 'total', 'origin', 'actions'],
    listSearchableFields: ['title', 'customer.phone', 'customer.email'],
    group: l('Shop', 'المتجر'),
    components: { beforeListTable: ['/components/admin/OrderStatusTabs#OrderStatusTabs'] },
  },
  defaultSort: '-createdAt',
  access: { read: loggedIn, create: loggedIn, update: loggedIn, delete: admins },
  hooks: { beforeChange: [orderBeforeChange], afterChange: [orderAfterChange] },
  fields: [
    // "#20001 Sara Ahmad": the list's first column and the page title. Kept in step by the hook above.
    { name: 'title', type: 'text', label: l('Order', 'الطلب'), index: true, admin: { readOnly: true, condition: () => false } },
    { name: 'number', type: 'number', label: l('Order number', 'رقم الطلب'), unique: true, index: true, admin: { readOnly: true, position: 'sidebar' } },
    {
      name: 'status',
      type: 'select',
      label: l('Status', 'الحالة'),
      required: true,
      defaultValue: 'processing',
      index: true,
      options: orderStatuses.map((s) => ({ ...s })),
      admin: { position: 'sidebar', components: { Cell: '/components/admin/OrderCells#StatusCell' } },
    },
    {
      name: 'locale',
      type: 'select',
      label: l('Customer’s language', 'لغة العميل'),
      defaultValue: 'en',
      options: [
        { label: 'English', value: 'en' },
        { label: 'العربية', value: 'ar' },
      ],
      admin: { position: 'sidebar', description: l('Emails go out in this language.', 'تُرسل الرسائل بهذه اللغة.') },
    },
    { name: 'note', type: 'textarea', label: l('Staff note', 'ملاحظة داخلية'), admin: { position: 'sidebar', description: l('Only the team sees this.', 'يراها الفريق فقط.') } },
    {
      type: 'row',
      fields: [
        {
          name: 'customer',
          type: 'group',
          label: l('Customer', 'العميل'),
          admin: { width: '50%' },
          fields: [
            { name: 'name', type: 'text', label: l('Name', 'الاسم'), required: true },
            { name: 'phone', type: 'text', label: l('Phone (WhatsApp)', 'الهاتف (واتساب)'), required: true },
            { name: 'email', type: 'email', label: l('Email', 'البريد الإلكتروني') },
          ],
        },
        {
          name: 'shipping',
          type: 'group',
          label: l('Delivery', 'التوصيل'),
          admin: { width: '50%' },
          fields: [
            {
              name: 'method',
              type: 'select',
              label: l('Method', 'الطريقة'),
              required: true,
              defaultValue: 'amman',
              options: [
                { value: 'amman', label: l('Amman', 'داخل عمّان') },
                { value: 'jordan', label: l('Other cities in Jordan', 'مدن أخرى في الأردن') },
                { value: 'intl', label: l('International (DHL Express)', 'دولي (DHL Express)') },
              ],
            },
            { name: 'country', type: 'text', label: l('Country', 'الدولة'), defaultValue: 'Jordan' },
            { name: 'city', type: 'text', label: l('City', 'المدينة') },
            { name: 'address', type: 'textarea', label: l('Address', 'العنوان') },
          ],
        },
      ],
    },
    {
      name: 'items',
      type: 'array',
      label: l('Items', 'القطع'),
      labels: { singular: l('Item', 'قطعة'), plural: l('Items', 'القطع') },
      minRows: 1,
      admin: { initCollapsed: false, components: { RowLabel: '/components/admin/OrderActions#ItemRowLabel' } },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'product', type: 'relationship', relationTo: 'products', label: l('Product', 'المنتج'), admin: { width: '40%' } },
            { name: 'name', type: 'text', label: l('Name on the order', 'الاسم في الطلب'), required: true, admin: { width: '30%' } },
            { name: 'quantity', type: 'number', label: l('Qty', 'الكمية'), required: true, min: 1, defaultValue: 1, admin: { width: '10%' } },
            { name: 'unitPrice', type: 'number', label: l('Price (JOD)', 'السعر (د.أ)'), required: true, min: 0, admin: { width: '10%' } },
            { name: 'lineTotal', type: 'number', label: l('Total', 'المجموع'), admin: { width: '10%', readOnly: true } },
          ],
        },
        {
          name: 'details',
          type: 'array',
          label: l('Personalization', 'التخصيص'),
          labels: { singular: l('Detail', 'تفصيل'), plural: l('Details', 'تفاصيل') },
          admin: { description: l('Name, style, finish, chain, stone and gift options, as the customer chose them.', 'الاسم والخط واللون والسلسلة والحجر وخيارات الهدية كما اختارها العميل.') },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'label', type: 'text', label: l('What', 'البند'), admin: { width: '35%' } },
                { name: 'value', type: 'text', label: l('Choice', 'الاختيار'), required: true, admin: { width: '65%' } },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'subtotal', type: 'number', label: l('Subtotal (JOD)', 'المجموع الفرعي (د.أ)'), admin: { readOnly: true, width: '33%' } },
        { name: 'deliveryFee', type: 'number', label: l('Delivery (JOD)', 'التوصيل (د.أ)'), min: 0, defaultValue: 0, admin: { width: '33%' } },
        {
          name: 'total',
          type: 'number',
          label: l('Total (JOD)', 'الإجمالي (د.أ)'),
          admin: { readOnly: true, width: '33%', components: { Cell: '/components/admin/OrderCells#TotalCell' } },
        },
      ],
    },
    {
      name: 'payment',
      type: 'group',
      label: l('Payment', 'الدفع'),
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'method', type: 'select', label: l('Method', 'الطريقة'), required: true, defaultValue: 'cash', options: paymentMethods.map((m) => ({ ...m })), admin: { width: '50%' } },
            { name: 'paidAt', type: 'date', label: l('Paid on', 'تاريخ الدفع'), admin: { width: '50%', date: { pickerAppearance: 'dayAndTime' } } },
          ],
        },
        // Filled in by the HyperPay integration; read-only so the record of a payment can't be edited.
        {
          type: 'collapsible',
          label: 'HyperPay',
          admin: { initCollapsed: true, condition: (_, siblingData) => siblingData?.method === 'card_online' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'checkoutId', type: 'text', label: l('Checkout ID', 'معرّف عملية الدفع'), index: true, admin: { readOnly: true, width: '50%' } },
                { name: 'transactionId', type: 'text', label: l('Transaction ID', 'رقم المعاملة'), admin: { readOnly: true, width: '50%' } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'resultCode', type: 'text', label: l('Result code', 'رمز النتيجة'), admin: { readOnly: true, width: '33%' } },
                { name: 'resultDescription', type: 'text', label: l('Result', 'النتيجة'), admin: { readOnly: true, width: '67%' } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'cardBrand', type: 'text', label: l('Card', 'البطاقة'), admin: { readOnly: true, width: '50%' } },
                { name: 'cardLast4', type: 'text', label: l('Last 4 digits', 'آخر 4 أرقام'), admin: { readOnly: true, width: '50%' } },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'attribution',
      type: 'group',
      label: l('Origin', 'مصدر الطلب'),
      admin: { description: l('Where the customer came from on the visit they ordered in.', 'من أين جاء العميل في الزيارة التي طلب فيها.') },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'type',
              type: 'select',
              label: l('Type', 'النوع'),
              defaultValue: 'admin',
              options: [
                { value: 'direct', label: l('Direct', 'مباشر') },
                { value: 'organic', label: l('Search (organic)', 'بحث') },
                { value: 'referral', label: l('Referral', 'إحالة') },
                { value: 'utm', label: l('Campaign link (utm)', 'رابط حملة (utm)') },
                { value: 'admin', label: l('Web admin', 'لوحة التحكم') },
              ],
              admin: { readOnly: true, width: '33%' },
            },
            { name: 'source', type: 'text', label: l('Source', 'المصدر'), admin: { readOnly: true, width: '33%' } },
            { name: 'medium', type: 'text', label: l('Medium', 'الوسيط'), admin: { readOnly: true, width: '33%' } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'campaign', type: 'text', label: l('Campaign', 'الحملة'), admin: { readOnly: true, width: '33%' } },
            { name: 'landingPage', type: 'text', label: l('First page', 'أول صفحة'), admin: { readOnly: true, width: '33%' } },
            { name: 'referrer', type: 'text', label: l('Referrer', 'الصفحة المُحيلة'), admin: { readOnly: true, width: '33%' } },
          ],
        },
      ],
    },
    {
      name: 'emails',
      type: 'group',
      admin: { hidden: true },
      fields: [
        { name: 'receivedAt', type: 'date' },
        { name: 'completedAt', type: 'date' },
      ],
    },
    // List-only columns.
    { name: 'origin', type: 'ui', label: l('Origin', 'المصدر'), admin: { components: { Cell: '/components/admin/OrderCells#OriginCell' } } },
    { name: 'actions', type: 'ui', label: l('Actions', 'إجراءات'), admin: { components: { Cell: '/components/admin/OrderActions#OrderActions' } } },
  ],
}

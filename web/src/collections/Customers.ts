import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook, CollectionConfig, Endpoint, PayloadRequest, Where } from 'payload'

import { admins, may } from '@/access'
import { l } from '@/fields/label'
import { later } from '@/hooks/revalidate'
import { audit, whoAndWhere } from '@/lib/audit'
import { securityAlert } from '@/lib/loginAlerts'
import { placeOf } from '@/lib/place'
import { normalEmail, normalPhone, SEGMENT_LABELS, SEGMENTS } from '@/lib/customerStats'
import { forgetCustomer } from '@/lib/customers'
import type { Customer, User } from '@/payload-types'

const isAdmin = (req: PayloadRequest) => (req.user as User | null)?.role === 'admin'
const actor = (req: PayloadRequest) => (req.user as User | null)?.name || req.user?.email || 'Someone'

// Matching keys follow what was typed, so staff can correct an email or phone and later orders still find the customer.
const keys: CollectionBeforeChangeHook<Customer> = ({ data, originalDoc }) => {
  if (data.email !== undefined) data.email = normalEmail(data.email) || null
  const phone = data.phone !== undefined ? data.phone : originalDoc?.phone
  data.phoneKey = normalPhone(phone) || null
  return data
}

// Their browsing rows go with them. Orders stay (the shop's records) and simply lose the link.
const dropActivity: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.db.deleteMany({ collection: 'customer-activity', where: { customer: { equals: id } }, req })
}

const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : String(v)
  // Spreadsheet apps run cells that start with these as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : '')

/**
 * GET /api/customers/export: the customer list as CSV (UTF-8 with BOM, so Excel shows Arabic
 * names), with the list view's current filter and search. Admins only, and every export is written
 * to the audit log with who, when, how many and which filter.
 */
const exportEndpoint: Endpoint = {
  path: '/export',
  method: 'get',
  handler: async (req) => {
    if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 })
    const q = (req.query ?? {}) as { where?: Where; sort?: unknown; search?: unknown }
    const search = typeof q.search === 'string' ? q.search.trim().slice(0, 100) : ''
    const filters: Where[] = []
    if (q.where && typeof q.where === 'object') filters.push(q.where)
    if (search) filters.push({ or: ['name', 'email', 'phone'].map((f) => ({ [f]: { like: search } })) })
    const found = await req.payload.find({
      collection: 'customers',
      where: filters.length ? { and: filters } : undefined,
      sort: typeof q.sort === 'string' ? q.sort : '-totalSpent',
      depth: 1,
      locale: 'en',
      limit: 0,
      pagination: false,
      overrideAccess: false,
      user: req.user,
      req,
    })
    const head = ['Name', 'Email', 'Phone', 'Country', 'Purchases', 'Completed orders', 'Total spent (JOD)', 'Average order (JOD)', 'First purchase', 'Last purchase', 'Segment', 'Favourite category', 'Browsing insights consent', 'Customer since']
    const rows = found.docs.map((c) => [
      c.name,
      c.email,
      c.phone,
      c.country,
      c.orderCount ?? 0,
      c.verifiedOrders ?? 0,
      c.totalSpent ?? 0,
      c.averageOrder ?? 0,
      day(c.firstOrderAt),
      day(c.lastOrderAt),
      SEGMENT_LABELS[c.segment ?? 'none'].en,
      typeof c.favoriteCategory === 'object' ? c.favoriteCategory?.name : '',
      c.tracking?.consent ? `yes, since ${day(c.tracking.consentAt)}` : 'no',
      day(c.createdAt),
    ])
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
    await audit(req.payload, {
      action: 'customers.export',
      summary: `${actor(req)} exported ${found.docs.length} customers${filters.length ? ' (filtered)' : ''}`,
      target: 'Customers',
      detail: { count: found.docs.length, ...(q.where ? { where: q.where as Record<string, unknown> } : {}), ...(search ? { search } : {}) },
      ...whoAndWhere(req),
    })
    // Every export emails the team; a whole-list or very large one is flagged as unusual.
    const unusual = !filters.length || found.docs.length >= 200
    later(() =>
      securityAlert(req.payload, 'export', placeOf(req.headers), req.user?.email ?? null, [
        `Customers in the file: ${found.docs.length}${filters.length ? ' (filtered list)' : ' (the whole list)'}`,
        ...(unusual ? ['Unusual: this is the whole customer list or a very large part of it.'] : []),
      ]),
    )
    const stamp = new Date().toISOString().slice(0, 10)
    return new Response(`﻿${csv}\r\n`, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="blingiton-customers-${stamp}.csv"`, 'Cache-Control': 'no-store' },
    })
  },
}

/** POST /api/customers/:id/forget: stop browsing insights for this customer and erase what was recorded. Admins only. */
const forgetEndpoint: Endpoint = {
  path: '/:id/forget',
  method: 'post',
  handler: async (req) => {
    if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 })
    const id = Number(req.routeParams?.id)
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'invalid' }, { status: 400 })
    await forgetCustomer(req.payload, id, req)
    await audit(req.payload, {
      action: 'customers.forget',
      summary: `${actor(req)} stopped browsing insights for customer #${id} and erased their history`,
      target: `Customer #${id}`,
      detail: { id },
      ...whoAndWhere(req),
    })
    return Response.json({ ok: true })
  },
}

const readOnly = { readOnly: true }
const systemOnly = { create: () => false, update: () => false }

// One row per person who has ordered, created and kept up to date from their orders
// (src/lib/customers.ts). Staff with the customers area can read and annotate; only admins export or delete.
export const Customers: CollectionConfig = {
  slug: 'customers',
  labels: { singular: l('Customer', 'عميل'), plural: l('Customers', 'العملاء') },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'country', 'orderCount', 'totalSpent', 'lastOrderAt', 'segment', 'favoriteCategory'],
    listSearchableFields: ['name', 'email', 'phone'],
    group: l('Shop', 'المتجر'),
    description: l(
      'Everyone who has ordered, filled in from their orders. Filter by country, segment or spending; open a customer for their orders and insights.',
      'كل من طلب من المتجر، تُملأ بياناتهم من طلباتهم. صفِّ حسب الدولة أو الفئة أو الإنفاق، وافتح العميل لترى طلباته وتحليلاته.',
    ),
    components: {
      beforeListTable: ['/components/admin/CustomerTools#CustomerListTools'],
      views: {
        edit: {
          insights: {
            Component: '/components/admin/CustomerView#CustomerView',
            path: '/insights',
            tab: { label: ({ t }) => (t('general:cancel') === 'Cancel' ? 'Insights' : 'التحليلات'), href: '/insights', order: 150 },
          },
        },
      },
    },
  },
  defaultSort: '-lastOrderAt',
  access: { read: may('customers'), create: admins, update: may('customers'), delete: admins },
  endpoints: [exportEndpoint, forgetEndpoint],
  hooks: { beforeChange: [keys], beforeDelete: [dropActivity] },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', label: l('Name', 'الاسم'), required: true, admin: { width: '50%' } },
        { name: 'country', type: 'text', label: l('Country', 'الدولة'), index: true, admin: { width: '50%', description: l('From their latest order.', 'من آخر طلب.') } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'email', type: 'email', label: l('Email', 'البريد الإلكتروني'), index: true, admin: { width: '50%' } },
        { name: 'phone', type: 'text', label: l('Phone (WhatsApp)', 'الهاتف (واتساب)'), admin: { width: '50%' } },
      ],
    },
    // Digits with the country code, for matching orders (lib/customerStats.ts → normalPhone).
    { name: 'phoneKey', type: 'text', index: true, admin: { hidden: true } },
    {
      type: 'collapsible',
      label: l('Purchases', 'المشتريات'),
      admin: { description: l('Counted from their orders; cancelled, refunded, failed and unpaid orders are left out.', 'تُحسب من طلباته؛ لا تُحسب الطلبات الملغاة أو المستردة أو الفاشلة أو غير المدفوعة.') },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'orderCount', type: 'number', label: l('Purchases', 'عدد الطلبات'), index: true, defaultValue: 0, access: systemOnly, admin: { ...readOnly, width: '25%' } },
            { name: 'verifiedOrders', type: 'number', label: l('Completed', 'مكتملة'), defaultValue: 0, access: systemOnly, admin: { ...readOnly, width: '25%' } },
            {
              name: 'totalSpent',
              type: 'number',
              label: l('Total spent (JOD)', 'إجمالي الإنفاق (د.أ)'),
              index: true,
              defaultValue: 0,
              access: systemOnly,
              admin: { ...readOnly, width: '25%', components: { Cell: '/components/admin/OrderCells#TotalCell' } },
            },
            { name: 'averageOrder', type: 'number', label: l('Average order (JOD)', 'متوسط الطلب (د.أ)'), defaultValue: 0, access: systemOnly, admin: { ...readOnly, width: '25%' } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'firstOrderAt', type: 'date', label: l('First purchase', 'أول طلب'), access: systemOnly, admin: { ...readOnly, width: '25%' } },
            { name: 'lastOrderAt', type: 'date', label: l('Last purchase', 'آخر طلب'), index: true, access: systemOnly, admin: { ...readOnly, width: '25%' } },
            { name: 'daysBetween', type: 'number', label: l('Days between purchases', 'أيام بين الطلبات'), access: systemOnly, admin: { ...readOnly, width: '25%' } },
            { name: 'firstVerifiedAt', type: 'date', label: l('First completed order', 'أول طلب مكتمل'), access: systemOnly, admin: { ...readOnly, width: '25%' } },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'segment',
              type: 'select',
              label: l('Segment', 'الفئة'),
              index: true,
              defaultValue: 'none',
              options: SEGMENTS.map((value) => ({ value, label: SEGMENT_LABELS[value] })),
              access: systemOnly,
              admin: { ...readOnly, width: '50%' },
            },
            {
              name: 'favoriteCategory',
              type: 'relationship',
              relationTo: 'categories',
              label: l('Buys most from', 'يشتري غالباً من'),
              index: true,
              access: systemOnly,
              admin: { ...readOnly, width: '50%' },
            },
          ],
        },
      ],
    },
    { name: 'note', type: 'textarea', label: l('Staff note', 'ملاحظة داخلية'), admin: { position: 'sidebar', description: l('Only the team sees this.', 'يراها الفريق فقط.') } },
    {
      name: 'tracking',
      type: 'group',
      label: l('Browsing insights', 'تحليل التصفح'),
      access: { create: () => false, update: () => false },
      admin: {
        position: 'sidebar',
        description: l(
          'Only with the customer’s consent at checkout, and only after a completed order. Withdraw from the Insights tab.',
          'فقط بموافقة العميل عند الطلب، وبعد طلب مكتمل. يمكن إيقافه من تبويب التحليلات.',
        ),
      },
      fields: [
        { name: 'consent', type: 'checkbox', label: l('Agreed', 'وافق'), defaultValue: false, index: true, admin: readOnly },
        { name: 'consentAt', type: 'date', label: l('Agreed on', 'تاريخ الموافقة'), admin: { ...readOnly, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'source', type: 'text', label: l('Where', 'المكان'), admin: readOnly },
        { name: 'version', type: 'text', label: l('Wording version', 'نسخة النص'), admin: readOnly },
        { name: 'withdrawnAt', type: 'date', label: l('Withdrawn on', 'تاريخ السحب'), admin: { ...readOnly, date: { pickerAppearance: 'dayAndTime' } } },
        // Bumped on withdrawal, which retires every device cookie issued before (lib/customerToken.ts).
        { name: 'epoch', type: 'number', defaultValue: 0, admin: { hidden: true } },
      ],
    },
    {
      name: 'orders',
      type: 'join',
      collection: 'orders',
      on: 'customerRecord',
      label: l('Order history', 'سجل الطلبات'),
      defaultSort: '-createdAt',
      defaultLimit: 20,
      admin: { defaultColumns: ['title', 'createdAt', 'status', 'total'], allowCreate: false },
    },
  ],
}

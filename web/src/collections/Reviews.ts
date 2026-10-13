import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionConfig } from 'payload'

import { loggedIn } from '@/access'
import { l } from '@/fields/label'
import { later, refresh } from '@/hooks/revalidate'
import { tags } from '@/lib/tags'
import type { Review } from '@/payload-types'
import { refreshProductScore } from '@/seo/productScore'

const productOf = (r: Pick<Review, 'product'> | undefined) => (r ? (typeof r.product === 'object' ? r.product?.id : r.product) : undefined)

// A review that is added, approved, moved or removed changes the product's stars and SEO score.
const touchProducts = (doc: Review, previous: Review | undefined, payload: Parameters<typeof refreshProductScore>[0]) => {
  const ids = [...new Set([productOf(doc), productOf(previous)].filter((id): id is number => typeof id === 'number'))]
  refresh(tags.products, ...ids.map(tags.product))
  later(() => Promise.all(ids.map((id) => refreshProductScore(payload, id))))
}
const reviewAfterChange: CollectionAfterChangeHook<Review> = ({ doc, previousDoc, req }) => {
  touchProducts(doc, previousDoc, req.payload)
  return doc
}
const reviewAfterDelete: CollectionAfterDeleteHook<Review> = ({ doc, req }) => {
  touchProducts(doc, undefined, req.payload)
  return doc
}

// Only approved reviews are public, and only these feed the star ratings shown in Google.
export const Reviews: CollectionConfig = {
  slug: 'reviews',
  labels: { singular: l('Review', 'تقييم'), plural: l('Reviews', 'التقييمات') },
  admin: {
    useAsTitle: 'author',
    defaultColumns: ['author', 'product', 'rating', 'approved', 'verifiedPurchase', 'date'],
    group: l('Shop', 'المتجر'),
    description: l(
      'Customers review their order from the link in the "on its way" email. New reviews wait here until you tick Approved.',
      'يقيّم الزبائن طلبهم من الرابط في رسالة "طلبك في الطريق". تنتظر التقييمات الجديدة هنا حتى تختار "معتمد".',
    ),
  },
  defaultSort: '-date',
  hooks: { afterChange: [reviewAfterChange], afterDelete: [reviewAfterDelete] },
  access: {
    read: ({ req }) => (req.user ? true : { approved: { equals: true } }),
    create: loggedIn,
    update: loggedIn,
    delete: loggedIn,
  },
  fields: [
    { name: 'product', type: 'relationship', label: l('Product', 'المنتج'), relationTo: 'products', required: true, index: true },
    { name: 'author', type: 'text', label: l('Name', 'الاسم'), required: true },
    {
      name: 'rating',
      type: 'number',
      label: l('Stars (1–5)', 'النجوم (1–5)'),
      required: true,
      min: 1,
      max: 5,
    },
    { name: 'body', type: 'textarea', label: l('Review', 'التقييم') },
    {
      name: 'language',
      type: 'select',
      label: l('Written in', 'اللغة'),
      defaultValue: 'en',
      options: [
        { label: 'English', value: 'en' },
        { label: 'العربية', value: 'ar' },
      ],
    },
    { name: 'date', type: 'date', label: l('Date', 'التاريخ'), required: true, defaultValue: () => new Date().toISOString() },
    { name: 'approved', type: 'checkbox', label: l('Approved', 'معتمد'), defaultValue: false, index: true, admin: { position: 'sidebar' } },
    { name: 'verifiedPurchase', type: 'checkbox', label: l('Verified purchase', 'شراء مؤكد'), admin: { position: 'sidebar' } },
    {
      // Set when the customer reviews from their order email; one review per product per order.
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
      label: l('From order', 'من الطلب'),
      index: true,
      admin: { position: 'sidebar', readOnly: true, condition: (data) => Boolean(data?.order) },
    },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'site',
      options: [
        { label: l('This website', 'هذا الموقع'), value: 'site' },
        { label: l('Old website', 'الموقع القديم'), value: 'woocommerce' },
      ],
      admin: { position: 'sidebar', readOnly: true },
    },
    { name: 'legacyId', type: 'number', index: true, admin: { hidden: true } },
  ],
}

import type { CollectionConfig } from 'payload'

import { may } from '@/access'
import { l } from '@/fields/label'
import { EVENT_TYPES } from '@/lib/events'

// Shop funnel steps from /track (see src/lib/events.ts). Written only by the server, read by the
// admin home's funnel report; hidden from the admin menu because nobody needs to browse raw rows.
export const Events: CollectionConfig = {
  slug: 'events',
  labels: { singular: l('Visit step', 'خطوة زيارة'), plural: l('Visit steps', 'خطوات الزيارات') },
  admin: { hidden: true },
  access: { read: may('orders', 'catalog', 'customers'), create: () => false, update: () => false, delete: () => false },
  indexes: [{ fields: ['createdAt', 'type'] }],
  fields: [
    { name: 'type', type: 'select', required: true, options: EVENT_TYPES.map((v) => ({ label: v, value: v })) },
    // A plain number, not a relationship: steps stay countable after a product is deleted.
    { name: 'product', type: 'number', index: true },
    { name: 'session', type: 'text', required: true, index: true },
    {
      name: 'sourceType',
      type: 'select',
      options: ['direct', 'organic', 'referral', 'utm', 'unknown'].map((v) => ({ label: v, value: v })),
    },
    { name: 'source', type: 'text' },
    { name: 'locale', type: 'select', options: ['en', 'ar'].map((v) => ({ label: v, value: v })) },
    { name: 'path', type: 'text' },
  ],
}

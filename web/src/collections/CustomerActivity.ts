import type { CollectionConfig } from 'payload'

import { loggedIn } from '@/access'
import { l } from '@/fields/label'
import { ACTIVITY_TYPES } from '@/lib/activity'

// What recognised, consenting customers look at (see src/lib/activity.ts for when a row may exist).
// Written only by /activity, read by the customer insights; hidden because nobody browses raw rows.
// Deleted with the customer, when they withdraw, and after RETENTION_DAYS by the `prune-activity` job.
export const CustomerActivity: CollectionConfig = {
  slug: 'customer-activity',
  labels: { singular: l('Customer activity', 'نشاط عميل'), plural: l('Customer activity', 'نشاط العملاء') },
  admin: { hidden: true },
  access: { read: loggedIn, create: () => false, update: () => false, delete: () => false },
  indexes: [{ fields: ['customer', 'createdAt'] }],
  fields: [
    { name: 'customer', type: 'relationship', relationTo: 'customers', required: true, index: true },
    { name: 'type', type: 'select', required: true, options: ACTIVITY_TYPES.map((v) => ({ label: v, value: v })) },
    // A plain number, not a relationship: rows stay readable after a product is deleted.
    { name: 'product', type: 'number', required: true, index: true },
    { name: 'detail', type: 'text' },
    { name: 'seconds', type: 'number' },
    // Random per browser, so "viewed on two devices" can be told apart from "viewed twice".
    { name: 'device', type: 'text' },
  ],
}

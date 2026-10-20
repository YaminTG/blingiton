import type { CollectionConfig } from 'payload'

import { may } from '@/access'
import { l } from '@/fields/label'
import { SIGNAL_KINDS } from '@/lib/healthRules'

// Things that went wrong for a shopper or the server, as they happened: checkout errors and refusals,
// emails that failed, missing pages and photos (src/lib/health.ts). Written only by the server, read
// by the shop-health check; deleted after 30 days. Hidden from the admin menu.
export const HealthSignals: CollectionConfig = {
  slug: 'health-signals',
  labels: { singular: l('Health signal', 'إشارة صحة'), plural: l('Health signals', 'إشارات الصحة') },
  admin: { hidden: true },
  access: { read: may('orders'), create: () => false, update: () => false, delete: () => false },
  indexes: [{ fields: ['createdAt', 'kind'] }],
  fields: [
    { name: 'kind', type: 'select', required: true, options: SIGNAL_KINDS.map((v) => ({ label: v, value: v })) },
    // A short hash of the IP and the day: tells different people apart without keeping the IP.
    { name: 'source', type: 'text' },
    // A plain number, not a relationship: the signal stays after a product is deleted.
    { name: 'product', type: 'number' },
    { name: 'path', type: 'text' },
    { name: 'referrer', type: 'text' },
    { name: 'detail', type: 'text' },
  ],
}

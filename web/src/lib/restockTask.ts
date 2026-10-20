import type { CollectionAfterChangeHook, TaskConfig } from 'payload'

import { later } from '@/hooks/revalidate'
import type { Product } from '@/payload-types'

// The back-in-stock emails' triggers. The work lives in src/lib/restockNotify.ts, loaded only when
// needed: it reads products through src/lib/data.ts, which imports the Payload config, and the config
// imports this file.
const notifier = () => import('./restockNotify')

/**
 * After a product is saved: if anyone is waiting for it, email those whose piece is back. Runs after
 * the response, so saving in the admin never waits for emails.
 */
export const restockAfterChange: CollectionAfterChangeHook<Product> = ({ doc, req, context }) => {
  if (context.importing) return doc
  const payload = req.payload
  later(async () => {
    const waiting = await payload.count({ collection: 'restock-requests', where: { and: [{ product: { equals: doc.id } }, { status: { equals: 'waiting' } }] } })
    if (waiting.totalDocs) await (await notifier()).notifyRestocks(payload, [doc.id])
  })
  return doc
}

/** Hourly safety net: stock changed outside the admin (scripts, imports), plus clean-up. */
export const restockNotifyTask: TaskConfig<'restock-notify'> = {
  slug: 'restock-notify',
  schedule: [{ cron: '25 * * * *', queue: 'default' }],
  handler: async ({ req }) => {
    const { notifyRestocks, pruneRequests } = await notifier()
    await notifyRestocks(req.payload)
    await pruneRequests(req.payload)
    return { output: {} }
  },
}

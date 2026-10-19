// Gives orders from before the pipeline a stage, so the dashboard and stuck alerts see them:
// processing / on hold → "paid" (timed from when the order was placed), completed → "delivered"
// (they went out long ago). Straight to the database, so no customer is emailed. Re-runnable:
// orders that already have a stage are left alone.
//   [DRY_RUN=1] npx payload run scripts/order-stages-backfill.ts < /dev/null

import { getPayload } from 'payload'

import config from '@payload-config'
import { isActive, limitsFrom, stuckAtFor, type Stage } from '@/lib/orderStages'

const payload = await getPayload({ config })
const dry = Boolean(process.env.DRY_RUN)

const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
const limits = limitsFrom(settings.orderFlow?.limits)
const { docs: orders } = await payload.find({
  collection: 'orders',
  where: { stage: { exists: false } },
  select: { number: true, status: true, createdAt: true, shipping: true },
  depth: 0,
  limit: 0,
  pagination: false,
})

let set = 0
for (const o of orders) {
  if (!isActive(o.status)) continue
  const stage: Stage = o.status === 'completed' ? 'delivered' : 'paid'
  const stuckAt = stuckAtFor(stage, o.createdAt, o.shipping?.method, limits)
  console.log(`  #${o.number}: ${o.status} → ${stage}${stuckAt && new Date(stuckAt) < new Date() ? ' (already stuck)' : ''}`)
  set++
  if (dry) continue
  await payload.db.updateOne({
    collection: 'orders',
    id: o.id,
    data: { stage, stageSince: o.createdAt, stuckAt, stageHistory: [{ step: stage, at: o.createdAt }] },
    returning: false,
  })
}

console.log(`${orders.length} orders without a stage: ${set} ${dry ? 'would be given one' : 'given one'}, the rest aren't active.`)
process.exit(0)

// Links every existing order to a customer (by email, else phone) and recounts every customer's
// totals. New orders do this on save; run this once after adding the Customers collection, and
// again any time the totals look off. Re-runnable: orders already linked are left alone.
//   [DRY_RUN=1] npx payload run scripts/customers-backfill.ts < /dev/null

import { createLocalReq, getPayload } from 'payload'

import config from '@payload-config'
import { linkCustomer, refreshCustomers } from '@/lib/customers'

const payload = await getPayload({ config })
const dry = Boolean(process.env.DRY_RUN)
const req = await createLocalReq({}, payload)

const { docs: orders } = await payload.find({
  collection: 'orders',
  select: { number: true, customer: true, shipping: true, customerRecord: true },
  sort: 'createdAt',
  depth: 0,
  limit: 0,
  pagination: false,
})

let linked = 0
let unmatched = 0
for (const o of orders) {
  if (o.customerRecord) continue
  if (dry) {
    linked++
    continue
  }
  const id = await linkCustomer(req, { ...o.customer, country: o.shipping?.country })
  if (!id) {
    unmatched++
    console.log(`  #${o.number}: no email or usable phone, left unlinked`)
    continue
  }
  // Straight to the database: no hooks, so no emails, audit entries or re-pricing.
  await payload.db.updateOne({ collection: 'orders', id: o.id, data: { customerRecord: id }, req })
  linked++
}

const { docs: customers } = await payload.find({ collection: 'customers', select: { name: true }, depth: 0, limit: 0, pagination: false })
if (!dry) await refreshCustomers(payload, customers.map((c) => c.id))

console.log(`${orders.length} orders: ${linked} ${dry ? 'would be linked' : 'linked'}, ${unmatched} without contact details. ${customers.length} customers${dry ? '' : ' recounted'}.`)
process.exit(0)

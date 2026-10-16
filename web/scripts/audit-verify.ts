// Checks the audit log's hash chain (src/lib/audit.ts): reports any entry whose contents changed
// in the database, and any gap where an entry was removed. Run it on the server:
//   npx payload run scripts/audit-verify.ts < /dev/null

import { getPayload } from 'payload'

import config from '@payload-config'
import { entryHash, type AuditEntry } from '@/lib/audit'

const payload = await getPayload({ config })

let prevHash: string | null = null
let checked = 0
const problems: string[] = []

for (let page = 1; ; page++) {
  const { docs, hasNextPage } = await payload.find({ collection: 'audit-log', sort: 'id', limit: 500, page, depth: 0 })
  for (const d of docs) {
    checked++
    const expected = entryHash({
      ...(d as unknown as AuditEntry),
      actor: typeof d.actor === 'object' && d.actor ? d.actor.id : (d.actor ?? null),
      detail: (d.detail as Record<string, unknown> | null) ?? null,
      at: d.at,
      prev: d.prev ?? null,
    })
    if (expected !== d.hash) problems.push(`#${d.id} (${d.at}): contents don’t match its hash, so it was changed after it was written`)
    if (checked > 1 && d.prev !== prevHash) problems.push(`#${d.id} (${d.at}): doesn’t follow the entry before it, so an entry is missing or two were written at once`)
    prevHash = d.hash ?? null
  }
  if (!hasNextPage) break
}

console.log(`${checked} entries checked.`)
if (problems.length) {
  console.log(`${problems.length} problem(s):`)
  for (const p of problems) console.log(`  ${p}`)
  process.exit(1)
}
console.log('The chain is intact.')
process.exit(0)

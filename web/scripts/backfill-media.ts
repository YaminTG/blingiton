/**
 * Fills the duplicate-check fingerprint (sha256) and the low-resolution flag for photos that were
 * uploaded before those fields existed. Safe to re-run.
 *
 *   npx payload run scripts/backfill-media.ts
 */
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import path from 'path'
import { getPayload } from 'payload'
import { fileURLToPath } from 'url'

import { MIN_GOOD_WIDTH } from '../src/collections/Media'
import config from '../src/payload.config'

const mediaDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../media')

const payload = await getPayload({ config })
const { docs } = await payload.find({
  collection: 'media',
  where: { sha256: { exists: false } },
  limit: 0,
  depth: 0,
  select: { filename: true, width: true },
})

let done = 0
let missing = 0
for (const doc of docs) {
  try {
    const bytes = await readFile(path.join(mediaDir, doc.filename as string))
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    // Straight to the database: these are bookkeeping fields, no hooks or versions needed.
    await payload.db.updateOne({
      collection: 'media',
      id: doc.id,
      data: { sha256, lowResolution: typeof doc.width === 'number' && doc.width < MIN_GOOD_WIDTH },
    })
    done++
  } catch {
    missing++
  }
}
const low = await payload.count({ collection: 'media', where: { lowResolution: { equals: true } } })
console.log(`Backfilled ${done} photos (${missing} files not found). Low resolution: ${low.totalDocs}.`)
process.exit(0)

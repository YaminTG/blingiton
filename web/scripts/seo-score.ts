// Recompute the stored SEO score (0–100) of every product, e.g. after changing src/seo/score.ts.
// Writes only the score column, with no hooks, so nothing else on the product changes.
//   [FORCE=1] npx payload run scripts/seo-score.ts < /dev/null   (FORCE rewrites unchanged scores too)

import { getPayload } from 'payload'

import config from '@payload-config'
import { approvedReviewCounts, storeScores } from '@/seo/productScore'
import { scoreProduct } from '@/seo/score'

const payload = await getPayload({ config })

const { docs } = await payload.find({ collection: 'products', locale: 'all', depth: 1, draft: true, limit: 0, pagination: false })
const reviews = await approvedReviewCounts(payload)
const scores: number[] = []
const changed = new Map<number, number>()
for (const doc of docs) {
  const { score } = scoreProduct(doc, reviews.get(doc.id) ?? 0)
  scores.push(score)
  if (doc.seoScore !== score || process.env.FORCE) changed.set(doc.id, score)
}
await storeScores(payload, changed)

const average = Math.round(scores.reduce((a, b) => a + b, 0) / (scores.length || 1))
console.log(`${docs.length} products, ${changed.size} updated, average score ${average}`)
for (const [label, test] of [['90+', (s: number) => s >= 90], ['70–89', (s: number) => s >= 70 && s < 90], ['<70', (s: number) => s < 70]] as const) {
  console.log(`  ${label}: ${scores.filter(test).length}`)
}
process.exit(0)

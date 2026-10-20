import { getPayload } from 'payload'

import config from '../src/payload.config'
import { alertSubject, runHealthCheck } from '../src/lib/health'
import { planAlerts, type Deep } from '../src/lib/healthRules'
import { problemText } from '../src/lib/healthText'

/**
 * Runs the shop-health check by hand (src/lib/health.ts), crawl included, and prints what it found.
 * Never emails: it shows the alert email's subject that the scheduled job would send instead.
 *   npx payload run scripts/health-check.ts < /dev/null
 * The crawl opens the site at NEXT_PUBLIC_SERVER_URL, so `npm run dev` must be running.
 */
const payload = await getPayload({ config })
const problems = await runHealthCheck(payload, { deep: true, alert: false })
const state = await payload.findGlobal({ slug: 'health-state', depth: 0 })
const deep = state.deep as Deep | null

console.log(`\nCrawl: ${deep?.checkedPages ?? 0} pages, ${deep?.checkedImages ?? 0} photos, rates ${deep?.rates ?? '–'}`)
for (const p of deep?.pages ?? []) console.log(`  page ${p.status} ${p.path} (${p.kind})`)
for (const i of deep?.images ?? []) console.log(`  photo ${i.status} ${i.url}`)

console.log(`\n${problems.length} problem(s):`)
for (const p of problems) {
  const [title, todo] = problemText(p, 'en')
  console.log(`  [${p.tier}] ${title}${p.atRisk ? ` · ~${p.atRisk} JOD/day` : ''}\n      ${todo}`)
}
const plan = planAlerts(problems, null, new Date(), (p) => problemText(p, 'en')[0])
if (plan.now.length || plan.digest.length) console.log(`\nA first scheduled run would email: “${alertSubject(plan)}”`)
process.exit(0)

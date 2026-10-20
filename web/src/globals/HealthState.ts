import type { GlobalConfig } from 'payload'

import { can } from '@/access'
import { l } from '@/fields/label'
import { runHealthCheck } from '@/lib/health'

// What the shop-health check (src/lib/health.ts) remembers between runs: when it last ran, the
// problems it found (for the admin home), the hourly crawl's results and which problems the team
// has been emailed about. Written only by the server; nobody can edit it through the admin or the API.
export const HealthState: GlobalConfig = {
  slug: 'health-state',
  label: l('Shop health state', 'حالة صحة المتجر'),
  admin: { hidden: true },
  access: { read: ({ req }) => can(req.user, 'orders'), update: () => false },
  endpoints: [
    // POST /api/globals/health-state/check (the shop-health page's "Check now" button): runs every
    // check, the page crawl included, without sending alerts.
    {
      path: '/check',
      method: 'post',
      handler: async (req) => {
        if (!can(req.user, 'orders')) return Response.json({ error: 'forbidden' }, { status: 403 })
        await runHealthCheck(req.payload, { deep: true, alert: false })
        return new Response(null, { status: 303, headers: { Location: `${req.payload.config.routes.admin}/shop-health` } })
      },
    },
  ],
  fields: [
    { name: 'lastRunAt', type: 'date' },
    { name: 'lastDeepAt', type: 'date' },
    // The problems found on the last run (healthRules.ts `Problem[]`), for the admin home.
    { name: 'problems', type: 'json' },
    // The hourly crawl's results (`Deep`).
    { name: 'deep', type: 'json' },
    // Which problems were emailed and when (`AlertBook`).
    { name: 'alerts', type: 'json' },
  ],
}

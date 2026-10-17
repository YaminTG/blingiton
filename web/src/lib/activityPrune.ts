import type { TaskConfig } from 'payload'

import { RETENTION_DAYS } from './activity'

/**
 * Nightly: deletes customer browsing rows older than RETENTION_DAYS, so insights rest on recent
 * behaviour and nothing personal is kept longer than it's useful. Runs through the Payload queue
 * like every other job (JOBS_AUTORUN on a server, or a scheduler calling
 * /api/payload-jobs/handle-schedules and /api/payload-jobs/run).
 */
export const pruneActivityTask: TaskConfig<'prune-activity'> = {
  slug: 'prune-activity',
  schedule: [{ cron: '20 3 * * *', queue: 'default' }],
  handler: async ({ req }) => {
    const before = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString()
    await req.payload.db.deleteMany({ collection: 'customer-activity', where: { createdAt: { less_than: before } }, req })
    return { output: {} }
  },
}

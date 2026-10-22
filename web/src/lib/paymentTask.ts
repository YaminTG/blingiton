import type { TaskConfig } from 'payload'

// The work lives in src/lib/payments.ts, loaded only when the job runs: it reaches src/lib/data.ts,
// which imports the Payload config, and the config imports this file.

/** Every 5 minutes: settle online payments the customer didn't come back from, and cancel unpaid orders. */
export const paymentCheckTask: TaskConfig<'payment-check'> = {
  slug: 'payment-check',
  schedule: [{ cron: '*/5 * * * *', queue: 'default' }],
  handler: async ({ req }) => {
    const { checkPayments } = await import('./payments')
    return { output: await checkPayments(req.payload) }
  },
}

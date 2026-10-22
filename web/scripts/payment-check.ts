import { getPayload } from 'payload'

import config from '../src/payload.config'
import { checkPayments } from '../src/lib/payments'

/**
 * Runs the `payment-check` job by hand (src/lib/payments.ts): asks HyperPay about every order
 * waiting for an online payment, marks the paid ones paid (which sends their confirmation emails)
 * and cancels those left unpaid for an hour.
 *   npx payload run scripts/payment-check.ts < /dev/null
 */
const payload = await getPayload({ config })
console.log(await checkPayments(payload))
process.exit(0)

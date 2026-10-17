// The "remember this device" cookie a customer gets at checkout when they opt in
// (see lib/activity.ts). It names the customer, a random device id and the customer's tracking
// epoch, signed with a key derived from PAYLOAD_SECRET so it can't be forged or pointed at someone
// else. Withdrawing consent bumps the epoch, which retires every device's cookie at once.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

export type DeviceToken = { customer: number; device: string; epoch: number }

const key = () => createHmac('sha256', process.env.PAYLOAD_SECRET || '').update('customer-device-v1').digest()
const sign = (body: string) => createHmac('sha256', key()).update(body).digest('base64url').slice(0, 32)

export const newDeviceId = () => randomBytes(9).toString('base64url')

export function deviceToken(t: DeviceToken) {
  const body = `${t.customer}.${t.device}.${t.epoch}`
  return `${body}.${sign(body)}`
}

export function readDeviceToken(value: string | null | undefined): DeviceToken | null {
  const m = /^(\d{1,12})\.([A-Za-z0-9_-]{8,20})\.(\d{1,6})\.([A-Za-z0-9_-]{32})$/.exec(value ?? '')
  if (!m) return null
  const a = Buffer.from(sign(`${m[1]}.${m[2]}.${m[3]}`))
  const b = Buffer.from(m[4])
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return { customer: Number(m[1]), device: m[2], epoch: Number(m[3]) }
}

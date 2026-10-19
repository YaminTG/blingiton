import type { GlobalAfterChangeHook, Payload, TaskConfig } from 'payload'

import type { Order, SiteSetting } from '@/payload-types'

import { duration, limitsFrom, orderStages, stuckAtFor, type Stage } from './orderStages'
import { serverUrl } from './site'

const esc = (s: string | null | undefined) => (s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

export type StuckOrder = Pick<Order, 'id' | 'number' | 'title' | 'stage' | 'status' | 'stageSince' | 'stuckAt' | 'stuckAlertedAt'>

/** Orders that have sat in their stage past the shop's limit, most overdue first. */
export async function findStuck(payload: Payload, now = new Date()) {
  const { docs } = await payload.find({
    collection: 'orders',
    where: { stuckAt: { less_than_equal: now.toISOString() } },
    sort: 'stuckAt',
    limit: 0,
    pagination: false,
    depth: 0,
    select: { number: true, title: true, stage: true, status: true, stageSince: true, stuckAt: true, stuckAlertedAt: true },
  })
  return docs as StuckOrder[]
}

/** Addresses for the alert: Site settings → Orders & alerts, else the shop email. */
export function alertRecipients(settings: Pick<SiteSetting, 'email' | 'orderFlow'>) {
  const list = (settings.orderFlow?.alertEmails ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s))
  return list.length ? list : settings.email ? [settings.email] : []
}

/**
 * Emails the team about stuck orders: each one when it first gets stuck, then again every
 * "remind again" hours while it stays stuck. One email per run, listing them all.
 */
export async function alertStuckOrders(payload: Payload, now = new Date()) {
  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  const remindMs = Math.max(1, settings.orderFlow?.remindHours ?? 24) * 3600_000
  const due = (await findStuck(payload, now)).filter((o) => !o.stuckAlertedAt || now.getTime() - new Date(o.stuckAlertedAt).getTime() >= remindMs)
  if (!due.length) return 0
  const to = alertRecipients(settings)
  if (!to.length) {
    payload.logger.warn('Stuck orders found, but there is no address to alert (Site settings → Orders & alerts)')
    return 0
  }

  const admin = `${serverUrl}${payload.config.routes.admin}/collections/orders`
  const lines = due.map((o) => {
    const stage = orderStages.find((s) => s.value === o.stage)?.label.en ?? o.stage
    const waiting = duration(now.getTime() - new Date(o.stageSince ?? now).getTime(), 'en')
    const late = duration(now.getTime() - new Date(o.stuckAt!).getTime(), 'en')
    return { text: `#${o.number} · ${stage} for ${waiting} (${late} over)${o.status === 'on-hold' ? ' · on hold' : ''}`, link: `${admin}/${o.id}`, title: o.title ?? `#${o.number}` }
  })
  const subject = due.length === 1 ? `Stuck order: ${lines[0].text}` : `${due.length} orders are stuck`
  const intro = 'These orders have been in the same stage longer than you allowed (Site settings → Orders & alerts). Move them on, or message the customer before they ask.'
  const text = [intro, '', ...lines.map((l) => `${l.text}\n${l.link}`), '', `All stuck orders: ${admin}?where[stuckAt][less_than_equal]=${encodeURIComponent(now.toISOString())}`].join('\n')
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#4e0f2a">
<p>${esc(intro)}</p>
<ul style="padding-left:18px">${lines.map((l) => `<li style="margin:6px 0"><a href="${esc(l.link)}" style="color:#c8336f;font-weight:700">${esc(l.title)}</a><br>${esc(l.text)}</li>`).join('')}</ul>
</div>`

  await payload.sendEmail({ to, subject, text, html })
  const at = now.toISOString()
  // Straight to the database: no hooks, so the order's history and emails are untouched.
  for (const o of due) await payload.db.updateOne({ collection: 'orders', id: o.id, data: { stuckAlertedAt: at }, returning: false })
  return due.length
}

/**
 * Hourly: alert the team about stuck orders. Runs through the Payload queue like every other job
 * (JOBS_AUTORUN on a server, or a scheduler calling /api/payload-jobs/handle-schedules and /run).
 */
export const stuckOrdersTask: TaskConfig<'stuck-orders'> = {
  slug: 'stuck-orders',
  schedule: [{ cron: '5 * * * *', queue: 'default' }],
  handler: async ({ req }) => {
    await alertStuckOrders(req.payload)
    return { output: {} }
  },
}

/** Changing the hours in Site settings re-times every order still in the pipeline. */
export const restampStuck: GlobalAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const limits = limitsFrom((doc as SiteSetting).orderFlow?.limits)
  if (JSON.stringify(limits) === JSON.stringify(limitsFrom((previousDoc as SiteSetting | undefined)?.orderFlow?.limits))) return doc
  const { docs } = await req.payload.find({
    collection: 'orders',
    where: { and: [{ stage: { exists: true } }, { stage: { not_equals: 'delivered' } }] },
    limit: 0,
    pagination: false,
    depth: 0,
    req,
    select: { stage: true, stageSince: true, stuckAt: true, shipping: true },
  })
  for (const o of docs) {
    const stuckAt = stuckAtFor(o.stage as Stage, o.stageSince, o.shipping?.method, limits)
    if (stuckAt !== (o.stuckAt ? new Date(o.stuckAt).toISOString() : null)) await req.payload.db.updateOne({ collection: 'orders', id: o.id, data: { stuckAt }, req, returning: false })
  }
  return doc
}

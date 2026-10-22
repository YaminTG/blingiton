import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload, TaskConfig } from 'payload'

import {
  buildBaseline,
  findProblems,
  planAlerts,
  PURCHASE,
  sortProblems,
  totalAtRisk,
  type AlertBook,
  type AlertPlan,
  type BackupIssue,
  type Deep,
  type HealthInput,
  type OrderLite,
  type Problem,
  type ProductInfo,
  type Signal,
  type SignalKind,
} from './healthRules'
import { formatter, problemText, TIER_LABEL } from './healthText'
import { runDeepCheck } from './healthProbe'
import { alertRecipients as teamRecipients } from './loginAlerts'
import { sendOrderEmails } from './orderEmails'
import { FIRST_ORDER_NUMBER } from './orderOptions'
import { backupChecks } from './securityCheck'
import { isProduction, serverUrl } from './site'
import { alertRecipients as shopRecipients } from './stuckOrders'

/**
 * Shop health: watches the things that lose sales when they break, and tells the team about them
 * by how much they may cost, not by how technical they are. Rules and tiers: src/lib/healthRules.ts.
 *
 * Every 10 minutes the `shop-health` job:
 *   1. re-sends order confirmations that didn't go out (sendOrderEmails is once-only, so this is safe)
 *   2. gathers the facts: the shop's normal from the last 28 days of web orders and funnel visits,
 *      recent orders, what went wrong for shoppers (`health-signals`), catalogue gaps, backups and
 *      failed background jobs
 *   3. once an hour, crawls the site (src/lib/healthProbe.ts)
 *   4. works out the problems and emails the team per `planAlerts`: emergencies at once and every
 *      2 hours, other urgent problems once, the rest in a 09:00 summary; and says when they're fixed
 * The admin's /admin/shop-health page works the problems out live; the admin home reads the last run's.
 * Alerts go to Site settings → Orders & alerts (else the shop email, else the admins).
 */

const HOUR = 3600_000
const DAY = 24 * HOUR
const BASE_DAYS = 28
const VALUE_DAYS = 90
const DEEP_EVERY = 55 * 60_000
const KEEP_SIGNALS_DAYS = 30
// Give the confirmation email this long before treating it as missing.
const CONFIRM_GRACE = 10 * 60_000

const iso = (t: number) => new Date(t).toISOString()
const errorText = (e: unknown) =>
  typeof e === 'string' ? e : e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : e ? JSON.stringify(e).slice(0, 200) : null

type Row = Record<string, unknown>

/** Orders without their confirmation email, past the grace period (new-site orders only). */
async function unconfirmed(payload: Payload, now: number) {
  const { docs } = await payload.find({
    collection: 'orders',
    where: {
      and: [
        { status: { in: ['processing', 'on-hold'] } },
        { number: { greater_than_equal: FIRST_ORDER_NUMBER } },
        { createdAt: { greater_than: iso(now - 7 * DAY) } },
        { createdAt: { less_than: iso(now - CONFIRM_GRACE) } },
        { 'emails.receivedAt': { exists: false } },
      ],
    },
    sort: 'createdAt',
    limit: 50,
    depth: 0,
    select: { number: true, status: true, total: true, payment: true, attribution: true, createdAt: true, customer: true },
  })
  return docs.filter((o) => o.customer?.email)
}

/** The facts the rules need (src/lib/healthRules.ts `HealthInput`), without the crawl. */
export async function gather(payload: Payload, now: Date): Promise<HealthInput> {
  const t = now.getTime()
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const rows = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: Row[] }).rows

  const [orders, signalDocs, published, missing, security, jobs] = await Promise.all([
    payload.find({
      collection: 'orders',
      where: { createdAt: { greater_than_equal: iso(t - VALUE_DAYS * DAY) } },
      limit: 0,
      pagination: false,
      depth: 0,
      select: { number: true, status: true, total: true, payment: true, attribution: true, createdAt: true, items: { product: true, lineTotal: true } },
    }),
    payload.find({ collection: 'health-signals', where: { createdAt: { greater_than_equal: iso(t - 7 * DAY) } }, sort: 'createdAt', limit: 5000, pagination: false, depth: 0 }),
    payload.find({
      collection: 'products',
      where: { _status: { equals: 'published' } },
      locale: 'en',
      limit: 0,
      pagination: false,
      depth: 0,
      select: { name: true, slug: true, price: true, featured: true, availability: true, images: true },
    }),
    unconfirmed(payload, t),
    payload.findGlobal({ slug: 'security-state', depth: 0 }),
    payload.find({
      collection: 'payload-jobs',
      where: { and: [{ hasError: { equals: true } }, { updatedAt: { greater_than_equal: iso(t - DAY) } }] },
      limit: 200,
      pagination: false,
      depth: 0,
      select: { taskSlug: true, error: true },
    }),
  ])

  const lite = (o: (typeof orders.docs)[number]): OrderLite => ({
    id: o.id,
    number: o.number ?? 0,
    status: o.status,
    total: o.total ?? 0,
    payment: o.payment?.method ?? '',
    // Orders typed into the admin by staff (WhatsApp, Instagram) didn't come through the checkout.
    web: o.attribution?.type !== 'admin',
    createdAt: o.createdAt,
    abandoned: o.payment?.method === 'card_online' && !o.payment?.paidAt,
  })
  const all = orders.docs.map(lite)
  const base = all.filter((o) => new Date(o.createdAt).getTime() >= t - BASE_DAYS * DAY)
  const lastWebOrderAt = all.filter((o) => o.web).reduce<string | null>((m, o) => (!m || o.createdAt > m ? o.createdAt : m), null)
  const checkoutSince = iso(Math.max(lastWebOrderAt ? new Date(lastWebOrderAt).getTime() : 0, t - 2 * DAY))

  const [funnel, views, since] = await Promise.all([
    rows(sql`select count(distinct session) filter (where type = 'checkout')::int as checkouts,
      count(distinct session) filter (where type = 'visit')::int as visits
      from events where created_at >= ${iso(t - BASE_DAYS * DAY)}`),
    rows(sql`select product, count(*)::int as n from events where type = 'view' and product is not null and created_at >= ${iso(t - 30 * DAY)} group by product`),
    rows(sql`select count(distinct session)::int as n from events where type = 'checkout' and created_at > ${checkoutSince}`),
  ])
  const baseline = buildBaseline(base, { checkoutSessions: Number(funnel[0]?.checkouts ?? 0), visitSessions: Number(funnel[0]?.visits ?? 0) }, BASE_DAYS)

  // What each piece normally brings in a day: its own sales over 90 days, or for a piece that
  // hasn't sold, its views × how often a view turns into an order × its price.
  const revenue = new Map<number, number>()
  for (const o of orders.docs) {
    if (!PURCHASE.includes(o.status)) continue
    for (const it of o.items ?? []) {
      const id = typeof it.product === 'object' ? it.product?.id : it.product
      if (id) revenue.set(id, (revenue.get(id) ?? 0) + (it.lineTotal ?? 0))
    }
  }
  const viewsOf = new Map(views.map((r) => [Number(r.product), Number(r.n)]))
  const totalViews = [...viewsOf.values()].reduce((s, n) => s + n, 0)
  const recentSales = all.filter((o) => o.web && PURCHASE.includes(o.status) && new Date(o.createdAt).getTime() >= t - 30 * DAY).length
  const viewRate = totalViews >= 200 && recentSales ? Math.min(0.2, Math.max(0.002, recentSales / totalViews)) : 0.01

  const products: Record<number, ProductInfo> = {}
  for (const p of published.docs) {
    const fromSales = (revenue.get(p.id) ?? 0) / VALUE_DAYS
    const fromViews = ((viewsOf.get(p.id) ?? 0) / 30) * viewRate * (p.price ?? 0)
    const first = p.images?.[0]
    products[p.id] = {
      id: p.id,
      name: p.name,
      slug: p.slug ?? null,
      price: p.price ?? 0,
      value: Math.max(fromSales, fromViews),
      featured: p.featured,
      image: typeof first === 'object' ? (first?.id ?? null) : (first ?? null),
      live: true,
    }
  }

  const signals: Signal[] = signalDocs.docs.map((s) => ({
    kind: s.kind as SignalKind,
    at: s.createdAt,
    source: s.source,
    product: s.product,
    path: s.path,
    referrer: s.referrer,
    detail: s.detail,
  }))
  // Names for pieces the signals mention that aren't live any more.
  const unknown = [...new Set(signals.map((s) => s.product).filter((id): id is number => Boolean(id) && !products[id!]))]
  if (unknown.length) {
    const extra = await payload.find({ collection: 'products', where: { id: { in: unknown } }, locale: 'en', limit: unknown.length, pagination: false, depth: 0, select: { name: true, slug: true, price: true } })
    for (const p of extra.docs) products[p.id] = { id: p.id, name: p.name, slug: p.slug ?? null, price: p.price ?? 0, value: (revenue.get(p.id) ?? 0) / VALUE_DAYS }
  }

  // Backups matter once they're expected: in production, or once a backup key is set.
  const backups: BackupIssue[] = []
  if (isProduction || process.env.BACKUP_KEY) {
    for (const c of backupChecks(security).checks) {
      if (c.kind === 'backup-failed' || c.kind === 'restore-failed') backups.push({ kind: c.kind, at: c.at, error: c.error })
      else if (c.kind === 'backup-stale') backups.push({ kind: c.kind, at: c.at })
      else if (c.kind === 'backup-setup' && c.level === 'critical') backups.push({ kind: c.kind, problem: c.problem })
    }
  }

  // Failed background jobs, except backups (covered above).
  const byTask = new Map<string, { n: number; error: string | null }>()
  for (const j of jobs.docs) {
    const task = j.taskSlug ?? 'inline'
    if (task === 'backup' || task === 'restore-test') continue
    const prev = byTask.get(task)
    byTask.set(task, { n: (prev?.n ?? 0) + 1, error: errorText(j.error) ?? prev?.error ?? null })
  }

  return {
    now,
    production: isProduction,
    smtp: Boolean(process.env.SMTP_HOST),
    baseline,
    lastWebOrderAt,
    checkoutsSinceLastOrder: Number(since[0]?.n ?? 0),
    signals,
    recentOrders: all.filter((o) => new Date(o.createdAt).getTime() >= t - 2 * DAY),
    missingConfirmations: missing.map(lite),
    products,
    noPhoto: published.docs.filter((p) => !p.images?.length).map((p) => p.id),
    noPrice: published.docs.filter((p) => !(p.price > 0) && p.availability !== 'sold_out').map((p) => p.id),
    deep: null,
    backups,
    failedJobs: [...byTask.entries()].map(([task, x]) => ({ task, ...x })),
  }
}

/** Re-sends confirmations that didn't go out. A send that fails again records an `email-failed` signal. */
async function retryConfirmations(payload: Payload, now: number) {
  for (const o of (await unconfirmed(payload, now)).slice(0, 10)) {
    await sendOrderEmails(payload, o.id, 'received').catch(() => null)
  }
}

export type HealthStateDoc = { lastRunAt?: string | null; lastDeepAt?: string | null; problems?: unknown; deep?: unknown; alerts?: unknown }

/** For /admin/shop-health: everything worked out live, with the last crawl and the job's heartbeat. */
export async function healthReport(payload: Payload, now = new Date()) {
  const [state, input] = await Promise.all([payload.findGlobal({ slug: 'health-state', depth: 0 }) as Promise<HealthStateDoc>, gather(payload, now)])
  input.deep = (state.deep as Deep | null) ?? null
  input.lastRunAt = state.lastRunAt ?? null
  return { problems: findProblems(input), input, lastRunAt: state.lastRunAt ?? null, lastDeepAt: state.lastDeepAt ?? null }
}

/**
 * One run of the check. `alert` (the scheduled job): retry confirmations and email the team.
 * Without it ("Check now" in the admin) it only refreshes what the admin shows.
 */
export async function runHealthCheck(payload: Payload, opts: { deep?: boolean; alert?: boolean } = {}) {
  const now = new Date()
  const t = now.getTime()
  const state = (await payload.findGlobal({ slug: 'health-state', depth: 0 })) as HealthStateDoc
  if (opts.alert) await retryConfirmations(payload, t)

  const input = await gather(payload, now)
  let deep = (state.deep as Deep | null) ?? null
  let lastDeepAt = state.lastDeepAt ?? null
  if (opts.deep || !lastDeepAt || t - new Date(lastDeepAt).getTime() > DEEP_EVERY) {
    const week = input.signals
    deep = await runDeepCheck(payload, {
      products: Object.values(input.products).filter((p) => p.live),
      prev: deep,
      reportedMissing: week.filter((s) => s.kind === 'not-found' && s.path).map((s) => s.path!),
      reportedImages: week.filter((s) => s.kind === 'image-error' && s.detail).map((s) => ({ src: s.detail!, page: s.path ?? null })),
    })
    lastDeepAt = deep.at
  }
  input.deep = deep
  const problems = findProblems(input)

  let alerts = (state.alerts as AlertBook | null) ?? null
  if (opts.alert) {
    const plan = planAlerts(problems, alerts, now, (p) => problemText(p, 'en')[0])
    try {
      if (plan.now.length || plan.digest.length || plan.fixed.length) await sendAlert(payload, plan)
      alerts = plan.book
    } catch (err) {
      // Not saved, so the next run tries again.
      payload.logger.error({ err }, 'Could not send the shop-health alert')
    }
  }

  await payload.updateGlobal({
    slug: 'health-state',
    data: { lastRunAt: opts.alert ? now.toISOString() : (state.lastRunAt ?? null), lastDeepAt, deep, problems, alerts },
    depth: 0,
  })
  // Old signals have done their job.
  await payload.db.deleteMany({ collection: 'health-signals', where: { createdAt: { less_than: iso(t - KEEP_SIGNALS_DAYS * DAY) } } })
  return problems
}

// --- The email -----------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
const absolute = (link: string | null | undefined) => (link ? (link.startsWith('http') ? link : `${serverUrl}${link}`) : null)
const COLOR = { emergency: '#b42318', urgent: '#c8336f', soon: '#b54708', fyi: '#7a5a66' }

/** The subject line: the worst news first, in sales terms. */
export function alertSubject(plan: Pick<AlertPlan, 'now' | 'digest' | 'fixed'>) {
  const jod = formatter('en').jod
  const risk = (list: Problem[]) => (totalAtRisk(list) ? ` (about ${jod(totalAtRisk(list))} a day at risk)` : '')
  const first = plan.now[0]
  if (first?.tier === 'emergency') return `🚨 Shop emergency: ${problemText(first, 'en')[0]}${risk([first])}`
  if (plan.now.length === 1) return `Shop problem: ${problemText(first, 'en')[0]}${risk(plan.now)}`
  if (plan.now.length) return `${plan.now.length} shop problems need you today${risk(plan.now)}`
  if (plan.digest.length) return `Shop health: ${plan.digest.length} ${plan.digest.length === 1 ? 'thing' : 'things'} to fix${risk(plan.digest)}`
  return plan.fixed.length === 1 ? `Fixed: ${plan.fixed[0].title}` : `${plan.fixed.length} shop problems are fixed`
}

async function sendAlert(payload: Payload, plan: AlertPlan) {
  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  const shop = shopRecipients(settings)
  const to = shop.length ? shop : await teamRecipients(payload)
  if (!to.length) {
    payload.logger.warn('Shop-health problems found, but there is no address to alert (Site settings → Orders & alerts)')
    return
  }
  const jod = formatter('en').jod
  const item = (p: Problem) => {
    const [title, todo] = problemText(p, 'en')
    return { tier: p.tier, title, todo, risk: p.atRisk ? `About ${jod(p.atRisk)} a day at risk` : null, link: absolute(p.link) }
  }
  const sections: [string, ReturnType<typeof item>[]][] = [
    ['Needs you now', plan.now.map(item)],
    [plan.now.length ? 'Also still open' : 'Still open', plan.digest.map(item)],
  ]
  const fixed = plan.fixed.map((x) => x.title)
  const page = `${serverUrl}${payload.config.routes.admin}/shop-health`
  const footer =
    'You hear about each problem once: emergencies again every 2 hours until fixed, everything else in the 9:00 morning summary. The full list, with what is being watched, is on the shop health page.'

  const text = [
    ...sections.flatMap(([heading, list]) =>
      list.length ? [heading.toUpperCase(), '', ...list.flatMap((x) => [`[${TIER_LABEL.en[x.tier]}] ${x.title}`, ...(x.risk ? [x.risk] : []), x.todo, ...(x.link ? [x.link] : []), '']), ''] : [],
    ),
    ...(fixed.length ? ['FIXED', '', ...fixed.map((f) => `✓ ${f}`), ''] : []),
    `Shop health: ${page}`,
    '',
    footer,
  ].join('\n')

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#4e0f2a;max-width:620px">
${sections
  .map(([heading, list]) =>
    list.length
      ? `<h2 style="font-size:16px;margin:18px 0 8px">${esc(heading)}</h2>${list
          .map(
            (x) => `<div style="margin:0 0 12px;padding:12px 14px;border-radius:10px;border:1px solid #f3d9e1;border-left:5px solid ${COLOR[x.tier]}">
  <div style="font-size:11px;font-weight:800;color:${COLOR[x.tier]};text-transform:uppercase">${esc(TIER_LABEL.en[x.tier])}</div>
  <div style="font-weight:800;font-size:15px">${esc(x.title)}</div>
  ${x.risk ? `<div style="font-weight:700;color:${COLOR[x.tier]}">${esc(x.risk)}</div>` : ''}
  <div style="margin-top:4px">${esc(x.todo)}</div>
  ${x.link ? `<div style="margin-top:6px"><a href="${esc(x.link)}" style="color:#c8336f;font-weight:700">Open</a></div>` : ''}
</div>`,
          )
          .join('')}`
      : '',
  )
  .join('')}
${fixed.length ? `<h2 style="font-size:16px;margin:18px 0 8px">Fixed</h2><ul style="padding-left:18px">${fixed.map((f) => `<li>✓ ${esc(f)}</li>`).join('')}</ul>` : ''}
<p style="margin-top:18px"><a href="${esc(page)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#c8336f;color:#fff;font-weight:800;text-decoration:none">Open shop health</a></p>
<p style="color:#7a5a66;font-size:12px">${esc(footer)}</p>
</div>`

  await payload.sendEmail({ to, subject: alertSubject(plan), text, html })
}

/** Every 10 minutes through the Payload queue, like the other jobs (JOBS_AUTORUN or a scheduler). */
export const shopHealthTask: TaskConfig<'shop-health'> = {
  slug: 'shop-health',
  schedule: [{ cron: '*/10 * * * *', queue: 'default' }],
  handler: async ({ req }) => {
    await runHealthCheck(req.payload, { alert: true })
    return { output: {} }
  },
}

/** The admin home's line: the last run's problems, plus "checks aren't running" when it's overdue. */
export async function lastHealth(payload: Payload) {
  const state = (await payload.findGlobal({ slug: 'health-state', depth: 0 })) as HealthStateDoc
  const problems = (Array.isArray(state.problems) ? state.problems : []) as Problem[]
  const lastRunAt = state.lastRunAt ?? null
  const stale = !lastRunAt || Date.now() - new Date(lastRunAt).getTime() > 40 * 60_000
  const list = stale ? [...problems, { key: 'jobs-stopped', kind: 'jobs-stopped', tier: 'urgent', atRisk: null, detail: { at: lastRunAt } } as Problem] : problems
  return { problems: sortProblems(list), lastRunAt }
}

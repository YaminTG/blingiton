// Shop health (src/lib/health.ts): what counts as a problem, roughly what it may cost in sales, and
// when the team gets an email about it. Pure: no database or server imports, so it is unit-tested
// (tests/unit/health.spec.ts) and the admin's pages can use the types.
//
// Every problem gets a tier, worst first:
//   emergency  sales are stopping now (checkout down, the site's main pages down). Emailed at once,
//              then every 2 hours while it lasts.
//   urgent     losing money or customers today. Emailed once, then listed in the morning summary.
//   soon       fix this week. Only in the morning summary (09:00 Amman).
//   fyi        shown in the admin, never emailed.
// Within a tier, problems are sorted by `atRisk`: a rough JOD-per-day figure from the shop's own
// sales, used to put the costliest problem first. It is an estimate for sorting, not accounting.

export const TIERS = ['emergency', 'urgent', 'soon', 'fyi'] as const
export type Tier = (typeof TIERS)[number]
export const tierRank = (t: Tier) => TIERS.indexOf(t)

/** What the site records as it happens (collection `health-signals`). */
export const SIGNAL_KINDS = [
  // /place-order crashed (server side)
  'checkout-error',
  // the browser couldn't reach /place-order at all (network, host or proxy error)
  'checkout-failed',
  // /place-order refused the order: detail 'invalid' (failed the checks) or 'gone' (sold out), with the product
  'checkout-rejected',
  // an email to a customer or the shop failed to send
  'email-failed',
  // someone landed on a page that doesn't exist (path + where they came from)
  'not-found',
  // a photo failed to load in a shopper's browser (detail = the photo's address, path = the page)
  'image-error',
] as const
export type SignalKind = (typeof SIGNAL_KINDS)[number]

export type Signal = {
  kind: SignalKind
  at: string
  /** A short hash of the visitor's IP and the day, to count different people rather than retries. */
  source?: string | null
  product?: number | null
  path?: string | null
  referrer?: string | null
  detail?: string | null
}

export type ProblemKind =
  | 'site-down'
  | 'checkout-down'
  | 'checkout-errors'
  | 'orders-stopped'
  | 'checkout-refused'
  | 'sold-out-in-bags'
  | 'failed-orders'
  | 'payment-pending'
  | 'confirmations-missing'
  | 'email-failing'
  | 'no-smtp'
  | 'page-down'
  | 'image-broken'
  | 'no-photo'
  | 'no-price'
  | 'missing-page'
  | 'backup'
  | 'jobs-failing'
  | 'jobs-stopped'
  | 'rates-fallback'

export type Detail = Record<string, string | number | null | undefined>

export type Problem = {
  /** Stable per problem (e.g. `page:/en/shop`), so the same problem is emailed once, not every run. */
  key: string
  kind: ProblemKind
  tier: Tier
  /** Rough JOD a day this may be costing, from the shop's own numbers. null = not about sales directly. */
  atRisk: number | null
  /** Facts for the wording (src/lib/healthText.ts). */
  detail: Detail
  /** Where to fix it: an admin path (`/admin/...`) or a page on the site. */
  link?: string | null
}

// --- The shop's normal ---------------------------------------------------------------------------

/** Statuses that are a sale (same as the customer totals). */
export const PURCHASE = ['processing', 'on-hold', 'completed']
const FAILED = ['failed', 'cancelled']

export type OrderLite = {
  id: number
  number: number
  status: string
  total: number
  payment: string
  /** Placed through the site's checkout (not typed into the admin by staff). */
  web: boolean
  createdAt: string
}

export type Baseline = {
  days: number
  /** Web orders that are sales, in the window. */
  orders: number
  revenue: number
  /** Average order value (JOD). */
  aov: number
  /** Web revenue per day (JOD). */
  perDay: number
  /** Expected web orders in each hour of the day, Amman time (index 0–23). */
  hourly: number[]
  /** Orders per visit that reached checkout; null until there's enough history. */
  checkoutRate: number | null
  /** Orders per visit; null until there's enough history. */
  visitRate: number | null
  /** Web orders a day that end failed or cancelled. */
  failedPerDay: number
}

// Jordan has stayed on UTC+3 all year since 2022.
const AMMAN_MS = 3 * 3600_000
const HOUR = 3600_000
const DAY = 24 * HOUR

export const ammanHour = (d: Date) => new Date(d.getTime() + AMMAN_MS).getUTCHours()
export const ammanDay = (d: Date) => new Date(d.getTime() + AMMAN_MS).toISOString().slice(0, 10)

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** The shop's normal from its last `days` days of web orders and funnel visits. */
export function buildBaseline(orders: OrderLite[], visits: { checkoutSessions: number; visitSessions: number }, days: number): Baseline {
  const sales = orders.filter((o) => o.web && PURCHASE.includes(o.status))
  const n = sales.length
  const revenue = sales.reduce((s, o) => s + (o.total ?? 0), 0)
  const byHour = new Array(24).fill(0)
  for (const o of sales) byHour[ammanHour(new Date(o.createdAt))]++
  // Mostly the shop's own pattern (quiet nights, busy evenings), with a little spread over every
  // hour so a quiet hour is never "impossible".
  const hourly = byHour.map((c) => (0.7 * c + (0.3 * n) / 24) / days)
  const failed = orders.filter((o) => o.web && FAILED.includes(o.status)).length
  return {
    days,
    orders: n,
    revenue,
    aov: n ? revenue / n : 0,
    perDay: revenue / days,
    hourly,
    checkoutRate: n >= 5 && visits.checkoutSessions >= 20 ? clamp(n / visits.checkoutSessions, 0.05, 0.95) : null,
    visitRate: n >= 5 && visits.visitSessions >= 100 ? clamp(n / visits.visitSessions, 0.001, 0.5) : null,
    failedPerDay: failed / days,
  }
}

/** How many web orders the shop would normally get between two times (at most 7 days apart). */
export function expectedOrders(b: Baseline, from: Date, to: Date) {
  let total = 0
  const end = Math.min(to.getTime(), from.getTime() + 7 * DAY)
  for (let t = from.getTime(); t < end; ) {
    const next = Math.min(end, (Math.floor(t / HOUR) + 1) * HOUR)
    total += (b.hourly[ammanHour(new Date(t))] * (next - t)) / HOUR
    t = next
  }
  return total
}

// Orders arrive roughly at random (Poisson), so with λ orders expected the chance of none is e^-λ.
// λ ≥ 3 → under 5%; λ ≥ 4.6 → under 1%.
const UNLIKELY = 3
const VERY_UNLIKELY = 4.6
// Before the shop has history: about one in four checkouts becomes an order, one visit in a hundred.
const DEFAULT_CHECKOUT_RATE = 0.25
const DEFAULT_VISIT_RATE = 0.01

// --- What the checks found -----------------------------------------------------------------------

export type ProductInfo = {
  id: number
  name: string
  slug: string | null
  price: number
  /** What the piece normally brings in a day (JOD): its own sales, or its views × the shop's rate. */
  value: number
  featured?: boolean | null
  /** The main photo's media id, for the crawl. */
  image?: number | null
  /** Published (the crawl checks only these). */
  live?: boolean
}

/** Which part of the site a checked page is. */
export type PageKind = 'key' | 'checkout' | 'category' | 'product' | 'page' | 'link'
export type PageCheck = { path: string; kind: PageKind; status: number; product?: number | null; from?: string | null }
export type ImageCheck = { url: string; status: number; product: number | null; page?: string | null }

/** The hourly crawl's results (src/lib/healthProbe.ts). Only failures are kept. */
export type Deep = {
  at: string
  pages: PageCheck[]
  images: ImageCheck[]
  checkedPages: number
  checkedImages: number
  /** Paths shoppers reported as missing that still answer 404. */
  missing: string[]
  rates: 'live' | 'fallback' | null
  /** Where the rotating product check continues next time. */
  cursor: number
}

export type BackupIssue = { kind: 'backup-failed' | 'backup-stale' | 'backup-setup' | 'restore-failed'; at?: string | null; error?: string | null; problem?: string | null }

export type HealthInput = {
  now: Date
  production: boolean
  smtp: boolean
  baseline: Baseline
  lastWebOrderAt: string | null
  /** Different visits that opened checkout since the last web order (at most 48 hours back). */
  checkoutsSinceLastOrder: number
  /** The last 7 days. */
  signals: Signal[]
  /** Every order created in the last 48 hours. */
  recentOrders: OrderLite[]
  /** Orders whose confirmation email still hasn't gone out after the automatic retry. */
  missingConfirmations: OrderLite[]
  /** Every product mentioned anywhere in this input. */
  products: Record<number, ProductInfo>
  noPhoto: number[]
  noPrice: number[]
  deep: Deep | null
  backups: BackupIssue[]
  failedJobs: { task: string; n: number; error: string | null }[]
  /** When the scheduled check last ran; only the admin page checks this (undefined = skip). */
  lastRunAt?: string | null
}

// Rough share of all sales that pass through a page, for a page that is down.
const PAGE_SHARE: Record<PageKind, number> = { checkout: 1, key: 0.5, category: 0.15, product: 0, link: 0.05, page: 0.02 }

const distinct = (xs: (string | null | undefined)[]) => new Set(xs.filter(Boolean)).size
const round = (n: number) => Math.round(n * 10) / 10
const atRiskOf = (n: number | null | undefined) => (n && n > 0 ? round(n) : null)
const productLink = (id: number | null | undefined) => (id ? `/admin/collections/products/${id}` : null)
const after = (s: Signal, since: number) => new Date(s.at).getTime() > since

/** Everything wrong right now, worst first. */
export function findProblems(i: HealthInput): Problem[] {
  const out: Problem[] = []
  const now = i.now.getTime()
  const b = i.baseline
  const day = now - DAY
  const week = now - 7 * DAY
  const aov = b.aov || null
  const product = (id: number | null | undefined) => (id ? i.products[id] : undefined)

  // --- The whole site: when most pages fail, it's one problem, not one per page.
  const failedPages = i.deep?.pages ?? []
  const siteDown = failedPages.length >= 5 && failedPages.length >= (i.deep?.checkedPages ?? 0) * 0.5
  if (siteDown) {
    out.push({
      key: 'site-down',
      kind: 'site-down',
      tier: 'emergency',
      atRisk: atRiskOf(b.perDay),
      detail: { pages: failedPages.length, checked: i.deep!.checkedPages, status: failedPages[0].status, at: i.deep!.at },
      link: '/',
    })
  }

  // --- Checkout
  const since = Math.max(i.lastWebOrderAt ? new Date(i.lastWebOrderAt).getTime() : 0, now - 2 * DAY)
  const crashes = i.signals.filter((s) => (s.kind === 'checkout-error' || s.kind === 'checkout-failed') && after(s, since))
  const crashers = distinct(crashes.map((s) => s.source ?? s.at))
  const lambda = i.checkoutsSinceLastOrder * (b.checkoutRate ?? DEFAULT_CHECKOUT_RATE)
  let checkoutDown = false
  // Two different people hit an error since the last order, or so many checkouts without an order
  // that it's very unlikely to be chance, or one error and a drought that's already unusual.
  if (!siteDown && (crashers >= 2 || lambda >= UNLIKELY || (crashers === 1 && lambda >= 1.5))) {
    checkoutDown = true
    out.push({
      key: 'checkout-down',
      kind: 'checkout-down',
      tier: crashers >= 2 || lambda >= VERY_UNLIKELY ? 'emergency' : 'urgent',
      atRisk: atRiskOf(b.perDay),
      detail: { checkouts: i.checkoutsSinceLastOrder, errors: crashes.length, lastOrder: i.lastWebOrderAt, error: crashes.at(-1)?.detail ?? null },
      link: '/en/checkout',
    })
  }
  const dayCrashes = i.signals.filter((s) => (s.kind === 'checkout-error' || s.kind === 'checkout-failed') && after(s, day))
  if (!checkoutDown && !siteDown && dayCrashes.length) {
    out.push({
      key: 'checkout-errors',
      kind: 'checkout-errors',
      tier: dayCrashes.length >= 3 ? 'urgent' : 'soon',
      atRisk: atRiskOf(aov ? dayCrashes.length * aov : null),
      detail: { n: dayCrashes.length, error: dayCrashes.at(-1)?.detail ?? null },
    })
  }

  // --- Orders stopped coming (only once the shop has a normal to compare with)
  if (!checkoutDown && !siteDown && b.orders >= 10) {
    const from = new Date(i.lastWebOrderAt ? Math.max(new Date(i.lastWebOrderAt).getTime(), now - 7 * DAY) : now - 7 * DAY)
    const expected = expectedOrders(b, from, i.now)
    if (expected >= UNLIKELY) {
      out.push({
        key: 'orders-stopped',
        kind: 'orders-stopped',
        tier: expected >= VERY_UNLIKELY ? 'urgent' : 'soon',
        atRisk: atRiskOf(b.perDay),
        detail: { hours: Math.round((now - from.getTime()) / HOUR), expected: Math.round(expected), checkouts: i.checkoutsSinceLastOrder, lastOrder: i.lastWebOrderAt },
        link: '/admin/collections/orders',
      })
    }
  }

  // --- Checkouts the server refused
  const dayOrders = i.recentOrders.filter((o) => o.web && new Date(o.createdAt).getTime() > day)
  const refused = i.signals.filter((s) => s.kind === 'checkout-rejected' && s.detail === 'invalid' && after(s, day))
  const refusedBy = distinct(refused.map((s) => s.source ?? s.at))
  if (refusedBy >= 2) {
    const share = refusedBy / (refusedBy + dayOrders.length)
    out.push({
      key: 'checkout-refused',
      kind: 'checkout-refused',
      tier: refusedBy >= 3 && share >= 0.3 ? 'urgent' : 'soon',
      atRisk: atRiskOf(aov ? refusedBy * aov : null),
      detail: { people: refusedBy, orders: dayOrders.length },
    })
  }

  // --- Sold out while people still have it in their bag
  const gone = new Map<number, Signal[]>()
  for (const s of i.signals) if (s.kind === 'checkout-rejected' && s.detail === 'gone' && s.product && after(s, week)) gone.set(s.product, [...(gone.get(s.product) ?? []), s])
  for (const [id, list] of gone) {
    const people = distinct(list.map((s) => s.source ?? s.at))
    if (people < 2) continue
    const p = product(id)
    out.push({
      key: `sold-out:${id}`,
      kind: 'sold-out-in-bags',
      tier: 'soon',
      atRisk: atRiskOf(p ? (people / 7) * p.price : null),
      detail: { product: p?.name ?? `#${id}`, people },
      link: productLink(id),
    })
  }

  // --- Failed and cancelled orders
  const failed = dayOrders.filter((o) => FAILED.includes(o.status))
  if (failed.length >= 3 && failed.length >= 3 * (b.failedPerDay + 0.5)) {
    out.push({
      key: 'failed-orders',
      kind: 'failed-orders',
      tier: 'urgent',
      atRisk: atRiskOf(failed.reduce((s, o) => s + o.total, 0)),
      detail: { n: failed.length, usual: round(b.failedPerDay) },
      link: '/admin/collections/orders?where[status][in]=failed,cancelled&sort=-createdAt',
    })
  }

  // --- Online card payments that never finished (HyperPay)
  const pending = i.recentOrders.filter((o) => o.payment === 'card_online' && o.status === 'pending' && now - new Date(o.createdAt).getTime() > 30 * 60_000)
  if (pending.length) {
    out.push({
      key: 'payment-pending',
      kind: 'payment-pending',
      tier: pending.length >= 2 ? 'urgent' : 'soon',
      atRisk: atRiskOf(pending.reduce((s, o) => s + o.total, 0)),
      detail: { n: pending.length, numbers: pending.slice(0, 5).map((o) => `#${o.number}`).join(', ') },
      link: '/admin/collections/orders?where[status][equals]=pending',
    })
  }

  // --- Emails
  const mailErrors = i.signals.filter((s) => s.kind === 'email-failed' && after(s, day))
  if (i.production && !i.smtp) {
    out.push({ key: 'no-smtp', kind: 'no-smtp', tier: 'urgent', atRisk: null, detail: {} })
  }
  if (i.missingConfirmations.length) {
    const worth = i.missingConfirmations.reduce((s, o) => s + o.total, 0)
    out.push({
      key: 'confirmations-missing',
      kind: 'confirmations-missing',
      tier: 'urgent',
      // A customer with no confirmation is more likely to cancel or not answer the delivery call.
      atRisk: atRiskOf(worth * 0.25),
      detail: { n: i.missingConfirmations.length, worth, numbers: i.missingConfirmations.slice(0, 5).map((o) => `#${o.number}`).join(', '), error: mailErrors.at(-1)?.detail ?? null },
      link: '/admin/collections/orders',
    })
  } else if (mailErrors.length) {
    out.push({ key: 'email-failing', kind: 'email-failing', tier: 'soon', atRisk: null, detail: { n: mailErrors.length, error: mailErrors.at(-1)?.detail ?? null } })
  }

  // --- Pages that don't open
  if (!siteDown) {
    for (const pg of i.deep?.pages ?? []) {
      const p = product(pg.product)
      let tier: Tier
      let atRisk: number | null
      if (pg.kind === 'product') {
        tier = p && (p.value >= 0.5 || p.featured) ? 'urgent' : 'soon'
        atRisk = atRiskOf(p?.value)
      } else {
        tier = pg.kind === 'checkout' || pg.kind === 'key' ? 'emergency' : pg.kind === 'category' ? 'urgent' : 'soon'
        atRisk = atRiskOf(b.perDay * PAGE_SHARE[pg.kind])
      }
      out.push({
        key: `page:${pg.path}`,
        kind: 'page-down',
        tier,
        atRisk,
        detail: { path: pg.path, status: pg.status, page: pg.kind, product: p?.name ?? null, from: pg.from ?? null },
        link: pg.kind === 'product' ? productLink(pg.product) : pg.path,
      })
    }

    // --- Photos that don't load (one problem per piece)
    const byProduct = new Map<string, ImageCheck[]>()
    for (const im of i.deep?.images ?? []) {
      const key = im.product ? `image:${im.product}` : `image:${im.url}`
      byProduct.set(key, [...(byProduct.get(key) ?? []), im])
    }
    for (const [key, list] of byProduct) {
      const p = product(list[0].product)
      out.push({
        key,
        kind: 'image-broken',
        tier: p && (p.value >= 0.5 || p.featured) ? 'urgent' : 'soon',
        // A piece without a working photo sells about half as well, at best.
        atRisk: atRiskOf(p ? p.value * 0.5 : null),
        detail: { product: p?.name ?? null, n: list.length, url: list[0].url, page: list[0].page ?? null },
        link: productLink(list[0].product) ?? list[0].page ?? null,
      })
    }
  }

  // --- Catalogue gaps
  if (i.noPrice.length) {
    out.push({
      key: 'no-price',
      kind: 'no-price',
      tier: 'urgent',
      atRisk: null,
      detail: { n: i.noPrice.length, names: i.noPrice.slice(0, 3).map((id) => product(id)?.name ?? `#${id}`).join(', ') },
      link: i.noPrice.length === 1 ? productLink(i.noPrice[0]) : '/admin/collections/products?where[price][less_than_equal]=0',
    })
  }
  if (i.noPhoto.length) {
    out.push({
      key: 'no-photo',
      kind: 'no-photo',
      tier: 'soon',
      atRisk: atRiskOf(i.noPhoto.reduce((s, id) => s + (product(id)?.value ?? 0), 0) * 0.5),
      detail: { n: i.noPhoto.length, names: i.noPhoto.slice(0, 3).map((id) => product(id)?.name ?? `#${id}`).join(', ') },
      link: i.noPhoto.length === 1 ? productLink(i.noPhoto[0]) : '/admin/collections/products?where[images][exists]=false',
    })
  }

  // --- Pages people looked for and didn't find (checked again by the crawl, so fixed ones drop off)
  if (i.deep) {
    const missing = new Set(i.deep.missing)
    const byPath = new Map<string, Signal[]>()
    for (const s of i.signals) if (s.kind === 'not-found' && s.path && missing.has(s.path) && after(s, week)) byPath.set(s.path, [...(byPath.get(s.path) ?? []), s])
    for (const [path, list] of byPath) {
      const perDay = list.length / 7
      const refs = list.map((s) => s.referrer).filter((r): r is string => Boolean(r))
      const inside = refs.find((r) => r.startsWith('/')) ?? null
      const outside = refs.find((r) => !r.startsWith('/')) ?? null
      const tier: Tier = perDay >= 10 ? 'urgent' : inside || list.length >= 3 ? 'soon' : 'fyi'
      out.push({
        key: `missing:${path}`,
        kind: 'missing-page',
        tier,
        atRisk: atRiskOf(aov ? perDay * (b.visitRate ?? DEFAULT_VISIT_RATE) * aov : null),
        detail: { path, hits: list.length, inside, outside },
        link: inside ?? '/admin/collections/redirects/create',
      })
    }
  }

  // --- Backups (also on the security page)
  for (const x of i.backups) {
    out.push({ key: `backup:${x.kind}`, kind: 'backup', tier: 'urgent', atRisk: null, detail: { what: x.kind, at: x.at ?? null, error: x.error ?? null, problem: x.problem ?? null }, link: '/admin/security' })
  }

  // --- Background jobs
  for (const j of i.failedJobs) {
    out.push({ key: `jobs:${j.task}`, kind: 'jobs-failing', tier: j.task === 'stuck-orders' ? 'urgent' : 'soon', atRisk: null, detail: { task: j.task, n: j.n, error: j.error } })
  }
  if (i.lastRunAt !== undefined && (!i.lastRunAt || now - new Date(i.lastRunAt).getTime() > 40 * 60_000)) {
    out.push({ key: 'jobs-stopped', kind: 'jobs-stopped', tier: 'urgent', atRisk: null, detail: { at: i.lastRunAt ?? null } })
  }

  // --- Integrations
  if (i.deep?.rates === 'fallback') out.push({ key: 'rates-fallback', kind: 'rates-fallback', tier: 'fyi', atRisk: null, detail: {} })

  return sortProblems(out)
}

export const sortProblems = (list: Problem[]) => [...list].sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || (b.atRisk ?? -1) - (a.atRisk ?? -1))

/** The worst tier in a list, or null when it's empty. */
export const worstTier = (list: Pick<Problem, 'tier'>[]): Tier | null => (list.length ? TIERS[Math.min(...list.map((p) => tierRank(p.tier)))] : null)

/** JOD a day at risk across the problems that are about sales. */
export const totalAtRisk = (list: Problem[]) => round(list.reduce((s, p) => s + (p.atRisk ?? 0), 0))

// --- Alerts --------------------------------------------------------------------------------------

/** What the alert job remembers about each problem between runs (in the `health-state` global). */
export type Tracked = {
  kind: ProblemKind
  tier: Tier
  /** The English title, for the "fixed" line once the problem is gone. */
  title: string
  firstSeen: string
  alertedAt: string | null
  alertedTier: Tier | null
  resolvedAt: string | null
  /** Was emailed and is now fixed: say so in the next email. */
  announce?: boolean
}
export type AlertBook = { tracked: Record<string, Tracked>; digestDay: string | null }

export type AlertPlan = {
  /** New or worse emergencies and urgent problems, and emergencies due a reminder: email now. */
  now: Problem[]
  /** The morning summary: everything still open that isn't an emergency. */
  digest: Problem[]
  /** Problems the team was emailed about that are now fixed. */
  fixed: Tracked[]
  /** The book to save once the email has gone out. */
  book: AlertBook
}

const REMIND_EMERGENCY = 2 * HOUR
// A problem that comes back within this long is the same problem, not a new alert.
const REOPEN = 6 * HOUR
const KEEP_RESOLVED = 7 * DAY
export const DIGEST_HOUR = 9

/**
 * Decides what to email, so the team hears about each problem once (emergencies every 2 hours)
 * rather than on every run. One email per run at most; the caller sends it and saves `book`.
 */
export function planAlerts(problems: Problem[], book: AlertBook | null, now: Date, title: (p: Problem) => string): AlertPlan {
  const at = now.toISOString()
  const t = now.getTime()
  const prev = book?.tracked ?? {}
  const tracked: Record<string, Tracked> = {}
  const urgentNow: Problem[] = []

  for (const p of problems) {
    const old = prev[p.key]
    const continuing = old && (!old.resolvedAt || t - new Date(old.resolvedAt).getTime() < REOPEN)
    const entry: Tracked = continuing
      ? { ...old, kind: p.kind, tier: p.tier, title: title(p), resolvedAt: null, announce: false }
      : { kind: p.kind, tier: p.tier, title: title(p), firstSeen: at, alertedAt: null, alertedTier: null, resolvedAt: null }
    if (p.tier === 'emergency' || p.tier === 'urgent') {
      const worse = !entry.alertedTier || tierRank(p.tier) < tierRank(entry.alertedTier)
      const remind = p.tier === 'emergency' && entry.alertedAt && t - new Date(entry.alertedAt).getTime() >= REMIND_EMERGENCY
      if (worse || remind) {
        urgentNow.push(p)
        entry.alertedAt = at
        entry.alertedTier = p.tier
      }
    }
    tracked[p.key] = entry
  }

  for (const [key, old] of Object.entries(prev)) {
    if (tracked[key]) continue
    if (old.resolvedAt) {
      if (t - new Date(old.resolvedAt).getTime() < KEEP_RESOLVED) tracked[key] = { ...old }
    } else {
      tracked[key] = { ...old, resolvedAt: at, announce: Boolean(old.alertedAt) }
    }
  }

  // The morning summary, once a day from 09:00 Amman time.
  let digestDay = book?.digestDay ?? null
  let digest: Problem[] = []
  if (ammanHour(now) >= DIGEST_HOUR && digestDay !== ammanDay(now)) {
    digestDay = ammanDay(now)
    digest = problems.filter((p) => (p.tier === 'urgent' || p.tier === 'soon') && !urgentNow.includes(p))
  }

  // "Fixed" goes out straight away for an emergency, otherwise with the next email.
  const announce = Object.values(tracked).filter((x) => x.announce)
  const fixed = urgentNow.length || digest.length || announce.some((x) => x.alertedTier === 'emergency') ? announce : []
  for (const x of fixed) x.announce = false

  return { now: urgentNow, digest, fixed, book: { tracked, digestDay } }
}

import { createHmac } from 'crypto'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
  GlobalAfterChangeHook,
  GlobalConfig,
  Payload,
  PayloadRequest,
} from 'payload'

import { later } from '@/hooks/revalidate'

import { placeOf, where } from './place'

/**
 * The audit log (collection `audit-log`): logins, two-factor events, password resets, recovery-script
 * actions and every change a signed-in person makes to content, users or settings.
 *
 * Nobody can edit or delete entries through the admin or the API. Each entry also carries an HMAC
 * of its contents and of the entry before it (keyed from PAYLOAD_SECRET), so an entry changed or
 * removed straight in the database breaks the chain: `scripts/audit-verify.ts` finds where.
 * Removing the newest entries leaves no break, so that check can't catch it.
 */

export const AUDIT_ACTIONS = [
  'login.password-ok',
  'login.success',
  'login.failed',
  'login.locked',
  'login.code-failed',
  'login.code-blocked',
  'login.recovery-code',
  'login.cancelled',
  'logout',
  'password.reset-requested',
  'password.reset',
  'login.new-place',
  '2fa.enabled',
  'recovery.script',
  'customers.export',
  'customers.forget',
  'activity.burst',
  'security.reviewed',
  'backup.ok',
  'backup.failed',
  'backup.restore-test',
  'create',
  'update',
  'delete',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export type AuditEntry = {
  action: AuditAction
  summary: string
  actor?: number | null
  actorEmail?: string | null
  target?: string | null
  detail?: Record<string, unknown> | null
  ip?: string | null
  location?: string | null
  agent?: string | null
}

/** Who and where, from the request: the signed-in person (if any) and their IP, location, browser. */
export function whoAndWhere(req: PayloadRequest, account?: { id?: number | string; email?: string | null } | null) {
  const user = account ?? (req.user as { id?: number | string; email?: string } | null)
  const place = placeOf(req.headers)
  return {
    actor: typeof user?.id === 'number' ? user.id : user?.id ? Number(user.id) || null : null,
    actorEmail: user?.email ?? null,
    ip: place.ip,
    location: place.country ? where(place) : null,
    agent: place.agent,
  }
}

/** JSON with keys sorted at every level, so Postgres' jsonb key order can't change the hash. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

const key = () => `${process.env.PAYLOAD_SECRET || ''}:audit-log`

type Stored = AuditEntry & { at: string; prev: string | null }

export function entryHash(e: Stored) {
  const body = canonical({
    at: new Date(e.at).toISOString(),
    action: e.action,
    summary: e.summary,
    // Not `actor`: deleting that account empties the link, which would look like tampering.
    // The email is kept as text and covers who it was.
    actorEmail: e.actorEmail ?? null,
    target: e.target ?? null,
    detail: e.detail ?? null,
    ip: e.ip ?? null,
    location: e.location ?? null,
    agent: e.agent ?? null,
    prev: e.prev ?? null,
  })
  return createHmac('sha256', key()).update(body).digest('hex')
}

// One write at a time, so each entry chains onto the one before it. In memory, so per server
// instance: two instances writing at the same moment can fork the chain, which the verify script
// reports as a break to look at, not as proof of tampering.
let queue: Promise<unknown> = Promise.resolve()

export function audit(payload: Payload, entry: AuditEntry): Promise<void> {
  const run = queue.then(async () => {
    const last = await payload.find({ collection: 'audit-log', sort: '-id', limit: 1, depth: 0, pagination: false, select: { hash: true } })
    const stored: Stored = {
      ...entry,
      summary: entry.summary.slice(0, 500),
      actor: entry.actor ?? null,
      detail: entry.detail ?? null,
      at: new Date().toISOString(),
      prev: last.docs[0]?.hash ?? null,
    }
    await payload.create({ collection: 'audit-log', data: { ...stored, hash: entryHash(stored) } })
  })
  queue = run.catch((err) => payload.logger.error({ err, entry }, 'Could not write the audit log'))
  return queue as Promise<void>
}

/** Write after the response is sent; failures are logged, never thrown at the person saving. */
export const auditLater = (payload: Payload, entry: AuditEntry) => later(() => audit(payload, entry))

// --- Content changes -------------------------------------------------------------------------

// Bookkeeping that changes on its own, and secrets that must never be copied into the log.
const IGNORED = new Set([
  'updatedAt',
  'createdAt',
  'sessions',
  'loginPlaces',
  'loginAttempts',
  'lockUntil',
  'hash',
  'salt',
  'resetPasswordToken',
  'resetPasswordExpiration',
  'seoScore',
  'ai',
])

export function changedFields(doc: Record<string, unknown>, prev: Record<string, unknown> | undefined, data?: Record<string, unknown>) {
  const keys = new Set([...Object.keys(doc ?? {}), ...Object.keys(prev ?? {})])
  const changed = [...keys].filter((k) => !IGNORED.has(k) && canonical(doc?.[k]) !== canonical(prev?.[k]))
  if (data && typeof data.password === 'string' && data.password) changed.push('password')
  return changed.slice(0, 30)
}

// Short plain values (numbers, yes/no, short text, lists of those) are copied into the log as
// before → after, so "who changed the price from 45 to 50" can be answered. Long text and nested
// lists are named only.
const SHORT = 120
const plain = (v: unknown): boolean =>
  v === null ||
  v === undefined ||
  typeof v === 'number' ||
  typeof v === 'boolean' ||
  (typeof v === 'string' && v.length <= SHORT) ||
  (Array.isArray(v) && v.length <= 12 && v.every((x) => typeof x === 'string' || typeof x === 'number'))

/** Leaves of an object, one level of groups deep: { customer: { email } } → "customer.email". */
function leaves(value: unknown, prefix: string, out: Map<string, unknown>, depth = 0) {
  if (value && typeof value === 'object' && !Array.isArray(value) && depth < 2) {
    for (const [k, v] of Object.entries(value)) if (!IGNORED.has(k) && k !== 'id') leaves(v, `${prefix}.${k}`, out, depth + 1)
  } else if (plain(value)) out.set(prefix, value ?? null)
}

export function changedValues(doc: Record<string, unknown>, prev: Record<string, unknown> | undefined, fields: string[]) {
  const changes: Record<string, [unknown, unknown]> = {}
  for (const f of fields) {
    if (f === 'password') continue
    const before = new Map<string, unknown>()
    const after = new Map<string, unknown>()
    leaves(prev?.[f], f, before)
    leaves(doc?.[f], f, after)
    for (const k of new Set([...before.keys(), ...after.keys()])) {
      const a = before.get(k) ?? null
      const b = after.get(k) ?? null
      if (canonical(a) !== canonical(b)) changes[k] = [a, b]
    }
  }
  return Object.fromEntries(Object.entries(changes).slice(0, 20))
}

// --- Bursts: many deletes or changes by one person in a few minutes ----------------------------
// A stolen session or an angry ex-teammate tends to delete or rewrite a lot at once. Normal bulk
// edits happen too, so the bar is high and the email only says "have a look". In memory, so per
// server instance; one email per person, kind and window.
const BURST_WINDOW = 10 * 60 * 1000
const BURST_LIMIT = { delete: 10, update: 60 } as const
const bursts = new Map<string, { times: number[]; alerted: number; collections: Set<string> }>()

function noteBurst(req: PayloadRequest, kind: keyof typeof BURST_LIMIT, collection: string) {
  const user = req.user as { id?: number | string; email?: string } | null
  if (!user?.id) return
  const now = Date.now()
  const key = `${kind}:${user.id}`
  const b = bursts.get(key) ?? { times: [], alerted: 0, collections: new Set<string>() }
  b.times = [...b.times.filter((t) => now - t < BURST_WINDOW), now]
  b.collections.add(collection)
  if (bursts.size > 500) bursts.clear()
  bursts.set(key, b)
  if (b.times.length < BURST_LIMIT[kind] || now - b.alerted < BURST_WINDOW) return
  b.alerted = now
  const what = `${b.times.length} ${kind === 'delete' ? 'deletes' : 'changes'} in ${BURST_WINDOW / 60000} minutes (${[...b.collections].join(', ')})`
  auditLater(req.payload, { action: 'activity.burst', summary: `${user.email ?? 'Someone'}: ${what}`, detail: { kind, count: b.times.length, collections: [...b.collections] }, ...whoAndWhere(req) })
  later(async () => {
    const { securityAlert } = await import('./loginAlerts')
    await securityAlert(req.payload, 'burst', placeOf(req.headers), user.email ?? null, [`What: ${what}`])
  })
}

const shown = (v: unknown) => (v === null || v === undefined || v === '' ? '–' : Array.isArray(v) ? v.join(', ') || '–' : String(v))

// Only changes a signed-in person made through the admin or the API. The server's own saves
// (scripts, the SEO writer, checkout creating orders) aren't someone's action, so they're left out.
const byPerson = (req: PayloadRequest) => Boolean(req.user) && req.payloadAPI !== 'local'

const english = (label: unknown, fallback: string) =>
  typeof label === 'string' ? label : label && typeof label === 'object' && 'en' in label ? String((label as { en: unknown }).en) : fallback

function titleOf(doc: Record<string, unknown>, field: string | undefined) {
  const v = doc?.[field ?? ''] ?? doc?.name ?? doc?.title ?? doc?.number
  return typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 120) : null
}

const actorName = (req: PayloadRequest) => {
  const u = req.user as { name?: string; email?: string } | null
  return u?.name || u?.email || 'Someone'
}

function collectionHooks(config: CollectionConfig) {
  const label = english(config.labels?.singular, config.slug)
  const target = (doc: Record<string, unknown>) => {
    const title = titleOf(doc, config.admin?.useAsTitle)
    return `${label} #${doc.id}${title ? ` “${title}”` : ''}`
  }

  const afterChange: CollectionAfterChangeHook = ({ doc, previousDoc, operation, req, data }) => {
    if (!byPerson(req)) return
    const fields = operation === 'update' ? changedFields(doc, previousDoc, data) : []
    if (operation === 'update' && !fields.length) return
    const t = target(doc)
    const changes = operation === 'update' ? changedValues(doc, previousDoc, fields) : {}
    const valued = Object.entries(changes).slice(0, 3)
    const named = valued.length ? fields.filter((f) => !valued.some(([k]) => k === f || k.startsWith(`${f}.`))) : fields
    const said = [...valued.map(([k, [a, b]]) => `${k}: ${shown(a)} → ${shown(b)}`), ...named]
    auditLater(req.payload, {
      action: operation,
      summary: `${actorName(req)} ${operation === 'create' ? 'created' : 'updated'} ${t}${said.length ? ` (${said.join(', ')})` : ''}`,
      target: t,
      detail: { collection: config.slug, id: doc.id, ...(fields.length ? { fields } : {}), ...(Object.keys(changes).length ? { changes } : {}) },
      ...whoAndWhere(req),
    })
    noteBurst(req, 'update', config.slug)
  }

  const afterDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
    if (!byPerson(req)) return
    const t = target(doc)
    auditLater(req.payload, {
      action: 'delete',
      summary: `${actorName(req)} deleted ${t}`,
      target: t,
      detail: { collection: config.slug, id: doc.id },
      ...whoAndWhere(req),
    })
    noteBurst(req, 'delete', config.slug)
  }

  return { afterChange, afterDelete }
}

/** Adds the audit hooks to every collection except the given ones (the log itself, raw tracking rows…). */
export function withAudit(collections: CollectionConfig[], skip: string[]): CollectionConfig[] {
  return collections.map((c) => {
    if (skip.includes(c.slug) || c.slug.startsWith('payload-')) return c
    const { afterChange, afterDelete } = collectionHooks(c)
    return {
      ...c,
      hooks: {
        ...c.hooks,
        afterChange: [...(c.hooks?.afterChange ?? []), afterChange],
        afterDelete: [...(c.hooks?.afterDelete ?? []), afterDelete],
      },
    }
  })
}

export function withAuditGlobal(global: GlobalConfig): GlobalConfig {
  const label = english(global.label, global.slug)
  const afterChange: GlobalAfterChangeHook = ({ doc, previousDoc, req }) => {
    if (!byPerson(req)) return
    const fields = changedFields(doc, previousDoc)
    if (!fields.length) return
    const changes = changedValues(doc, previousDoc, fields)
    auditLater(req.payload, {
      action: 'update',
      summary: `${actorName(req)} updated ${label} (${fields.join(', ')})`,
      target: label,
      detail: { global: global.slug, fields, ...(Object.keys(changes).length ? { changes } : {}) },
      ...whoAndWhere(req),
    })
  }
  return { ...global, hooks: { ...global.hooks, afterChange: [...(global.hooks?.afterChange ?? []), afterChange] } }
}

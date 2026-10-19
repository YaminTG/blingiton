import type { Payload, Where } from 'payload'

import type { AuditLog, TwoFactor, User } from '@/payload-types'

import { entryHash, type AuditAction, type AuditEntry } from './audit'
import { backupSetupProblems, type BackupProblem, type BackupRun, type RestoreRun } from './backup'
import { isProduction } from './site'
import { hasTwoFactor } from './twoFactor'

/**
 * What the security page (components/admin/Security.tsx) shows: things that need someone, worked
 * out from the accounts, the backups and the setup, and the recent security events from the audit
 * log, each with what to do. Text lives in the component (EN + AR); this returns kinds and facts.
 */

export type Level = 'critical' | 'warning' | 'ok'

export type Check =
  | { kind: 'no-2fa'; level: Level; user: Pick<User, 'id' | 'name' | 'email'> }
  | { kind: 'few-codes'; level: Level; user: Pick<User, 'id' | 'name' | 'email'>; left: number }
  | { kind: 'locked'; level: Level; user: Pick<User, 'id' | 'name' | 'email'>; until: string }
  | { kind: 'code-paused'; level: Level; user: Pick<User, 'id' | 'name' | 'email'> }
  | { kind: 'staff-nothing'; level: Level; user: Pick<User, 'id' | 'name' | 'email'> }
  | { kind: 'idle-account'; level: Level; user: Pick<User, 'id' | 'name' | 'email'>; lastLogin: string | null }
  | { kind: 'backup-setup'; level: Level; problem: BackupProblem }
  | { kind: 'backup-failed'; level: Level; at: string; error: string }
  | { kind: 'backup-stale'; level: Level; at: string | null }
  | { kind: 'restore-failed'; level: Level; at: string; error: string }
  | { kind: 'restore-stale'; level: Level; at: string | null }
  | { kind: 'no-smtp'; level: Level }
  | { kind: 'no-alert-env'; level: Level }
  | { kind: 'many-admins'; level: Level; count: number }
  | { kind: 'audit-broken'; level: Level; id: number }
  | { kind: 'all-2fa' | 'backups-ok' | 'restore-ok' | 'alerts-ok' | 'audit-ok'; level: 'ok' }

// Security events worth a look, and how serious each is. "what to do" text is per kind in the component.
const EVENT_LEVEL: Partial<Record<AuditAction, Level>> = {
  'login.code-blocked': 'critical',
  'login.recovery-code': 'critical',
  'recovery.script': 'critical',
  'activity.burst': 'critical',
  'backup.failed': 'critical',
  'backup.restore-test': 'critical',
  'login.locked': 'warning',
  'login.code-failed': 'warning',
  'login.new-place': 'warning',
  '2fa.enabled': 'warning',
  'customers.export': 'warning',
  'password.reset': 'warning',
  'password.reset-requested': 'warning',
}
// Changes to the team (accounts created, changed or deleted) are events too.
const TEAM_ACTIONS: AuditAction[] = ['create', 'update', 'delete']

export type SecurityEvent = Pick<AuditLog, 'id' | 'at' | 'action' | 'summary' | 'actorEmail' | 'ip' | 'location'> & { level: Level; isNew: boolean; team: boolean }

export type SecurityReport = {
  checks: Check[]
  events: SecurityEvent[]
  stats: { failedLogins: number; failedIps: number; newPlaces: number; exports: number; admins: number; staff: number }
  backups: BackupRun[]
  restoreTests: RestoreRun[]
  reviewedUntil: string | null
  reviewedBy: string | null
  days: number
}

const DAY = 86400_000
const BACKUP_STALE_HOURS = 36
const RESTORE_STALE_DAYS = 8
const IDLE_DAYS = 90
const MAX_ADMINS = 3

const order: Record<Level, number> = { critical: 0, warning: 1, ok: 2 }

/** The newest audit entries still chain correctly (a quick look; scripts/audit-verify.ts checks everything). */
async function auditBreak(payload: Payload): Promise<number | null> {
  const { docs } = await payload.find({ collection: 'audit-log', sort: '-id', limit: 200, depth: 0, pagination: false })
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]
    const expected = entryHash({
      ...(d as unknown as AuditEntry),
      actor: typeof d.actor === 'object' && d.actor ? d.actor.id : (d.actor ?? null),
      detail: (d.detail as Record<string, unknown> | null) ?? null,
      at: d.at,
      prev: d.prev ?? null,
    })
    if (expected !== d.hash) return d.id
    const older = docs[i + 1]
    if (older && d.prev !== older.hash) return d.id
  }
  return null
}

export async function securityReport(payload: Payload, days = 14): Promise<SecurityReport> {
  const now = Date.now()
  const since = new Date(now - days * DAY).toISOString()

  const [users, records, state, logins] = await Promise.all([
    payload.find({ collection: 'users', limit: 0, pagination: false, depth: 0, showHiddenFields: true }),
    payload.find({ collection: 'two-factor', limit: 0, pagination: false, depth: 0 }),
    payload.findGlobal({ slug: 'security-state', depth: 0 }),
    payload.find({
      collection: 'audit-log',
      where: { action: { equals: 'login.success' } },
      sort: '-at',
      limit: 500,
      depth: 0,
      pagination: false,
      select: { actorEmail: true, at: true },
    }),
  ])

  const recFor = new Map<number, TwoFactor>()
  for (const r of records.docs) recFor.set(typeof r.user === 'object' ? r.user.id : r.user, r)
  const lastLogin = new Map<string, string>()
  for (const l of logins.docs) if (l.actorEmail && !lastLogin.has(l.actorEmail)) lastLogin.set(l.actorEmail, l.at)

  const checks: Check[] = []
  const who = (u: User) => ({ id: u.id, name: u.name, email: u.email })

  // --- Accounts
  let all2fa = true
  for (const u of users.docs) {
    const rec = recFor.get(u.id) ?? null
    if (!hasTwoFactor(rec)) {
      all2fa = false
      checks.push({ kind: 'no-2fa', level: 'critical', user: who(u) })
    } else {
      const left = Array.isArray(rec?.recoveryCodes) ? rec.recoveryCodes.length : 0
      if (left < 3) checks.push({ kind: 'few-codes', level: 'warning', user: who(u), left })
    }
    if (u.lockUntil && new Date(u.lockUntil).getTime() > now) checks.push({ kind: 'locked', level: 'warning', user: who(u), until: u.lockUntil })
    const failures = (Array.isArray(rec?.failures) ? (rec.failures as number[]) : []).filter((t) => now - t < 3600_000)
    if (failures.length >= 10) checks.push({ kind: 'code-paused', level: 'critical', user: who(u) })
    if (u.role !== 'admin' && !(u.permissions ?? []).length) checks.push({ kind: 'staff-nothing', level: 'warning', user: who(u) })
    const last = lastLogin.get(u.email) ?? null
    const age = last ? now - new Date(last).getTime() : now - new Date(u.createdAt).getTime()
    if (age > IDLE_DAYS * DAY) checks.push({ kind: 'idle-account', level: 'warning', user: who(u), lastLogin: last })
  }
  if (all2fa && users.docs.length) checks.push({ kind: 'all-2fa', level: 'ok' })
  const admins = users.docs.filter((u) => u.role === 'admin').length
  if (admins > MAX_ADMINS) checks.push({ kind: 'many-admins', level: 'warning', count: admins })

  // --- Backups
  const backups = (Array.isArray(state.backups) ? state.backups : []) as BackupRun[]
  const restoreTests = (Array.isArray(state.restoreTests) ? state.restoreTests : []) as RestoreRun[]
  const setup = backupSetupProblems()
  for (const problem of setup) checks.push({ kind: 'backup-setup', level: problem === 'shared-bucket' ? 'warning' : 'critical', problem })
  const lastOk = backups.find((b) => b.ok)
  if (backups[0] && !backups[0].ok) checks.push({ kind: 'backup-failed', level: 'critical', at: backups[0].at, error: backups[0].error ?? '' })
  else if (!setup.includes('no-key') && (!lastOk || now - new Date(lastOk.at).getTime() > BACKUP_STALE_HOURS * 3600_000))
    checks.push({ kind: 'backup-stale', level: 'critical', at: lastOk?.at ?? null })
  else if (lastOk && !setup.length) checks.push({ kind: 'backups-ok', level: 'ok' })
  const lastTest = restoreTests[0]
  if (lastTest && !lastTest.ok) checks.push({ kind: 'restore-failed', level: 'critical', at: lastTest.at, error: lastTest.error ?? '' })
  else if (lastOk && (!lastTest || now - new Date(lastTest.at).getTime() > RESTORE_STALE_DAYS * DAY)) checks.push({ kind: 'restore-stale', level: 'warning', at: lastTest?.at ?? null })
  else if (lastTest?.ok) checks.push({ kind: 'restore-ok', level: 'ok' })

  // --- Alerts reach someone
  const smtp = Boolean(process.env.SMTP_HOST)
  const alertEnv = Boolean(process.env.SECURITY_ALERT_EMAILS?.trim())
  if (!smtp) checks.push({ kind: 'no-smtp', level: isProduction ? 'critical' : 'warning' })
  if (!alertEnv) checks.push({ kind: 'no-alert-env', level: 'warning' })
  if (smtp && alertEnv) checks.push({ kind: 'alerts-ok', level: 'ok' })

  // --- The audit log itself
  const broken = await auditBreak(payload)
  checks.push(broken ? { kind: 'audit-broken', level: 'critical', id: broken } : { kind: 'audit-ok', level: 'ok' })

  checks.sort((a, b) => order[a.level] - order[b.level])

  // --- Recent events
  const where: Where = {
    and: [
      { at: { greater_than_equal: since } },
      {
        or: [
          { action: { in: Object.keys(EVENT_LEVEL) } },
          { and: [{ action: { in: TEAM_ACTIONS } }, { target: { like: 'users #' } }] },
        ],
      },
    ],
  }
  const [found, failed, places, exports] = await Promise.all([
    payload.find({ collection: 'audit-log', where, sort: '-at', limit: 100, depth: 0, pagination: false }),
    payload.find({ collection: 'audit-log', where: { and: [{ action: { equals: 'login.failed' } }, { at: { greater_than_equal: since } }] }, limit: 1000, depth: 0, pagination: false, select: { ip: true } }),
    payload.count({ collection: 'audit-log', where: { and: [{ action: { equals: 'login.new-place' } }, { at: { greater_than_equal: since } }] } }),
    payload.count({ collection: 'audit-log', where: { and: [{ action: { equals: 'customers.export' } }, { at: { greater_than_equal: since } }] } }),
  ])
  const reviewedUntil = (state.reviewedUntil as string | null | undefined) ?? null
  const reviewed = reviewedUntil ? new Date(reviewedUntil).getTime() : 0
  const events: SecurityEvent[] = found.docs
    // A passed restore test isn't news; only failed ones are.
    .filter((d) => !(d.action === 'backup.restore-test' && (d.detail as { ok?: boolean } | null)?.ok))
    .map((d) => {
      const team = TEAM_ACTIONS.includes(d.action as AuditAction)
      return {
        id: d.id,
        at: d.at,
        action: d.action,
        summary: d.summary,
        actorEmail: d.actorEmail,
        ip: d.ip,
        location: d.location,
        level: team ? 'warning' : (EVENT_LEVEL[d.action as AuditAction] ?? 'warning'),
        team,
        isNew: new Date(d.at).getTime() > reviewed,
      }
    })

  return {
    checks,
    events,
    stats: {
      failedLogins: failed.docs.length,
      failedIps: new Set(failed.docs.map((d) => d.ip)).size,
      newPlaces: places.totalDocs,
      exports: exports.totalDocs,
      admins,
      staff: users.docs.length - admins,
    },
    backups,
    restoreTests,
    reviewedUntil,
    reviewedBy: (state.reviewedBy as string | null | undefined) ?? null,
    days,
  }
}

/** Counts for the admin home card. */
export const needsYou = (r: SecurityReport) => ({
  critical: r.checks.filter((c) => c.level === 'critical').length + r.events.filter((e) => e.isNew && e.level === 'critical').length,
  warning: r.checks.filter((c) => c.level === 'warning').length,
  fresh: r.events.filter((e) => e.isNew).length,
})

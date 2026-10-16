import { AuthenticationError, LockedAuth } from 'payload'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionAfterErrorHook,
  CollectionAfterForgotPasswordHook,
  Payload,
} from 'payload'

import { later } from '@/hooks/revalidate'

import { auditLater, whoAndWhere } from './audit'
import { countryName, placeOf, where, type Place } from './place'
import { serverUrl } from './site'

/**
 * Security emails to the team: wrong passwords, locked accounts, password-reset requests, wrong
 * two-factor codes, recovery codes used, two-factor set up, logins from a country (or, when the
 * host sends no country, an IP) that account hasn't logged in from before, and changes to the team.
 * Each email carries the visitor's IP, whatever location the host or Cloudflare reports, and the browser.
 *
 * Recipients: SECURITY_ALERT_EMAILS (comma-separated) when set; otherwise every admin account,
 * and the shop email (Site settings) as a last resort. The env var is the safer choice: someone
 * who got into the admin can't quietly change where alerts go.
 */

export type AlertKind =
  | 'failed'
  | 'locked'
  | 'reset'
  | 'new-place'
  | 'code-failed'
  | 'code-blocked'
  | 'recovery-used'
  | '2fa-enabled'
  | 'team'
  | 'recovery-script'

// One email per IP and kind every 15 minutes, and at most 20 an hour overall, so an attack can't
// flood the inbox (or the email quota). Attempts in between are counted into the next email.
// In memory, so per server instance.
const QUIET_MS = 15 * 60 * 1000
const MAX_PER_HOUR = 20
const recent = new Map<string, { at: number; missed: number }>()
let hour = { start: 0, sent: 0 }

function allow(key: string): { ok: boolean; missed: number } {
  const now = Date.now()
  const last = recent.get(key)
  if (last && now - last.at < QUIET_MS) {
    last.missed++
    return { ok: false, missed: 0 }
  }
  if (now - hour.start > 60 * 60 * 1000) hour = { start: now, sent: 0 }
  if (hour.sent >= MAX_PER_HOUR) return { ok: false, missed: 0 }
  hour.sent++
  if (recent.size > 2000) recent.clear()
  recent.set(key, { at: now, missed: 0 })
  return { ok: true, missed: last?.missed ?? 0 }
}

// Rare, important events that are never throttled.
const ALWAYS: AlertKind[] = ['2fa-enabled', 'team', 'recovery-script', 'recovery-used']

const TITLES: Record<AlertKind, string> = {
  failed: 'Failed login to the Blingiton admin',
  locked: 'Blingiton admin account locked after failed logins',
  reset: 'Password reset requested for the Blingiton admin',
  'new-place': 'Blingiton admin login from a new place',
  'code-failed': 'Correct password, wrong two-factor code',
  'code-blocked': 'Two-factor code entry paused after repeated wrong codes',
  'recovery-used': 'A recovery code was used to log in',
  '2fa-enabled': 'Two-factor login set up on an admin account',
  team: 'Change to the Blingiton admin team',
  'recovery-script': 'Admin recovery script run on the server',
}

const ADVICE: Record<AlertKind, string> = {
  failed: 'If this wasn’t one of the team, someone is guessing passwords. After 5 wrong tries the account locks for 15 minutes. Use a long, unique password.',
  locked: 'The account is locked for 15 minutes. If this wasn’t one of the team, change that account’s password once it unlocks.',
  reset: 'A reset link went to the account’s email. If nobody on the team asked for it, ignore the link. The password stays the same.',
  'new-place': 'If this was one of the team (travel, a new phone network), ignore this. If not, change the password right away and check Team → Users.',
  'code-failed':
    'Whoever this was typed the right password. If it wasn’t one of the team mistyping a code, the password is known to someone else: change it now.',
  'code-blocked':
    'Too many wrong codes in an hour, so code entry for this account is paused for an hour. If this wasn’t one of the team, change the password now.',
  'recovery-used':
    'One of the one-time recovery codes was used (normally because a phone was lost), and the account is now setting up a new authenticator app. If this wasn’t them, run the recovery script to reset the account.',
  '2fa-enabled':
    'If this wasn’t the account’s owner setting up their phone, someone else had the password and linked their own app. Run the recovery script (scripts/admin-recovery.ts) to reset it and change the password.',
  team: 'If nobody on the team made this change, someone may be inside the admin: check Team → Audit log and Team → Users.',
  'recovery-script': 'Someone with access to the server ran the recovery script. If nobody on the team did, the server itself may be compromised.',
}

export async function alertRecipients(payload: Payload): Promise<string[]> {
  const fromEnv = (process.env.SECURITY_ALERT_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (fromEnv.length) return fromEnv
  const admins = await payload.find({ collection: 'users', where: { role: { equals: 'admin' } }, limit: 20, depth: 0, pagination: false, select: { email: true } })
  const emails = admins.docs.map((u) => u.email).filter(Boolean)
  if (emails.length) return emails
  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  return settings.email ? [settings.email] : []
}

export async function securityAlert(payload: Payload, kind: AlertKind, place: Place | null, account: string | null, details: string[] = []) {
  let missed = 0
  if (!ALWAYS.includes(kind)) {
    const gate = allow(`${kind}:${place?.ip ?? 'server'}`)
    if (!gate.ok) return
    missed = gate.missed
  }
  const to = await alertRecipients(payload)
  const subject = `${TITLES[kind]}${place ? ` · ${place.country ? countryName(place.country) : place.ip}` : ''}`
  const lines = [
    TITLES[kind],
    '',
    `Account: ${account || 'unknown'}`,
    `When: ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Amman' })} (Amman time)`,
    ...(place ? [`IP address: ${place.ip}`, `Location: ${where(place)}`, `Browser: ${place.agent ?? 'unknown'}`] : []),
    ...details,
    ...(missed ? [`Plus ${missed} more like this from the same IP since the last alert.`] : []),
    '',
    ADVICE[kind],
    '',
    ...(place && place.ip !== 'unknown' ? [`Look up this IP (network and provider): https://ipinfo.io/${encodeURIComponent(place.ip)}`] : []),
    `Audit log: ${serverUrl}/admin/collections/audit-log`,
  ]
  if (!to.length) {
    payload.logger.warn({ kind, ip: place?.ip, account }, `${subject} (no alert recipients, so no alert was sent)`)
    return
  }
  const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(lines.join('\n')).replace(/https:\/\/\S+/g, (u) => `<a href="${u}">${u}</a>`)}</div>`
  await payload.sendEmail({ to, subject, text: lines.join('\n'), html })
}

const isLoginRoute = (url: string | undefined) => {
  try {
    return /\/login\/?$/.test(new URL(url ?? '', 'http://localhost').pathname)
  } catch {
    return false
  }
}

/** Wrong password (or unknown email) and locked accounts, on the admin's login request. */
export const alertOnFailedLogin: CollectionAfterErrorHook = ({ error, req }) => {
  const locked = error instanceof LockedAuth
  if (!locked && !(error instanceof AuthenticationError)) return
  if (!isLoginRoute(req.url)) return
  const email = typeof req.data?.email === 'string' ? req.data.email.slice(0, 200) : null
  const place = placeOf(req.headers)
  auditLater(req.payload, {
    action: locked ? 'login.locked' : 'login.failed',
    summary: `${locked ? 'Locked account' : 'Wrong password'} for ${email ?? 'unknown email'}`,
    ...whoAndWhere(req, { email }),
  })
  later(() => securityAlert(req.payload, locked ? 'locked' : 'failed', place, email))
}

export const alertOnPasswordReset: CollectionAfterForgotPasswordHook = ({ args }) => {
  const req = args?.req
  if (!req?.payload) return
  const email = typeof args?.data?.email === 'string' ? args.data.email.slice(0, 200) : null
  const place = placeOf(req.headers)
  auditLater(req.payload, { action: 'password.reset-requested', summary: `Password reset requested for ${email ?? 'unknown email'}`, ...whoAndWhere(req, { email }) })
  later(() => securityAlert(req.payload, 'reset', place, email))
}

/**
 * Remembers where each account logs in from (country, or IP when there's no country) and alerts on
 * a new one. Called once the login is complete, two-factor code included. The very first login
 * after this was added only records the place.
 */
export async function noteLoginPlace(payload: Payload, user: { id: number; email: string; loginPlaces?: unknown }, place: Place) {
  const key = place.country ?? place.ip
  const known: string[] = Array.isArray(user.loginPlaces) ? user.loginPlaces.filter((x: unknown): x is string => typeof x === 'string') : []
  if (known.includes(key)) return
  try {
    // Straight to the database: no hooks, and nothing else on the account is re-saved.
    await payload.db.updateOne({ collection: 'users', id: user.id, data: { loginPlaces: [...known, key].slice(-20) }, returning: false })
  } catch (err) {
    payload.logger.error({ err }, 'Could not record the login place')
  }
  if (known.length) later(() => securityAlert(payload, 'new-place', place, user.email))
}

/** New accounts, accounts promoted to admin, and deleted accounts. */
export const alertOnTeamChange: CollectionAfterChangeHook = ({ doc, previousDoc, operation, req }) => {
  const by = (req.user as { email?: string } | null)?.email ?? 'the server (no one signed in)'
  let what: string | null = null
  if (operation === 'create') what = `New ${doc.role} account created: ${doc.name} <${doc.email}>`
  else if (doc.role === 'admin' && previousDoc?.role !== 'admin') what = `${doc.name} <${doc.email}> was made an admin`
  else if (doc.email !== previousDoc?.email) what = `${doc.name} changed their login email from ${previousDoc?.email} to ${doc.email}`
  if (!what) return
  const place = req.user ? placeOf(req.headers) : null
  later(() => securityAlert(req.payload, 'team', place, doc.email, [`Change: ${what}`, `Made by: ${by}`]))
}

export const alertOnTeamDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  const by = (req.user as { email?: string } | null)?.email ?? 'the server (no one signed in)'
  const place = req.user ? placeOf(req.headers) : null
  later(() => securityAlert(req.payload, 'team', place, doc.email, [`Change: ${doc.name} <${doc.email}> was deleted`, `Made by: ${by}`]))
}

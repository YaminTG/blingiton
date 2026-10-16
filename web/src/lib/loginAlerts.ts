import { AuthenticationError, LockedAuth } from 'payload'
import type { CollectionAfterErrorHook, CollectionAfterForgotPasswordHook, CollectionAfterLoginHook, Payload } from 'payload'

import { later } from '@/hooks/revalidate'

import { serverUrl } from './site'

/**
 * Emails the shop (Site settings → email) when someone tries to get into the admin: a wrong
 * password, a locked account, a password-reset request, or a successful login from a country (or,
 * when the host sends no country, an IP) that account hasn't logged in from before.
 * Each email carries the visitor's IP and whatever location the host or Cloudflare reports.
 */

type Kind = 'failed' | 'locked' | 'reset' | 'new-place'

type Place = { ip: string; country: string | null; city: string | null; region: string | null; agent: string | null }

const header = (h: Headers, ...names: string[]) => {
  for (const n of names) {
    const v = h.get(n)?.trim()
    if (v) return v
  }
  return null
}

const decode = (v: string | null) => {
  if (!v) return null
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

/** Cloudflare and Vercel put the visitor's IP and location in headers; other hosts give the IP only. */
export function placeOf(h: Headers): Place {
  const country = header(h, 'cf-ipcountry', 'x-vercel-ip-country')
  return {
    ip: header(h, 'cf-connecting-ip', 'x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
    // Cloudflare: XX = unknown, T1 = Tor.
    country: country && country !== 'XX' ? country.toUpperCase() : null,
    city: decode(header(h, 'x-vercel-ip-city', 'cf-ipcity')),
    region: decode(header(h, 'x-vercel-ip-country-region', 'cf-region')),
    agent: h.get('user-agent')?.slice(0, 300) ?? null,
  }
}

const countryName = (code: string) => {
  if (code === 'T1') return 'Tor network (hidden location)'
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

const where = (p: Place) => (p.country ? [p.city, p.region, countryName(p.country)].filter(Boolean).join(', ') : 'unknown location')

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

const TITLES: Record<Kind, string> = {
  failed: 'Failed login to the Blingiton admin',
  locked: 'Blingiton admin account locked after failed logins',
  reset: 'Password reset requested for the Blingiton admin',
  'new-place': 'Blingiton admin login from a new place',
}

const ADVICE: Record<Kind, string> = {
  failed: 'If this wasn’t one of the team, someone is guessing passwords. After 5 wrong tries the account locks for 15 minutes. Use a long, unique password.',
  locked: 'The account is locked for 15 minutes. If this wasn’t one of the team, change that account’s password once it unlocks.',
  reset: 'A reset link went to the account’s email. If nobody on the team asked for it, ignore the link. The password stays the same.',
  'new-place': 'If this was one of the team (travel, a new phone network), ignore this. If not, change the password right away and check Team → Users.',
}

async function sendAlert(payload: Payload, kind: Kind, place: Place, account: string | null) {
  const { ok, missed } = allow(`${kind}:${place.ip}`)
  if (!ok) return
  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  const to = settings.email
  const subject = `${TITLES[kind]} · ${place.country ? countryName(place.country) : place.ip}`
  const lines = [
    TITLES[kind],
    '',
    `Account: ${account || 'unknown'}`,
    `When: ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Amman' })} (Amman time)`,
    `IP address: ${place.ip}`,
    `Location: ${where(place)}`,
    `Browser: ${place.agent ?? 'unknown'}`,
    ...(missed ? [`Plus ${missed} more like this from the same IP since the last alert.`] : []),
    '',
    ADVICE[kind],
    '',
    ...(place.ip !== 'unknown' ? [`Look up this IP: https://ipinfo.io/${encodeURIComponent(place.ip)}`] : []),
    `Admin: ${serverUrl}/admin`,
  ]
  if (!to) {
    payload.logger.warn({ kind, ip: place.ip, account }, `${subject} (no shop email in Site settings, so no alert was sent)`)
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
  later(() => sendAlert(req.payload, locked ? 'locked' : 'failed', place, email))
}

export const alertOnPasswordReset: CollectionAfterForgotPasswordHook = ({ args }) => {
  const req = args?.req
  if (!req?.payload) return
  const email = typeof args?.data?.email === 'string' ? args.data.email.slice(0, 200) : null
  const place = placeOf(req.headers)
  later(() => sendAlert(req.payload, 'reset', place, email))
}

/**
 * Remembers where each account logs in from (country, or IP when there's no country) and alerts on
 * a new one. The very first login after this was added only records the place.
 */
export const alertOnNewPlace: CollectionAfterLoginHook = async ({ user, req }) => {
  const place = placeOf(req.headers)
  const key = place.country ?? place.ip
  const known: string[] = Array.isArray(user.loginPlaces) ? user.loginPlaces.filter((x: unknown): x is string => typeof x === 'string') : []
  if (known.includes(key)) return
  try {
    // Straight to the database: no hooks, and nothing else on the account is re-saved.
    await req.payload.db.updateOne({ collection: 'users', id: user.id, data: { loginPlaces: [...known, key].slice(-20) }, req, returning: false })
  } catch (err) {
    req.payload.logger.error({ err }, 'Could not record the login place')
  }
  if (known.length) later(() => sendAlert(req.payload, 'new-place', place, user.email))
}

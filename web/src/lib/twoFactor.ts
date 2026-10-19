import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { jwtVerify } from 'jose'
import type {
  CollectionAfterLoginHook,
  CollectionAfterLogoutHook,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  Endpoint,
  Payload,
  PayloadRequest,
} from 'payload'
import { generateExpiredPayloadCookie, parseCookies } from 'payload/shared'

import { later } from '@/hooks/revalidate'
import type { TwoFactor, User } from '@/payload-types'

import { audit, auditLater, whoAndWhere } from './audit'
import { noteLoginPlace, securityAlert } from './loginAlerts'
import { placeOf } from './place'
import { checkCode, hashRecovery, looksLikeRecovery, newRecoveryCodes, newSecret } from './totp'

/**
 * Two-factor login for every admin account (authenticator app codes).
 *
 * Payload creates a session when the password is right and puts its id in the login cookie.
 * `holdForTwoFactor` (afterLogin) takes that session straight back out of the account and parks it
 * here as "pending", so the cookie authenticates nothing: not the admin, not the REST or GraphQL
 * API. The admin login page then asks for the code (components/admin/TwoFactor.tsx), and
 * `/api/users/two-factor` puts the session back once the code is right. Password resets log in
 * through the same hook, so they need a code too.
 *
 * An account without two-factor yet is shown a QR code to set it up on its next login, and gets
 * ten one-time recovery codes. A recovery code logs in without the phone and goes straight to
 * setting up a new one. `scripts/admin-recovery.ts` resets an account from the server.
 *
 * "Trust this browser" on the code step sets an httpOnly cookie with a random token (only its hash
 * is stored, in `trusted`). For 30 days a login from that browser needs only the password. Password
 * resets always ask for the code. A recovery code, a password change, a password reset, or the
 * recovery script forgets every trusted browser of the account.
 */

const MAX_TRIES_PER_LOGIN = 5
const MAX_FAILURES_PER_HOUR = 10
const HOUR = 60 * 60 * 1000
const TRUST_DAYS = 30
const MAX_TRUSTED = 10

type Pending = { sid: string; createdAt: string; expiresAt: string; ip: string; attempts: number; recovered?: boolean }
type Trusted = { hash: string; createdAt: string; expiresAt: string; lastUsedAt?: string; ip: string; agent?: string }
type Session = { id: string; createdAt?: string | Date | null; expiresAt: string | Date }

// --- Secrets at rest: AES-256-GCM with a key derived from PAYLOAD_SECRET ----------------------

const sealKey = () => createHash('sha256').update(`${process.env.PAYLOAD_SECRET || ''}:two-factor`).digest()

export function seal(text: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', sealKey(), iv)
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

export function unseal(sealed: string) {
  const [v, iv, tag, body] = sealed.split('.')
  if (v !== 'v1' || !iv || !tag || !body) throw new Error('Unknown sealed format')
  const decipher = createDecipheriv('aes-256-gcm', sealKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
}

// --- Records ----------------------------------------------------------------------------------

const live = (list: unknown): Pending[] =>
  (Array.isArray(list) ? (list as Pending[]) : []).filter((p) => p && typeof p.sid === 'string' && new Date(p.expiresAt).getTime() > Date.now())

const recentFailures = (list: unknown) => (Array.isArray(list) ? (list as number[]) : []).filter((t) => typeof t === 'number' && Date.now() - t < HOUR)

const liveTrusted = (list: unknown): Trusted[] =>
  (Array.isArray(list) ? (list as Trusted[]) : []).filter((d) => d && typeof d.hash === 'string' && new Date(d.expiresAt).getTime() > Date.now())

export async function recordFor(payload: Payload, userId: number, req?: PayloadRequest): Promise<TwoFactor | null> {
  const found = await payload.find({ collection: 'two-factor', where: { user: { equals: userId } }, limit: 1, depth: 0, pagination: false, req })
  return found.docs[0] ?? null
}

async function saveRecord(payload: Payload, userId: number, rec: TwoFactor | null, data: Partial<TwoFactor>, req?: PayloadRequest) {
  if (rec) await payload.update({ collection: 'two-factor', id: rec.id, data, depth: 0, req })
  else await payload.create({ collection: 'two-factor', data: { user: userId, ...data }, depth: 0, req })
}

const rawUser = (payload: Payload, id: number, req?: PayloadRequest) =>
  payload.db.findOne<User & { sessions?: Session[] | null }>({ collection: 'users', where: { id: { equals: id } }, req })

const setSessions = (payload: Payload, id: number, sessions: Session[], req?: PayloadRequest) =>
  payload.db.updateOne({ collection: 'users', id, data: { sessions }, req, returning: false })

export const hasTwoFactor = (rec: TwoFactor | null) => Boolean(rec?.secret && rec.enabledAt)

// --- Trusted browsers -------------------------------------------------------------------------

// One cookie per account, sent only to the users API (login and reset-password live there).
const trustCookieName = (payload: Payload, userId: number) => `${payload.config.cookiePrefix}-trust-${userId}`
const trustCookiePath = (payload: Payload) => `${payload.config.routes.api}/users`
const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url')

function trustCookie(payload: Payload, userId: number, token: string) {
  const secure = payload.collections.users.config.auth.cookies?.secure || process.env.NODE_ENV === 'production'
  return [
    `${trustCookieName(payload, userId)}=${token}`,
    `Path=${trustCookiePath(payload)}`,
    `Max-Age=${TRUST_DAYS * 24 * 60 * 60}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

/** This browser's trusted entry for the account, if its cookie matches one that hasn't expired. */
function trustedBrowser(req: PayloadRequest, userId: number, rec: TwoFactor | null) {
  const token = parseCookies(req.headers).get(trustCookieName(req.payload, userId))
  if (!token) return null
  const hash = hashToken(token)
  return liveTrusted(rec?.trusted).find((d) => d.hash === hash) ?? null
}

/** Forgets every trusted browser of the account, so the next login from each asks for a code. */
export async function forgetTrusted(payload: Payload, userId: number, req?: PayloadRequest) {
  const rec = await recordFor(payload, userId, req)
  if (rec && liveTrusted(rec.trusted).length) await saveRecord(payload, userId, rec, { trusted: [] }, req)
}

/** A new password (from the account page or an admin) means old trusted browsers ask for a code again. */
export const forgetTrustedOnPasswordChange: CollectionBeforeChangeHook = async ({ data, operation, originalDoc, req }) => {
  if (operation === 'update' && typeof data?.password === 'string' && data.password && originalDoc?.id) {
    await forgetTrusted(req.payload, originalDoc.id, req)
  }
  return data
}

// --- Login: park the new session --------------------------------------------------------------

export const holdForTwoFactor: CollectionAfterLoginHook = async ({ user, req }) => {
  const sessions: Session[] = Array.isArray(user.sessions) ? user.sessions : []
  // Payload appends the login's session last. No session means sessions are switched off, and
  // two-factor can't be enforced without them, so the login is refused rather than let through.
  const session = sessions.at(-1)
  if (!session?.id) throw new Error('Two-factor login needs Payload sessions (auth.useSessions).')

  const rec = await recordFor(req.payload, user.id, req)
  const place = placeOf(req.headers)
  const viaReset = /reset-password/.test(new URL(req.url ?? '/', 'http://localhost').pathname)

  // A trusted browser keeps its session: the password was enough.
  const trusted = !viaReset && hasTwoFactor(rec) ? trustedBrowser(req, user.id, rec) : null
  if (trusted) {
    const now = new Date().toISOString()
    const list = liveTrusted(rec?.trusted).map((d) => (d.hash === trusted.hash ? { ...d, lastUsedAt: now, ip: place.ip } : d))
    await saveRecord(req.payload, user.id, rec, { trusted: list }, req)
    auditLater(req.payload, {
      action: 'login.success',
      summary: `${user.email} logged in from a trusted browser (no code needed, trusted since ${trusted.createdAt.slice(0, 10)})`,
      ...whoAndWhere(req, user),
    })
    // After the login's own transaction, which holds the user row.
    later(() => noteLoginPlace(req.payload, user, place))
    return user
  }

  const rest = sessions.filter((s) => s.id !== session.id)
  await setSessions(req.payload, user.id, rest, req)
  user.sessions = rest

  const entry: Pending = {
    sid: session.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    ip: place.ip,
    attempts: 0,
  }
  const data: Partial<TwoFactor> = { pending: [...live(rec?.pending), entry].slice(-5) }
  if (!hasTwoFactor(rec) && !rec?.setupSecret) data.setupSecret = seal(newSecret())
  if (viaReset) data.trusted = []
  await saveRecord(req.payload, user.id, rec, data, req)

  auditLater(req.payload, {
    action: viaReset ? 'password.reset' : 'login.password-ok',
    summary: `${user.email}: ${viaReset ? 'password reset, waiting for two-factor code' : 'password accepted, waiting for two-factor code'}${hasTwoFactor(rec) ? '' : ' (setup)'}`,
    ...whoAndWhere(req, user),
  })
  return user
}

// --- Reading the waiting login from the cookie ------------------------------------------------

// Same cookie rule as Payload's own (auth/extractJWT): from an allowed origin, or, without an
// Origin header, only same-site browser requests. A cross-site page can't use the cookie.
function cookieAllowed(payload: Payload, headers: Headers) {
  const csrf = payload.config.csrf
  const origin = headers.get('origin')
  if (origin) return csrf.length === 0 || csrf.includes(origin)
  if (csrf.length === 0) return true
  return ['same-origin', 'same-site', 'none'].includes(headers.get('sec-fetch-site') ?? '')
}

function tokenFrom(payload: Payload, headers: Headers) {
  const cookie = parseCookies(headers).get(`${payload.config.cookiePrefix}-token`)
  if (cookie) return cookieAllowed(payload, headers) ? cookie : null
  const auth = headers.get('authorization') ?? ''
  const m = /^(?:JWT|Bearer)\s+(.+)$/i.exec(auth)
  return m?.[1] ?? null
}

export type PendingLogin = { user: User; rec: TwoFactor; pending: Pending; needsSetup: boolean }

/** The login waiting for a code on this browser, if any. */
export async function readPending(payload: Payload, headers: Headers): Promise<PendingLogin | null> {
  const token = tokenFrom(payload, headers)
  if (!token) return null
  let claims: Record<string, unknown>
  try {
    claims = (await jwtVerify(token, new TextEncoder().encode(payload.secret))).payload
  } catch {
    return null
  }
  if (claims.collection !== 'users' || typeof claims.sid !== 'string' || typeof claims.id !== 'number') return null
  const rec = await recordFor(payload, claims.id)
  const pending = live(rec?.pending).find((p) => p.sid === claims.sid)
  if (!rec || !pending) return null
  const user = await payload.findByID({ collection: 'users', id: claims.id, depth: 0, disableErrors: true })
  if (!user) return null
  return { user, rec, pending, needsSetup: !hasTwoFactor(rec) || Boolean(pending.recovered) }
}

/** The secret to show as a QR code while setting up. */
export const setupSecretOf = (login: PendingLogin) => (login.rec.setupSecret ? unseal(login.rec.setupSecret) : null)

// --- The code -------------------------------------------------------------------------------

export type VerifyResult =
  | { ok: true; recoveryCodes?: string[] }
  | { setup: true }
  | { error: 'expired' | 'restart' | 'blocked' | 'wrong'; left?: number }

/** `setCookie` (when the browser asked to be trusted) goes into the response header, never the reply body. */
export async function verifyCode(payload: Payload, req: PayloadRequest, code: string, trust = false): Promise<VerifyResult & { setCookie?: string }> {
  const login = await readPending(payload, req.headers)
  if (!login) return { error: 'expired' }
  const { user, rec, pending, needsSetup } = login
  const others = live(rec.pending).filter((p) => p.sid !== pending.sid)
  const failures = recentFailures(rec.failures)
  const place = placeOf(req.headers)
  const who = whoAndWhere(req, user)
  if (failures.length >= MAX_FAILURES_PER_HOUR) return { error: 'blocked' }

  const now = Date.now()
  let step: number | null = null
  let freshCodes: string[] | undefined
  const data: Partial<TwoFactor> = {}

  if (needsSetup) {
    const secret = setupSecretOf(login)
    step = secret ? checkCode(secret, code, now) : null
    if (step !== null) {
      freshCodes = newRecoveryCodes()
      Object.assign(data, { secret: rec.setupSecret, setupSecret: null, enabledAt: new Date(now).toISOString(), recoveryCodes: freshCodes.map(hashRecovery) })
    }
  } else if (looksLikeRecovery(code)) {
    const hashes = Array.isArray(rec.recoveryCodes) ? (rec.recoveryCodes as string[]) : []
    const h = hashRecovery(code)
    if (hashes.includes(h)) {
      // Phone lost: this login now sets up a new app before it can finish.
      await saveRecord(payload, user.id, rec, {
        recoveryCodes: hashes.filter((x) => x !== h),
        setupSecret: seal(newSecret()),
        pending: [...others, { ...pending, recovered: true, attempts: 0 }],
        // The lost phone may have gone with a trusted laptop.
        trusted: [],
      })
      await audit(payload, { action: 'login.recovery-code', summary: `${user.email} used a recovery code (${hashes.length - 1} left) and is setting up a new authenticator app`, ...who })
      await securityAlert(payload, 'recovery-used', place, user.email, [`Recovery codes left: ${hashes.length - 1}`])
      return { setup: true }
    }
  } else {
    step = rec.secret ? checkCode(unseal(rec.secret), code, now, rec.lastStep ?? -1) : null
  }

  if (step === null) {
    const attempts = pending.attempts + 1
    const nowFailures = [...failures, now]
    const restart = attempts >= MAX_TRIES_PER_LOGIN
    const blocked = nowFailures.length >= MAX_FAILURES_PER_HOUR
    await saveRecord(payload, user.id, rec, { failures: nowFailures, pending: restart || blocked ? others : [...others, { ...pending, attempts }] })
    await audit(payload, {
      action: blocked ? 'login.code-blocked' : 'login.code-failed',
      summary: `${user.email}: wrong two-factor code${blocked ? ', code entry paused for an hour' : restart ? ', login cancelled after 5 tries' : ''}`,
      ...who,
    })
    await securityAlert(payload, blocked ? 'code-blocked' : 'code-failed', place, user.email)
    if (blocked) return { error: 'blocked' }
    if (restart) return { error: 'restart' }
    return { error: 'wrong', left: MAX_TRIES_PER_LOGIN - attempts }
  }

  // Right code: the session goes back on the account, and the cookie the browser already has works.
  const fresh = await rawUser(payload, user.id)
  const sessions = (fresh?.sessions ?? []).filter((s) => new Date(s.expiresAt).getTime() > now)
  await setSessions(payload, user.id, [...sessions, { id: pending.sid, createdAt: pending.createdAt, expiresAt: pending.expiresAt }])
  let trustToken: string | undefined
  if (trust) {
    trustToken = randomBytes(32).toString('base64url')
    const device: Trusted = {
      hash: hashToken(trustToken),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TRUST_DAYS * 24 * HOUR).toISOString(),
      ip: place.ip,
      agent: req.headers.get('user-agent')?.slice(0, 200) ?? undefined,
    }
    data.trusted = [...liveTrusted(rec.trusted), device].slice(-MAX_TRUSTED)
  }
  await saveRecord(payload, user.id, rec, { ...data, lastStep: step, pending: others, failures: [] })

  if (freshCodes) {
    await audit(payload, { action: '2fa.enabled', summary: `${user.email} set up two-factor login${pending.recovered ? ' on a new phone (after a recovery code)' : ''}`, ...who })
    await securityAlert(payload, '2fa-enabled', place, user.email)
  }
  await audit(payload, { action: 'login.success', summary: `${user.email} logged in${trust ? ` and trusted this browser for ${TRUST_DAYS} days` : ''}`, ...who })
  await noteLoginPlace(payload, user, place)
  return { ok: true, ...(freshCodes ? { recoveryCodes: freshCodes } : {}), ...(trustToken ? { setCookie: trustCookie(payload, user.id, trustToken) } : {}) }
}

export async function cancelPending(payload: Payload, req: PayloadRequest) {
  const login = await readPending(payload, req.headers)
  if (!login) return
  await saveRecord(payload, login.user.id, login.rec, { pending: live(login.rec.pending).filter((p) => p.sid !== login.pending.sid) })
  await audit(payload, { action: 'login.cancelled', summary: `${login.user.email}: login cancelled at the two-factor step`, ...whoAndWhere(req, login.user) })
}

/** POST /api/users/two-factor  { action: 'verify', code, trust? } | { action: 'cancel' } */
export const twoFactorEndpoint: Endpoint = {
  path: '/two-factor',
  method: 'post',
  handler: async (req) => {
    const body = (await req.json?.().catch(() => null)) as { action?: string; code?: string; trust?: boolean } | null
    if (body?.action === 'cancel') {
      await cancelPending(req.payload, req)
      const cookie = generateExpiredPayloadCookie({
        collectionAuthConfig: req.payload.collections.users.config.auth,
        cookiePrefix: req.payload.config.cookiePrefix,
      })
      return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie } })
    }
    const code = typeof body?.code === 'string' ? body.code.slice(0, 32) : ''
    if (!code.trim()) return Response.json({ error: 'wrong' }, { status: 400 })
    const { setCookie, ...result } = await verifyCode(req.payload, req, code, body?.trust === true)
    const status = 'error' in result ? (result.error === 'wrong' ? 400 : result.error === 'blocked' ? 429 : 401) : 200
    const headers = new Headers({ 'Cache-Control': 'no-store' })
    if (setCookie) headers.append('Set-Cookie', setCookie)
    return Response.json(result, { status, headers })
  },
}

// --- Bookkeeping ------------------------------------------------------------------------------

export const auditLogout: CollectionAfterLogoutHook = ({ req }) => {
  const user = req.user as User | null
  if (user) auditLater(req.payload, { action: 'logout', summary: `${user.email} logged out`, ...whoAndWhere(req) })
}

/** A deleted account's two-factor record goes first (its `user` is required, so the user row can't go while it points there). */
export const dropTwoFactor: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.delete({ collection: 'two-factor', where: { user: { equals: id } }, req })
}

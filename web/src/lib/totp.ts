import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'

/**
 * Authenticator-app codes (TOTP, RFC 6238): 6 digits, a new one every 30 seconds, from a shared
 * secret the app got by scanning a QR code. Works with Google Authenticator, Microsoft
 * Authenticator, 1Password, Authy and the like. Plus one-time recovery codes for a lost phone.
 */

const STEP_SECONDS = 30
const DIGITS = 6
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch)
    if (i < 0) throw new Error('Not base32')
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** A new 160-bit secret, base32 as the apps expect it. */
export const newSecret = () => base32Encode(randomBytes(20))

export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS)

export function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = mac[mac.length - 1]! & 15
  const n = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS
  return String(n).padStart(DIGITS, '0')
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/**
 * The time step a code belongs to (this one, or one step either side for a phone clock that's a
 * little off), or null. A step at or before `lastStep` is refused, so a code works only once.
 */
export function checkCode(secret: string, code: string, now = Date.now(), lastStep = -1): number | null {
  const digits = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(digits)) return null
  const current = stepAt(now)
  for (const step of [current - 1, current, current + 1]) {
    if (step > lastStep && same(codeAt(secret, step), digits)) return step
  }
  return null
}

/** What the QR code holds: the app shows "Blingiton (email)". */
export function otpauthUrl(secret: string, account: string, issuer = 'Blingiton') {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
}

/** The secret in groups of four, for typing into an app by hand. */
export const spaced = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim()

// Recovery codes: 10 of them, `xxxx-xxxx`, letters and digits that can't be confused (no 0/o, 1/l).
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function newRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(8)
    const chars = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('')
    return `${chars.slice(0, 4)}-${chars.slice(4)}`
  })
}

/** Typed in any case, with or without the dash. */
export const normalizeRecovery = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, '')

export const looksLikeRecovery = (code: string) => normalizeRecovery(code).length === 8 && !/^\d+$/.test(normalizeRecovery(code))

/** Only hashes are stored; the codes themselves are shown once. */
export const hashRecovery = (code: string) => createHash('sha256').update(`blingiton-recovery:${normalizeRecovery(code)}`).digest('hex')

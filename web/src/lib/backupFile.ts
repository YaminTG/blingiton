import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from 'crypto'
import { createReadStream, createWriteStream } from 'fs'
import { appendFile, open, stat, writeFile } from 'fs/promises'
import { pipeline } from 'stream/promises'

/**
 * Backup files (src/lib/backup.ts): a pg_dump archive encrypted with AES-256-GCM.
 *
 *   "BLBK1\n" | salt (16) | iv (12) | ciphertext … | auth tag (16)
 *
 * The key is derived from BACKUP_KEY with scrypt and the file's own salt. BACKUP_KEY is kept apart
 * from the backups (and from PAYLOAD_SECRET), so a leaked bucket is unreadable. The auth tag means a
 * damaged or altered file fails to decrypt instead of restoring garbage. Pure Node, no database.
 */

const MAGIC = Buffer.from('BLBK1\n')
const SALT = 16
const IV = 12
const TAG = 16
const HEADER = MAGIC.length + SALT + IV

function deriveKey(secret: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(secret, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

export async function sha256File(file: string) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

/** Encrypts `src` into `dest`; returns the encrypted file's size and SHA-256. */
export async function encryptFile(src: string, dest: string, secret: string) {
  if (secret.length < 24) throw new Error('BACKUP_KEY is too short (use at least 24 random characters).')
  const salt = randomBytes(SALT)
  const iv = randomBytes(IV)
  const cipher = createCipheriv('aes-256-gcm', await deriveKey(secret, salt), iv)
  await writeFile(dest, Buffer.concat([MAGIC, salt, iv]))
  await pipeline(createReadStream(src), cipher, createWriteStream(dest, { flags: 'a' }))
  await appendFile(dest, cipher.getAuthTag())
  return { size: (await stat(dest)).size, sha256: await sha256File(dest) }
}

/** Decrypts `src` into `dest`. Throws when the key is wrong or the file was damaged or changed. */
export async function decryptFile(src: string, dest: string, secret: string) {
  const { size } = await stat(src)
  if (size <= HEADER + TAG) throw new Error('This is not a Blingiton backup (file too small).')
  const fh = await open(src, 'r')
  const head = Buffer.alloc(HEADER)
  const tag = Buffer.alloc(TAG)
  try {
    await fh.read(head, 0, HEADER, 0)
    await fh.read(tag, 0, TAG, size - TAG)
  } finally {
    await fh.close()
  }
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('This is not a Blingiton backup (unknown format).')
  const salt = head.subarray(MAGIC.length, MAGIC.length + SALT)
  const iv = head.subarray(MAGIC.length + SALT)
  const decipher = createDecipheriv('aes-256-gcm', await deriveKey(secret, salt), iv)
  decipher.setAuthTag(tag)
  try {
    await pipeline(createReadStream(src, { start: HEADER, end: size - TAG - 1 }), decipher, createWriteStream(dest))
  } catch (err) {
    if (err instanceof Error && /authenticate/i.test(err.message)) {
      throw new Error('The backup could not be decrypted: wrong BACKUP_KEY, or the file is damaged or was changed.')
    }
    throw err
  }
}

// --- Names and retention -----------------------------------------------------------------------

export const backupName = (at: Date) => `blingiton-${at.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')}.dump.enc`

/** The time in a backup's name (or null for files that aren't ours). */
export function backupTime(name: string): Date | null {
  const m = /blingiton-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.dump\.enc$/.exec(name)
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) : null
}

/** Which backups to delete: older than `keepDays`, but never the newest `keepMin`. */
export function toDelete<T extends { key: string; at: Date }>(list: T[], now: Date, keepDays: number, keepMin = 7): T[] {
  const cutoff = now.getTime() - keepDays * 86400_000
  return [...list]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(keepMin)
    .filter((b) => b.at.getTime() < cutoff)
}

// --- Database URLs -----------------------------------------------------------------------------

/** pg_dump needs a direct connection: Neon's pooled host (…-pooler.…) is swapped for the direct one. */
export function directUrl(url: string) {
  try {
    const u = new URL(url)
    if (/\.neon\.tech$/.test(u.hostname)) u.hostname = u.hostname.replace('-pooler.', '.')
    return u.toString()
  } catch {
    return url
  }
}

/** Two URLs pointing at the same database (host, port and name), ignoring user and options. */
export function sameDatabase(a: string, b: string) {
  try {
    const x = new URL(directUrl(a))
    const y = new URL(directUrl(b))
    return x.hostname === y.hostname && (x.port || '5432') === (y.port || '5432') && x.pathname === y.pathname
  } catch {
    return a === b
  }
}

/** The URL without its password (for the command line) and the password (for PGPASSWORD). */
export function splitPassword(url: string) {
  const u = new URL(url)
  const password = decodeURIComponent(u.password)
  u.password = ''
  return { url: u.toString(), password }
}

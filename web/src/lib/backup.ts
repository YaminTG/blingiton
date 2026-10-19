import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { spawn } from 'child_process'
import { createReadStream, createWriteStream } from 'fs'
import { copyFile, mkdir, mkdtemp, readdir, rm, stat } from 'fs/promises'
import os from 'os'
import path from 'path'
import pg from 'pg'
import type { Payload, TaskConfig } from 'payload'
import type { Readable } from 'stream'
import { pipeline } from 'stream/promises'

import { audit } from './audit'
import { backupName, backupTime, decryptFile, directUrl, encryptFile, sameDatabase, splitPassword, toDelete } from './backupFile'
import { securityAlert } from './loginAlerts'
import { isProduction } from './site'

/**
 * Encrypted database backups and restore tests.
 *
 * Every night the `backup` job runs pg_dump (custom format), encrypts the archive with BACKUP_KEY
 * (src/lib/backupFile.ts) and uploads it to a private S3-compatible bucket (BACKUP_S3_BUCKET, else
 * S3_BUCKET, under `backups/`), or to BACKUP_DIR on the server when there's no bucket (development).
 * Backups older than BACKUP_KEEP_DAYS (30) are deleted, but the newest 7 always stay.
 *
 * Every week the `restore-test` job downloads the newest backup, decrypts it (which proves the key
 * and the file are good) and reads its table of contents with pg_restore. With
 * RESTORE_TEST_DATABASE_URL (an empty, throwaway database) it restores the whole backup there and
 * checks orders, products, customers and users all came back.
 *
 * Results go to the `security-state` global and the audit log; failures email the team. The
 * security page shows them. Needs pg_dump / pg_restore on the server (PG_BIN_DIR if not on PATH),
 * the same major version as the database or newer. `scripts/backup.ts` runs all of this by hand
 * and restores. Runbook: docs/RECOVERY.md.
 */

export type BackupRun = { at: string; ok: boolean; by: string; key?: string; size?: number; sha256?: string; ms: number; where: 's3' | 'local'; error?: string }
export type RestoreRun = {
  at: string
  ok: boolean
  by: string
  key?: string
  backupAt?: string
  mode: 'read' | 'full'
  entries?: number
  tables?: number
  counts?: Record<string, { restored: number; expected: number }>
  ms: number
  error?: string
}

const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS) || 30
const CHECKED_TABLES = { orders: 'orders', products: 'products', customers: 'customers', users: 'users' } as const

// --- Where backups live ------------------------------------------------------------------------

type Stored = { key: string; size: number; at: Date }
type Store = {
  where: 's3' | 'local'
  label: string
  put: (key: string, file: string) => Promise<void>
  list: () => Promise<Stored[]>
  get: (key: string, file: string) => Promise<void>
  remove: (key: string) => Promise<void>
}

const backupBucket = () => process.env.BACKUP_S3_BUCKET || process.env.S3_BUCKET || ''

function s3Store(bucket: string): Store {
  const prefix = (process.env.BACKUP_S3_PREFIX ?? 'backups/').replace(/^\/+/, '')
  const client = new S3Client({
    endpoint: process.env.BACKUP_S3_ENDPOINT || process.env.S3_ENDPOINT || undefined,
    region: process.env.BACKUP_S3_REGION || process.env.S3_REGION || 'auto',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || '',
    },
  })
  return {
    where: 's3',
    label: `s3://${bucket}/${prefix}`,
    put: async (key, file) => {
      await new Upload({ client, params: { Bucket: bucket, Key: prefix + key, Body: createReadStream(file), ContentType: 'application/octet-stream' } }).done()
    },
    list: async () => {
      const out: Stored[] = []
      let token: string | undefined
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }))
        for (const o of page.Contents ?? []) {
          const key = (o.Key ?? '').slice(prefix.length)
          const at = backupTime(key)
          if (at) out.push({ key, size: o.Size ?? 0, at })
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (token)
      return out
    },
    get: async (key, file) => {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: prefix + key }))
      if (!res.Body) throw new Error(`Backup ${key} is empty in the bucket.`)
      await pipeline(res.Body as Readable, createWriteStream(file))
    },
    remove: async (key) => {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: prefix + key }))
    },
  }
}

function localStore(): Store {
  const dir = path.resolve(process.env.BACKUP_DIR || 'backups')
  return {
    where: 'local',
    label: dir,
    put: async (key, file) => {
      await mkdir(dir, { recursive: true })
      await copyFile(file, path.join(dir, key))
    },
    list: async () => {
      const names = await readdir(dir).catch(() => [] as string[])
      const out: Stored[] = []
      for (const key of names) {
        const at = backupTime(key)
        if (at) out.push({ key, size: (await stat(path.join(dir, key))).size, at })
      }
      return out
    },
    get: async (key, file) => copyFile(path.join(dir, key), file),
    remove: async (key) => rm(path.join(dir, key), { force: true }),
  }
}

export const backupStore = (): Store => (backupBucket() ? s3Store(backupBucket()) : localStore())

export type BackupProblem = 'no-key' | 'short-key' | 'on-server' | 'shared-bucket'

export const BACKUP_PROBLEM_TEXT: Record<BackupProblem, string> = {
  'no-key': 'BACKUP_KEY is not set, so no backups are made.',
  'short-key': 'BACKUP_KEY is shorter than 24 characters.',
  'on-server': 'Backups are kept on the server itself (no BACKUP_S3_BUCKET): they would be lost with it.',
  'shared-bucket': 'Backups share the photo bucket (S3_BUCKET). Use a separate private bucket in BACKUP_S3_BUCKET, with versioning or object lock on.',
}

/** Problems with the backup setup itself, for the security page. Empty when everything is in place. */
export function backupSetupProblems(): BackupProblem[] {
  const problems: BackupProblem[] = []
  if (!process.env.BACKUP_KEY) problems.push('no-key')
  else if (process.env.BACKUP_KEY.length < 24) problems.push('short-key')
  if (!backupBucket()) {
    if (isProduction) problems.push('on-server')
  } else if (!process.env.BACKUP_S3_BUCKET && process.env.S3_BUCKET) {
    problems.push('shared-bucket')
  }
  return problems
}

// --- pg_dump / pg_restore ----------------------------------------------------------------------

const bin = (name: string) => (process.env.PG_BIN_DIR ? path.join(process.env.PG_BIN_DIR, name) : name)

/** Runs a Postgres tool with the password in PGPASSWORD (not on the command line). Resolves with stdout. */
function runPg(tool: 'pg_dump' | 'pg_restore', args: string[], dbUrl?: string): Promise<string> {
  const env = { ...process.env }
  const finalArgs = [...args]
  if (dbUrl) {
    const { url, password } = splitPassword(dbUrl)
    if (password) env.PGPASSWORD = password
    finalArgs.push(`--dbname=${url}`)
  }
  return new Promise((resolve, reject) => {
    const child = spawn(bin(tool), finalArgs, { env, windowsHide: true })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err = (err + d).slice(-4000)))
    child.on('error', (e: NodeJS.ErrnoException) =>
      reject(new Error(e.code === 'ENOENT' ? `${tool} is not installed on this server (install the PostgreSQL client tools, or set PG_BIN_DIR).` : e.message)),
    )
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${tool} failed (exit ${code}): ${err.trim().split('\n').slice(-3).join(' ')}`))))
  })
}

const liveDbUrl = () => directUrl(process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL || '')

// --- Bookkeeping -------------------------------------------------------------------------------

async function remember(payload: Payload, field: 'backups' | 'restoreTests', entry: BackupRun | RestoreRun, max: number) {
  const state = await payload.findGlobal({ slug: 'security-state', depth: 0 })
  const list = Array.isArray(state[field]) ? (state[field] as unknown[]) : []
  await payload.updateGlobal({ slug: 'security-state', data: { [field]: [entry, ...list].slice(0, max) }, depth: 0 })
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500)
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`

// --- Backup ------------------------------------------------------------------------------------

export async function runBackup(payload: Payload, by = 'schedule'): Promise<BackupRun> {
  const started = Date.now()
  const store = backupStore()
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'blingiton-backup-'))
  let run: BackupRun
  try {
    const secret = process.env.BACKUP_KEY
    if (!secret) throw new Error('BACKUP_KEY is not set.')
    const db = liveDbUrl()
    if (!db) throw new Error('DATABASE_URL is not set.')
    const dump = path.join(tmp, 'db.dump')
    await runPg('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--file=${dump}`], db)
    const at = new Date()
    const key = backupName(at)
    const enc = path.join(tmp, key)
    const { size, sha256 } = await encryptFile(dump, enc, secret)
    await store.put(key, enc)
    for (const old of toDelete(await store.list(), at, KEEP_DAYS)) await store.remove(old.key)
    run = { at: at.toISOString(), ok: true, by, key, size, sha256, ms: Date.now() - started, where: store.where }
  } catch (err) {
    run = { at: new Date().toISOString(), ok: false, by, ms: Date.now() - started, where: store.where, error: message(err) }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => null)
  }

  await remember(payload, 'backups', run, 30).catch((err) => payload.logger.error({ err }, 'Could not record the backup'))
  await audit(payload, {
    action: run.ok ? 'backup.ok' : 'backup.failed',
    summary: run.ok ? `Database backup made: ${run.key} (${mb(run.size ?? 0)}, ${store.label})` : `Database backup failed: ${run.error}`,
    detail: { ...run },
  })
  if (!run.ok) await securityAlert(payload, 'backup-failed', null, null, [`Error: ${run.error}`]).catch(() => null)
  return run
}

// --- Restore test ------------------------------------------------------------------------------

async function countRows(dbUrl: string) {
  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()
  try {
    const counts: Record<string, number> = {}
    for (const [name, table] of Object.entries(CHECKED_TABLES)) {
      const res = await client.query<{ n: string }>(`select count(*)::text as n from "${table}"`)
      counts[name] = Number(res.rows[0]?.n ?? 0)
    }
    return counts
  } finally {
    await client.end()
  }
}

/** Downloads and decrypts a backup into `dest` (a .dump file for pg_restore). `key` defaults to the newest. */
export async function fetchBackup(key: string | 'latest', dest: string) {
  const secret = process.env.BACKUP_KEY
  if (!secret) throw new Error('BACKUP_KEY is not set.')
  const store = backupStore()
  const list = (await store.list()).sort((a, b) => b.at.getTime() - a.at.getTime())
  const pick = key === 'latest' ? list[0] : list.find((b) => b.key === key)
  if (!pick) throw new Error(key === 'latest' ? `No backups found in ${store.label}.` : `Backup ${key} not found in ${store.label}.`)
  const enc = `${dest}.enc`
  try {
    await store.get(pick.key, enc)
    await decryptFile(enc, dest, secret)
  } finally {
    await rm(enc, { force: true }).catch(() => null)
  }
  return pick
}

/** Restores a decrypted .dump into `target`, replacing what's there. */
export async function restoreInto(dump: string, target: string) {
  await runPg('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', dump], directUrl(target))
}

export async function runRestoreTest(payload: Payload, by = 'schedule'): Promise<RestoreRun> {
  const started = Date.now()
  const testDb = process.env.RESTORE_TEST_DATABASE_URL || ''
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'blingiton-restore-'))
  let run: RestoreRun = { at: new Date().toISOString(), ok: false, by, mode: testDb ? 'full' : 'read', ms: 0 }
  try {
    if (testDb && sameDatabase(testDb, liveDbUrl())) throw new Error('RESTORE_TEST_DATABASE_URL points at the live database. Refusing to restore over it.')
    const dump = path.join(tmp, 'db.dump')
    const picked = await fetchBackup('latest', dump)
    run = { ...run, key: picked.key, backupAt: picked.at.toISOString() }

    // The archive's table of contents: proves pg_restore can read it.
    const toc = await runPg('pg_restore', ['--list', dump])
    const lines = toc.split('\n').filter((l) => l.trim() && !l.startsWith(';'))
    run.entries = lines.length
    run.tables = lines.filter((l) => / TABLE DATA /.test(l)).length
    if (!run.tables) throw new Error('The backup has no table data.')

    if (testDb) {
      await restoreInto(dump, testDb)
      const restored = await countRows(directUrl(testDb))
      // Everything created before the backup must be there (rows deleted since only lower today's count).
      const counts: RestoreRun['counts'] = {}
      for (const name of Object.keys(CHECKED_TABLES) as (keyof typeof CHECKED_TABLES)[]) {
        const expected = (await payload.count({ collection: name, where: { createdAt: { less_than_equal: picked.at.toISOString() } } })).totalDocs
        counts[name] = { restored: restored[name], expected }
      }
      run.counts = counts
      const short = Object.entries(counts).filter(([, c]) => c.restored < c.expected)
      if (short.length) throw new Error(`Rows missing after restore: ${short.map(([n, c]) => `${n} ${c.restored}/${c.expected}`).join(', ')}`)
    }
    run.ok = true
  } catch (err) {
    run.error = message(err)
  } finally {
    run.ms = Date.now() - started
    await rm(tmp, { recursive: true, force: true }).catch(() => null)
  }

  await remember(payload, 'restoreTests', run, 12).catch((err) => payload.logger.error({ err }, 'Could not record the restore test'))
  const counts = run.counts ? Object.entries(run.counts).map(([n, c]) => `${n} ${c.restored}`).join(', ') : ''
  await audit(payload, {
    action: 'backup.restore-test',
    summary: run.ok
      ? `Restore test passed (${run.mode === 'full' ? `full restore: ${counts}` : `decrypted and read ${run.tables} tables`}) for ${run.key}`
      : `Restore test FAILED: ${run.error}`,
    detail: { ...run },
  })
  if (!run.ok) await securityAlert(payload, 'restore-failed', null, null, [`Error: ${run.error}`]).catch(() => null)
  return run
}

// --- Jobs --------------------------------------------------------------------------------------

// Before BACKUP_KEY is set, development skips quietly; production records a failure and emails.
const skip = () => !process.env.BACKUP_KEY && !isProduction

export const backupTask: TaskConfig<'backup'> = {
  slug: 'backup',
  schedule: [{ cron: '40 1 * * *', queue: 'default' }],
  handler: async ({ req }) => {
    if (!skip()) await runBackup(req.payload)
    return { output: {} }
  },
}

export const restoreTestTask: TaskConfig<'restore-test'> = {
  slug: 'restore-test',
  schedule: [{ cron: '10 3 * * 0', queue: 'default' }],
  handler: async ({ req }) => {
    if (!skip()) await runRestoreTest(req.payload)
    return { output: {} }
  },
}

/** Readable size for the security page. */
export { mb as backupSize }

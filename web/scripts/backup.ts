// Backups by hand (src/lib/backup.ts does the work; the nightly `backup` and weekly `restore-test`
// jobs run the same code). Runbook: docs/RECOVERY.md.
//
//   npx payload run scripts/backup.ts < /dev/null                         list backups and the last results
//   NOW=1  npx payload run scripts/backup.ts < /dev/null                  make a backup now
//   TEST=1 npx payload run scripts/backup.ts < /dev/null                  restore test on the newest backup
//   GET=latest OUT=blingiton.dump npx payload run scripts/backup.ts < /dev/null
//                                                                        download + decrypt a backup (or GET=<file name>)
//   RESTORE=latest TARGET_DATABASE_URL=postgres://… CONFIRM=overwrite npx payload run scripts/backup.ts < /dev/null
//                                                                        replace everything in TARGET with that backup
//
// A real restore: restore into a NEW database first, check it, then point DATABASE_URL at it.
// RESTORE refuses the live DATABASE_URL unless ALLOW_LIVE=1 is also set.

import os from 'os'
import path from 'path'
import { getPayload } from 'payload'

import config from '@payload-config'
import { audit } from '@/lib/audit'
import { BACKUP_PROBLEM_TEXT, backupSetupProblems, backupSize, backupStore, fetchBackup, restoreInto, runBackup, runRestoreTest } from '@/lib/backup'
import { sameDatabase } from '@/lib/backupFile'
import { securityAlert } from '@/lib/loginAlerts'

const payload = await getPayload({ config })
const env = process.env
const runBy = `${os.userInfo().username}@${os.hostname()}`

if (env.NOW) {
  const run = await runBackup(payload, `script (${runBy})`)
  console.log(run.ok ? `Backup made: ${run.key} (${backupSize(run.size ?? 0)}) in ${backupStore().label}` : `Backup FAILED: ${run.error}`)
  process.exit(run.ok ? 0 : 1)
}

if (env.TEST) {
  const run = await runRestoreTest(payload, `script (${runBy})`)
  if (run.ok) {
    console.log(`Restore test passed for ${run.key}: ${run.tables} tables${run.counts ? `, ${Object.entries(run.counts).map(([n, c]) => `${n} ${c.restored}/${c.expected}`).join(', ')}` : ' (read only; set RESTORE_TEST_DATABASE_URL for a full restore)'}`)
  } else console.log(`Restore test FAILED: ${run.error}`)
  process.exit(run.ok ? 0 : 1)
}

if (env.GET) {
  const out = path.resolve(env.OUT || 'blingiton.dump')
  const picked = await fetchBackup(env.GET, out)
  await audit(payload, { action: 'recovery.script', summary: `Backup downloaded and decrypted by ${runBy}: ${picked.key}`, actorEmail: runBy, detail: { key: picked.key } })
  console.log(`Decrypted ${picked.key} to ${out}. Restore it with:\n  pg_restore --clean --if-exists --no-owner --no-privileges --dbname=<new database URL> "${out}"`)
  console.log('Delete the file when you are done: it is the whole database, unencrypted.')
  process.exit(0)
}

if (env.RESTORE) {
  const target = env.TARGET_DATABASE_URL || ''
  if (!target || env.CONFIRM !== 'overwrite') {
    console.error('RESTORE needs TARGET_DATABASE_URL and CONFIRM=overwrite (everything in the target is replaced).')
    process.exit(1)
  }
  if (sameDatabase(target, env.DATABASE_URL || '') && !env.ALLOW_LIVE) {
    console.error('TARGET_DATABASE_URL is the live database. Restore into a new database and switch DATABASE_URL instead, or add ALLOW_LIVE=1.')
    process.exit(1)
  }
  const dump = path.join(os.tmpdir(), `blingiton-restore-${Date.now()}.dump`)
  const picked = await fetchBackup(env.RESTORE, dump)
  await restoreInto(dump, target)
  const host = new URL(target).hostname
  const summary = `Backup ${picked.key} restored into ${host} by ${runBy}`
  await audit(payload, { action: 'recovery.script', summary, actorEmail: runBy, detail: { key: picked.key, host } })
  await securityAlert(payload, 'recovery-script', null, null, [`Run by: ${runBy} (on the server)`, `Done: restored backup ${picked.key} into ${host}`])
  const { rm } = await import('fs/promises')
  await rm(dump, { force: true })
  console.log(summary)
  process.exit(0)
}

const store = backupStore()
const list = (await store.list()).sort((a, b) => b.at.getTime() - a.at.getTime())
console.log(`Backups in ${store.label}: ${list.length}`)
for (const b of list.slice(0, 15)) console.log(`  ${b.key}  ${backupSize(b.size)}`)
const state = await payload.findGlobal({ slug: 'security-state', depth: 0 })
const lastTest = Array.isArray(state.restoreTests) ? (state.restoreTests[0] as { at: string; ok: boolean; error?: string } | undefined) : undefined
console.log(`Last restore test: ${lastTest ? `${lastTest.at} ${lastTest.ok ? 'passed' : `FAILED: ${lastTest.error}`}` : 'never'}`)
for (const p of backupSetupProblems()) console.log(`! ${BACKUP_PROBLEM_TEXT[p]}`)
console.log('\nNOW=1 backs up, TEST=1 tests a restore, GET / RESTORE fetch or restore one; see the top of this file.')
process.exit(0)

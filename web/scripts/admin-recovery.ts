// Emergency admin recovery, run on the server by someone with access to it (and so to the database).
// For when a teammate loses their phone and their recovery codes, forgets their password, gets
// locked out, or every admin is stuck. Every action is written to the audit log and emailed to the team.
//
//   npx payload run scripts/admin-recovery.ts < /dev/null                    list accounts (2FA, locked, sessions)
//   EMAIL=a@b.com RESET_2FA=1    npx payload run scripts/admin-recovery.ts < /dev/null   remove 2FA; the next login sets up a new app
//   EMAIL=a@b.com NEW_PASSWORD=1 npx payload run scripts/admin-recovery.ts < /dev/null   random new password, printed once
//   EMAIL=a@b.com UNLOCK=1       npx payload run scripts/admin-recovery.ts < /dev/null   clear a lock from wrong passwords
//   EMAIL=a@b.com LOGOUT=1       npx payload run scripts/admin-recovery.ts < /dev/null   end every session of that account
//   EMAIL=a@b.com NAME="Ayah" CREATE_ADMIN=1 npx payload run scripts/admin-recovery.ts < /dev/null   new admin, random password
// Flags combine (e.g. RESET_2FA=1 NEW_PASSWORD=1). RESET_2FA and NEW_PASSWORD also end every session.

import { randomBytes } from 'crypto'
import os from 'os'
import { getPayload } from 'payload'

import config from '@payload-config'
import { audit } from '@/lib/audit'
import { securityAlert } from '@/lib/loginAlerts'
import { hasTwoFactor, recordFor } from '@/lib/twoFactor'

const payload = await getPayload({ config })
const env = process.env
const email = env.EMAIL?.trim().toLowerCase()
const runBy = `${os.userInfo().username}@${os.hostname()}`

const newPassword = () => randomBytes(18).toString('base64url')

if (!email) {
  const { docs } = await payload.find({ collection: 'users', limit: 0, pagination: false, depth: 0, sort: 'email', showHiddenFields: true })
  console.log('Accounts:')
  for (const u of docs) {
    const rec = await recordFor(payload, u.id)
    const locked = u.lockUntil && new Date(u.lockUntil).getTime() > Date.now()
    const sessions = (u as { sessions?: { expiresAt: string }[] }).sessions?.filter((s) => new Date(s.expiresAt).getTime() > Date.now()).length ?? 0
    const codes = Array.isArray(rec?.recoveryCodes) ? rec.recoveryCodes.length : 0
    console.log(`  ${u.email}  ${u.role}  2FA: ${hasTwoFactor(rec) ? `on (${codes} recovery codes left)` : 'not set up'}${locked ? '  LOCKED' : ''}  sessions: ${sessions}`)
  }
  console.log('\nSet EMAIL and a flag to change an account; see the top of this file.')
  process.exit(0)
}

const done: string[] = []
let password: string | null = null

let user = (await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0 })).docs[0]

if (env.CREATE_ADMIN) {
  if (user) {
    console.error(`${email} already exists. Use NEW_PASSWORD=1 / RESET_2FA=1 on it instead.`)
    process.exit(1)
  }
  password = newPassword()
  user = await payload.create({ collection: 'users', data: { email, name: env.NAME?.trim() || email, role: 'admin', password } })
  done.push('created a new admin account')
}

if (!user) {
  console.error(`No account with the email ${email}. Run without EMAIL to list accounts.`)
  process.exit(1)
}

if (env.RESET_2FA) {
  await payload.delete({ collection: 'two-factor', where: { user: { equals: user.id } } })
  done.push('removed two-factor login (the next login sets up a new authenticator app)')
}

if (env.NEW_PASSWORD) {
  password = newPassword()
  await payload.update({ collection: 'users', id: user.id, data: { password } })
  done.push('set a new random password')
}

if (env.UNLOCK || env.NEW_PASSWORD) {
  await payload.db.updateOne({ collection: 'users', id: user.id, data: { loginAttempts: 0, lockUntil: null }, returning: false })
  done.push('cleared any lock from wrong passwords')
}

if (env.LOGOUT || env.RESET_2FA || env.NEW_PASSWORD) {
  await payload.db.updateOne({ collection: 'users', id: user.id, data: { sessions: [] }, returning: false })
  const rec = await recordFor(payload, user.id)
  if (rec) await payload.update({ collection: 'two-factor', id: rec.id, data: { pending: [] } })
  done.push('ended every session')
}

if (!done.length) {
  console.error('Nothing to do: add RESET_2FA=1, NEW_PASSWORD=1, UNLOCK=1, LOGOUT=1 or CREATE_ADMIN=1.')
  process.exit(1)
}

const summary = `Recovery script (${runBy}) on ${user.email}: ${done.join('; ')}`
await audit(payload, { action: 'recovery.script', summary, actorEmail: runBy, target: `User #${user.id} “${user.name}”`, detail: { email: user.email, actions: done } })
await securityAlert(payload, 'recovery-script', null, user.email, [`Run by: ${runBy} (on the server)`, ...done.map((d) => `Done: ${d}`)])

console.log(summary)
if (password) console.log(`\nNew password for ${user.email} (shown once, share it privately and change it after logging in):\n  ${password}`)
process.exit(0)

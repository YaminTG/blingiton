import type { CollectionConfig } from 'payload'

import { l } from '@/fields/label'

// Each admin account's two-factor state (src/lib/twoFactor.ts). Kept apart from the user record
// so the secret never travels with the logged-in user to the browser. Server-only: no access at
// all through the admin or the API.
export const TwoFactor: CollectionConfig = {
  slug: 'two-factor',
  labels: { singular: l('Two-factor record', 'سجل التحقق بخطوتين'), plural: l('Two-factor records', 'سجلات التحقق بخطوتين') },
  admin: { hidden: true },
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, unique: true, index: true },
    // Authenticator secret, encrypted with a key from PAYLOAD_SECRET. Set once a code from the app is confirmed.
    { name: 'secret', type: 'text' },
    { name: 'enabledAt', type: 'date' },
    // Newest 30-second step used, so a code can't be used twice.
    { name: 'lastStep', type: 'number' },
    // SHA-256 hashes of the unused recovery codes.
    { name: 'recoveryCodes', type: 'json' },
    // A secret being set up (shown as a QR code), encrypted, until the first code confirms it.
    { name: 'setupSecret', type: 'text' },
    // Logins that passed the password and are waiting for a code: [{ sid, createdAt, expiresAt, ip, attempts, recovered }].
    { name: 'pending', type: 'json' },
    // Times of recent wrong codes, for the per-account limit.
    { name: 'failures', type: 'json' },
    // Browsers that skip the code for 30 days: [{ hash, createdAt, expiresAt, lastUsedAt, ip, agent }]. Only the token's hash is kept.
    { name: 'trusted', type: 'json' },
  ],
}

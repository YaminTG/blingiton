import type { GlobalConfig } from 'payload'

import { admins, isAdmin } from '@/access'
import { l } from '@/fields/label'
import { audit, whoAndWhere } from '@/lib/audit'
import type { User } from '@/payload-types'

// What the security page (components/admin/Security.tsx) remembers: the last backups and restore
// tests (src/lib/backup.ts) and how far the team has reviewed the security events. Written only by
// the server; admins can read it, nobody can edit it through the admin or the API.
export const SecurityState: GlobalConfig = {
  slug: 'security-state',
  label: l('Security state', 'حالة الأمان'),
  admin: { hidden: true },
  access: { read: admins, update: () => false },
  endpoints: [
    // POST /api/globals/security-state/reviewed (the security page's "Mark all reviewed" form).
    {
      path: '/reviewed',
      method: 'post',
      handler: async (req) => {
        if (!isAdmin(req.user)) return Response.json({ error: 'forbidden' }, { status: 403 })
        const by = (req.user as User).name || req.user!.email
        await req.payload.updateGlobal({ slug: 'security-state', data: { reviewedUntil: new Date().toISOString(), reviewedBy: by }, depth: 0 })
        await audit(req.payload, { action: 'security.reviewed', summary: `${by} marked the security events as reviewed`, ...whoAndWhere(req) })
        return new Response(null, { status: 303, headers: { Location: `${req.payload.config.routes.admin}/security` } })
      },
    },
  ],
  fields: [
    // Events up to this time were marked reviewed on the security page.
    { name: 'reviewedUntil', type: 'date' },
    { name: 'reviewedBy', type: 'text' },
    // Newest first: [{ at, ok, key, size, sha256, ms, where, error? }], the last 30.
    { name: 'backups', type: 'json' },
    // Newest first: [{ at, ok, key, backupAt, mode, tables?, counts?, ms, error? }], the last 12.
    { name: 'restoreTests', type: 'json' },
  ],
}

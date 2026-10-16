import type { CollectionConfig } from 'payload'

import { admins, adminsField, adminsOrSelf } from '@/access'
import { l } from '@/fields/label'
import { alertOnFailedLogin, alertOnNewPlace, alertOnPasswordReset } from '@/lib/loginAlerts'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role'],
    group: l('Team', 'الفريق'),
  },
  // 5 wrong passwords lock the account for 15 minutes.
  auth: { maxLoginAttempts: 5, lockTime: 15 * 60 * 1000 },
  hooks: { afterError: [alertOnFailedLogin], afterLogin: [alertOnNewPlace], afterForgotPassword: [alertOnPasswordReset] },
  access: {
    // The very first account is created through /admin/create-first-user, which skips these rules.
    create: admins,
    read: adminsOrSelf,
    update: adminsOrSelf,
    delete: admins,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'admin',
      saveToJWT: true,
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Staff', value: 'staff' },
      ],
      access: { update: adminsField },
    },
    // Countries (or IPs) this account has logged in from; a new one emails the shop (src/lib/loginAlerts.ts).
    { name: 'loginPlaces', type: 'json', admin: { hidden: true }, access: { update: () => false } },
  ],
}

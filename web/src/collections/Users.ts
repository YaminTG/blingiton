import type { CollectionConfig } from 'payload'

import { admins, adminsField, adminsOrSelf } from '@/access'
import { l } from '@/fields/label'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role'],
    group: l('Team', 'الفريق'),
  },
  auth: true,
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
  ],
}

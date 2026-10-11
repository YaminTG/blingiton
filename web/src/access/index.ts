import type { Access, FieldAccess } from 'payload'

import type { User } from '@/payload-types'

const roleOf = (user: unknown) => (user as User | null)?.role

export const anyone: Access = () => true
export const loggedIn: Access = ({ req }) => Boolean(req.user)
export const admins: Access = ({ req }) => roleOf(req.user) === 'admin'
export const adminsField: FieldAccess = ({ req }) => roleOf(req.user) === 'admin'

// Admins see everyone; other staff only see and edit themselves.
export const adminsOrSelf: Access = ({ req }) => {
  if (!req.user) return false
  if (roleOf(req.user) === 'admin') return true
  return { id: { equals: req.user.id } }
}

// Published documents are public; drafts only for logged-in staff.
export const publishedOrLoggedIn: Access = ({ req }) => {
  if (req.user) return true
  return { _status: { equals: 'published' } }
}

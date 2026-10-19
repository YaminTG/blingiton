import type { Access, FieldAccess } from 'payload'

import type { User } from '@/payload-types'

const roleOf = (user: unknown) => (user as User | null)?.role

/**
 * What a staff account may work on, ticked per account by an admin (Team → Users). Admins can do
 * everything, and only admins manage the team, the audit log and the security page.
 *   orders    orders and returns/refunds
 *   catalog   products, categories, photos, reviews and pages (prices and stock live here)
 *   customers the customer list, notes and customer insights
 *   settings  Site settings (fees, emails, SEO writing)
 */
export const AREAS = ['orders', 'catalog', 'customers', 'settings'] as const
export type Area = (typeof AREAS)[number]

export function can(user: unknown, area: Area) {
  const u = user as User | null
  if (!u) return false
  if (u.role === 'admin') return true
  return Array.isArray(u.permissions) && u.permissions.includes(area)
}

export const isAdmin = (user: unknown) => roleOf(user) === 'admin'

/** Allowed when the account may work on any of these areas. */
export const may =
  (...areas: Area[]): Access =>
  ({ req }) =>
    areas.some((a) => can(req.user, a))

export const anyone: Access = () => true
export const loggedIn: Access = ({ req }) => Boolean(req.user)
export const admins: Access = ({ req }) => isAdmin(req.user)
export const adminsField: FieldAccess = ({ req }) => isAdmin(req.user)

// Admins see everyone; other staff only see and edit themselves.
export const adminsOrSelf: Access = ({ req }) => {
  if (!req.user) return false
  if (isAdmin(req.user)) return true
  return { id: { equals: req.user.id } }
}

// Published documents are public; drafts only for logged-in staff.
export const publishedOrLoggedIn: Access = ({ req }) => {
  if (req.user) return true
  return { _status: { equals: 'published' } }
}

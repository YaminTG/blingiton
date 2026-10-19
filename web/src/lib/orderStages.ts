// The order pipeline once an order is paid or confirmed: paid → preparing → packed → shipped →
// delivered. Shared by the Orders collection, the admin list, the dashboard, the stuck-order job,
// the emails and the customer's tracking page.
// No server imports here: the admin's client components use it too.

import { l } from '@/fields/label'

import type { OrderStatus } from './orderOptions'

export const orderStages = [
  { value: 'paid', label: l('Paid / confirmed', 'مدفوع / مؤكد') },
  { value: 'preparing', label: l('Preparing', 'قيد التحضير') },
  { value: 'packed', label: l('Packed', 'مغلّف') },
  { value: 'shipped', label: l('Shipped', 'تم الشحن') },
  { value: 'delivered', label: l('Delivered', 'تم التسليم') },
] as const
export type Stage = (typeof orderStages)[number]['value']

const STAGES: Stage[] = orderStages.map((s) => s.value)
export const stageRank = (stage: Stage | null | undefined) => (stage ? STAGES.indexOf(stage) : -1)
export const nextStage = (stage: Stage | null | undefined): Stage | null => STAGES[stageRank(stage) + 1] ?? null
export const isStage = (v: unknown): v is Stage => STAGES.includes(v as Stage)

/**
 * Orders the shop is working on, so they have a stage. Pending payment, cancelled, refunded and
 * failed orders don't. On hold = abroad, payment being arranged on WhatsApp.
 */
export const ACTIVE_STATUSES: OrderStatus[] = ['processing', 'on-hold', 'completed']
export const isActive = (status: OrderStatus | null | undefined) => Boolean(status && ACTIVE_STATUSES.includes(status))

/**
 * Where an order goes after a save. Stage and status move together:
 * - staff moved the stage: shipped or delivered make the order "completed" (on its way, as in
 *   WooCommerce, so the review link and "verified purchase" work as before); an earlier stage
 *   takes a completed order back to processing;
 * - otherwise the status leads: a new active order starts at "paid", "completed" means at least
 *   shipped, and taking a shipped order back to processing puts it at "packed";
 * - an order that isn't active has no stage.
 */
export function resolveStage(next: { status: OrderStatus; stage?: Stage | null }, prev?: { status?: OrderStatus | null; stage?: Stage | null }) {
  const status = next.status
  if (!isActive(status)) return { status, stage: null }
  const shipped = stageRank('shipped')
  const stage = next.stage ?? null
  if (stage && stage !== (prev?.stage ?? null)) {
    if (stageRank(stage) >= shipped) return { status: 'completed' as OrderStatus, stage }
    return { status: status === 'completed' ? ('processing' as OrderStatus) : status, stage }
  }
  let s: Stage = stage ?? 'paid'
  if (status === 'completed' && stageRank(s) < shipped) s = 'shipped'
  if (status !== 'completed' && status !== prev?.status && stageRank(s) >= shipped) s = 'packed'
  return { status, stage: s }
}

/** Who takes the parcel. DHL tracking links are built from the number (orderTrack.ts). */
export const carriers = [
  { value: 'own', label: l('Our driver', 'سائقنا') },
  { value: 'courier', label: l('Local courier company', 'شركة توصيل محلية') },
  { value: 'dhl', label: l('DHL Express', 'DHL Express') },
  { value: 'post', label: l('Post / standard shipping', 'البريد / الشحن العادي') },
  { value: 'pickup', label: l('Picked up from us', 'استلام من المتجر') },
] as const

/** Hours an order may sit in a stage before it counts as stuck. Site settings → Orders & alerts. */
export type StageLimits = { paid: number; preparing: number; packed: number; shippedLocal: number; shippedDhl: number; shippedStandard: number }

// Made-to-order pieces take 3–5 days; DHL Express 3–5 business days; standard shipping 14–20.
export const DEFAULT_LIMITS: StageLimits = { paid: 24, preparing: 120, packed: 24, shippedLocal: 72, shippedDhl: 168, shippedStandard: 720 }

/** The settings' values, with the defaults for anything empty. */
export function limitsFrom(saved: Partial<Record<keyof StageLimits, number | null>> | null | undefined): StageLimits {
  const out = { ...DEFAULT_LIMITS }
  for (const k of Object.keys(out) as (keyof StageLimits)[]) {
    const v = saved?.[k]
    if (typeof v === 'number' && v >= 0) out[k] = v
  }
  return out
}

type Method = 'amman' | 'jordan' | 'intl' | 'intl_standard' | null | undefined

/** How long this stage may take, in hours; null when it can't get stuck (delivered, or a limit of 0). */
export function limitHours(stage: Stage | null | undefined, method: Method, limits: StageLimits): number | null {
  if (!stage || stage === 'delivered') return null
  const h = stage === 'shipped' ? (method === 'intl' ? limits.shippedDhl : method === 'intl_standard' ? limits.shippedStandard : limits.shippedLocal) : limits[stage]
  return h > 0 ? h : null
}

/** When an order that entered `stage` at `since` becomes stuck (ISO), or null. */
export function stuckAtFor(stage: Stage | null | undefined, since: string | null | undefined, method: Method, limits: StageLimits): string | null {
  const h = limitHours(stage, method, limits)
  if (h === null || !since) return null
  return new Date(new Date(since).getTime() + h * 3600_000).toISOString()
}

/** The time now, for server components (they render once per request, so reading the clock is fine). */
export const clock = () => Date.now()

export const isStuck = (stuckAt: string | null | undefined, now = Date.now()) => Boolean(stuckAt && new Date(stuckAt).getTime() <= now)

/** "2d 5h" / "2 يوم و5 ساعة": how long an order has waited, or how overdue it is. */
export function duration(ms: number, lang: 'en' | 'ar') {
  const hours = Math.max(0, Math.floor(ms / 3600_000))
  const d = Math.floor(hours / 24)
  const h = hours % 24
  if (lang === 'ar') return d ? `${d} يوم${h ? ` و${h} ساعة` : ''}` : hours ? `${h} ساعة` : 'أقل من ساعة'
  return d ? `${d}d${h ? ` ${h}h` : ''}` : hours ? `${h}h` : '<1h'
}

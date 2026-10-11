import type { BeforeListTableServerProps } from 'payload'

import Link from 'next/link'

import { orderStatuses, type OrderStatus } from '@/lib/orderOptions'

/**
 * "All (12) | Processing (3) | Completed (8) …" above the orders list, like WooCommerce.
 * Each tab is just the list filtered by status, so Payload's own filters, search and sorting still work.
 */
export async function OrderStatusTabs({ payload, i18n, searchParams }: BeforeListTableServerProps) {
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const base = `${payload.config.routes.admin}/collections/orders`
  const counts = await Promise.all(orderStatuses.map((s) => payload.count({ collection: 'orders', where: { status: { equals: s.value } } })))
  const all = counts.reduce((sum, c) => sum + c.totalDocs, 0)

  // The filter arrives either parsed (where.status.equals) or as the raw query key, depending on the view.
  const sp = (searchParams ?? {}) as Record<string, unknown>
  const where = sp.where as { status?: { equals?: string } } | undefined
  const raw = sp['where[status][equals]']
  const active = (where?.status?.equals ?? (typeof raw === 'string' ? raw : null)) as OrderStatus | null

  const tabs = [
    { key: null, label: lang === 'ar' ? 'الكل' : 'All', count: all },
    ...orderStatuses.map((s, i) => ({ key: s.value, label: s.label[lang], count: counts[i].totalDocs })).filter((t) => t.count > 0 || t.key === active),
  ]

  return (
    <nav className="bl-tabs" aria-label={lang === 'ar' ? 'حالات الطلب' : 'Order status'}>
      {tabs.map((t) => (
        <Link
          key={t.key ?? 'all'}
          className={`bl-tabs__tab${t.key === active ? ' is-active' : ''}`}
          aria-current={t.key === active ? 'page' : undefined}
          href={t.key ? `${base}?where[status][equals]=${t.key}` : base}
        >
          {t.label} <span>({t.count})</span>
        </Link>
      ))}
    </nav>
  )
}

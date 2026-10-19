import type { BeforeListTableServerProps } from 'payload'

import Link from 'next/link'

import { orderStatuses, type OrderStatus } from '@/lib/orderOptions'
import { orderStages } from '@/lib/orderStages'

/**
 * "All (12) | Processing (3) | Completed (8) …" above the orders list, like WooCommerce, and under
 * it the pipeline: "Stuck (1) | Paid (2) | Preparing (3) …".
 * Each tab is just the list filtered, so Payload's own filters, search and sorting still work.
 */
export async function OrderStatusTabs({ payload, i18n, searchParams }: BeforeListTableServerProps) {
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const base = `${payload.config.routes.admin}/collections/orders`
  const now = new Date().toISOString()
  const [counts, stageCounts, stuck] = await Promise.all([
    Promise.all(orderStatuses.map((s) => payload.count({ collection: 'orders', where: { status: { equals: s.value } } }))),
    Promise.all(orderStages.map((s) => payload.count({ collection: 'orders', where: { stage: { equals: s.value } } }))),
    payload.count({ collection: 'orders', where: { stuckAt: { less_than_equal: now } } }),
  ])
  const all = counts.reduce((sum, c) => sum + c.totalDocs, 0)

  // The filter arrives either parsed (where.status.equals) or as the raw query key, depending on the view.
  const sp = (searchParams ?? {}) as Record<string, unknown>
  const where = sp.where as { status?: { equals?: string }; stage?: { equals?: string }; stuckAt?: unknown } | undefined
  const raw = (key: string) => (typeof sp[key] === 'string' ? (sp[key] as string) : null)
  const active = (where?.status?.equals ?? raw('where[status][equals]')) as OrderStatus | null
  const activeStage = where?.stage?.equals ?? raw('where[stage][equals]')
  const stuckActive = Boolean(where?.stuckAt ?? raw('where[stuckAt][less_than_equal]'))

  const tabs = [
    { key: null, label: lang === 'ar' ? 'الكل' : 'All', count: all },
    ...orderStatuses.map((s, i) => ({ key: s.value, label: s.label[lang], count: counts[i].totalDocs })).filter((t) => t.count > 0 || t.key === active),
  ]

  return (
    <>
      <nav className="bl-tabs" aria-label={lang === 'ar' ? 'حالات الطلب' : 'Order status'}>
        {tabs.map((t) => {
          const on = t.key === active && !activeStage && !stuckActive
          return (
            <Link key={t.key ?? 'all'} className={`bl-tabs__tab${on ? ' is-active' : ''}`} aria-current={on ? 'page' : undefined} href={t.key ? `${base}?where[status][equals]=${t.key}` : base}>
              {t.label} <span>({t.count})</span>
            </Link>
          )
        })}
      </nav>
      <nav className="bl-tabs bl-tabs--stages" aria-label={lang === 'ar' ? 'مراحل الطلب' : 'Order stage'}>
        <Link
          className={`bl-tabs__tab bl-tabs__tab--stuck${stuckActive ? ' is-active' : ''}${stuck.totalDocs ? ' has-stuck' : ''}`}
          aria-current={stuckActive ? 'page' : undefined}
          href={`${base}?where[stuckAt][less_than_equal]=${encodeURIComponent(now)}&sort=stuckAt`}
        >
          {lang === 'ar' ? 'متأخرة' : 'Stuck'} <span>({stuck.totalDocs})</span>
        </Link>
        {orderStages.map((s, i) => (
          <Link
            key={s.value}
            className={`bl-tabs__tab${activeStage === s.value ? ' is-active' : ''}`}
            aria-current={activeStage === s.value ? 'page' : undefined}
            href={`${base}?where[stage][equals]=${s.value}&sort=stageSince`}
          >
            {s.label[lang]} <span>({stageCounts[i].totalDocs})</span>
          </Link>
        ))}
      </nav>
    </>
  )
}

// Browser side of the shop funnel (see lib/events.ts). Each step is sent once per visit and product,
// with sendBeacon so it never holds up the page or a click. Failing storage or network just means
// the step isn't counted.

import type { EventType } from './events'
import { classifyOrigin, ORIGIN_KEY, type Origin } from './origin'

const SESSION_KEY = 'bl-visit'
const SEEN_KEY = 'bl-seen'

/**
 * Where this visit came from, worked out once per tab from the first page (lib/origin.ts) and kept
 * for the order's Origin. Called by the store on load and by track(), whichever runs first: React
 * runs a page's effects before the layout's, so a product view can come before the store's.
 */
export function ensureOrigin(): Partial<Origin> {
  const stored = sessionStorage.getItem(ORIGIN_KEY)
  if (stored) return JSON.parse(stored)
  const origin = classifyOrigin(location.href, document.referrer, location.hostname)
  sessionStorage.setItem(ORIGIN_KEY, JSON.stringify(origin))
  return origin
}

const visitId = () => {
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, '').slice(0, 20)
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export function track(type: EventType, product?: number) {
  try {
    const key = `${type}:${product ?? ''}`
    const seen: string[] = JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]')
    if (seen.includes(key)) return
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen, key].slice(-300)))

    const origin = ensureOrigin()
    const body = JSON.stringify({
      type,
      product,
      session: visitId(),
      sourceType: origin.type,
      source: origin.source,
      locale: document.documentElement.lang === 'ar' ? 'ar' : 'en',
      // The finder's answers live in the query; nothing else's path needs it.
      path: type === 'finder-done' ? location.pathname + location.search : location.pathname,
    })
    const blob = new Blob([body], { type: 'application/json' })
    if (!navigator.sendBeacon?.('/track', blob)) void fetch('/track', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {})
  } catch {
    // storage blocked or old browser: not counted
  }
}

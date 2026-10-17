// Browser side of customer browsing insights (rules in lib/activity.ts). Does nothing unless this
// browser carries the "remember this device" flag from checkout; the server still checks the signed
// cookie, consent and a completed order before storing anything. Batched and sent with sendBeacon,
// so it never holds up the page; failures just mean a step isn't recorded.

import { FLAG_COOKIE, MAX_SECONDS, type ActivityEvent } from './activity'

/** No pointer, key or scroll for this long and the time stops counting: they've likely walked away. */
const IDLE_MS = 60_000

const known = () => {
  try {
    return document.cookie.split(/;\s*/).includes(`${FLAG_COOKIE}=1`)
  } catch {
    return false
  }
}

let queue: ActivityEvent[] = []
let timer: ReturnType<typeof setTimeout> | undefined
let hooked = false

function flush() {
  clearTimeout(timer)
  while (queue.length) {
    const body = JSON.stringify({ events: queue.slice(0, 20) })
    queue = queue.slice(20)
    try {
      const blob = new Blob([body], { type: 'application/json' })
      if (!navigator.sendBeacon?.('/activity', blob)) void fetch('/activity', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {})
    } catch {
      // not recorded
    }
  }
}

export function noteActivity(e: ActivityEvent) {
  if (!known()) return
  if (!hooked) {
    hooked = true
    addEventListener('pagehide', flush)
  }
  queue.push(e)
  clearTimeout(timer)
  timer = setTimeout(flush, queue.length >= 20 ? 0 : 3000)
}

/**
 * Counts the seconds a product page is on screen while the visitor is using it (visible tab, some
 * input in the last minute), up to MAX_SECONDS per view. Reported when the tab is hidden or the page
 * is left. Returns the cleanup for useEffect.
 */
export function watchActiveTime(product: number) {
  if (!known()) return () => {}
  let lastInput = Date.now()
  let pending = 0
  let total = 0
  const onInput = () => {
    lastInput = Date.now()
  }
  const tick = setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastInput < IDLE_MS && total < MAX_SECONDS) {
      pending++
      total++
    }
  }, 1000)
  const report = () => {
    if (pending > 0) noteActivity({ type: 'time', product, seconds: pending })
    pending = 0
    flush()
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') report()
  }
  const inputs = ['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart'] as const
  for (const n of inputs) addEventListener(n, onInput, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)
  addEventListener('pagehide', report)
  return () => {
    report()
    clearInterval(tick)
    for (const n of inputs) removeEventListener(n, onInput)
    document.removeEventListener('visibilitychange', onVisibility)
    removeEventListener('pagehide', report)
  }
}

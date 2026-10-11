import { revalidateTag } from 'next/cache'
import { after } from 'next/server'

/**
 * Refresh cached pages for these tags. `expire: 0` so the very next visit shows the change
 * (the shop is small; freshness matters more than shaving a request).
 * Outside a Next.js request (CLI scripts) there is nothing cached to refresh, so it is a no-op.
 */
export function refresh(...tagList: string[]) {
  for (const tag of new Set(tagList)) {
    try {
      revalidateTag(tag, { expire: 0 })
    } catch {
      // not in a Next.js request context
    }
  }
}

/** Run work after the response is sent (Next.js `after`), or right away when there is no request. */
export function later(task: () => Promise<unknown>) {
  const run = () => task().catch((err) => console.error('[after-save]', err))
  try {
    after(run)
  } catch {
    void run()
  }
}

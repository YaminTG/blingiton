'use client'

import { useEffect, type ReactNode } from 'react'

import { FINDER_KEY } from '@/lib/finder'
import { track } from '@/lib/track'

/** Counts the finder in the shop funnel: started (first question) or finished (picks shown). */
export function FinderTrack({ step }: { step: 'finder' | 'finder-done' }) {
  useEffect(() => track(step), [step])
  return null
}

/**
 * Wraps the picks: a click on one (its page or "add to bag") counts as a finder click, and the visit
 * is marked so an order placed later says it came through the finder.
 */
export function FinderPicks({ children }: { children: ReactNode }) {
  return (
    <div
      className="finder-picks"
      onClickCapture={(e) => {
        const el = (e.target as Element).closest('[data-finder-pick]')
        const id = Number(el?.getAttribute('data-finder-pick'))
        if (!id) return
        track('finder-click', id)
        try {
          sessionStorage.setItem(FINDER_KEY, '1')
        } catch {
          // storage blocked: the order just won't be marked
        }
      }}
    >
      {children}
    </div>
  )
}

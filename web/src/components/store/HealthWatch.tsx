'use client'

import { useEffect } from 'react'

import { mediaPath, reportHealth } from '@/lib/healthReport'

/**
 * Reports our own photos that fail to load in a shopper's browser (at most 5 per page), for the
 * shop-health check. Photos that failed before this ran are found by scanning the page once.
 */
export function HealthWatch() {
  useEffect(() => {
    const seen = new Set<string>()
    const report = (img: HTMLImageElement) => {
      const src = mediaPath(img.currentSrc || img.src, location.origin)
      if (!src || seen.has(src) || seen.size >= 5) return
      seen.add(src)
      reportHealth({ type: 'image', src })
    }
    const onError = (e: Event) => {
      if (e.target instanceof HTMLImageElement) report(e.target)
    }
    window.addEventListener('error', onError, true)
    for (const img of Array.from(document.images)) if (img.complete && img.naturalWidth === 0 && img.src) report(img)
    return () => window.removeEventListener('error', onError, true)
  }, [])
  return null
}

/** On the "page not found" screen: tells the shop-health check which address people are missing. */
export function ReportMissing() {
  useEffect(() => reportHealth({ type: 'not-found' }), [])
  return null
}

// Rules every piece of SEO text must pass, whoever wrote it (this session's batch or the Claude API).

import type { Locale } from '@/lib/locales'

export const BRAND = 'Blingiton'

// The SEO title and description ranges match the indicators in the admin's SEO tab (plugin-seo),
// so text that passes here shows green there too.
export const LIMITS = {
  name: { min: 2, max: 90 },
  metaTitle: { min: 50, max: 60 },
  metaDescription: { min: 100, max: 150 },
  shortDescription: { min: 20, max: 200 },
  description: { min: 300, max: 1500 },
  intro: { min: 150, max: 1200 },
  alt: { min: 10, max: 140 },
} as const

export type TextKind = keyof typeof LIMITS

const ARABIC_LETTER = /[؀-ۿ]/g
const LATIN_LETTER = /[A-Za-z]/g

/** Share of letters that are Arabic, ignoring the brand name. Mostly-English text in an Arabic field fails. */
export const arabicShare = (raw: string) => {
  const text = raw.replaceAll(BRAND, '')
  const ar = text.match(ARABIC_LETTER)?.length ?? 0
  const lat = text.match(LATIN_LETTER)?.length ?? 0
  return ar + lat === 0 ? 0 : ar / (ar + lat)
}

/** Returns a problem description, or null when the text is fine. */
export function checkText(kind: TextKind, locale: Locale, value: string | null | undefined): string | null {
  const text = value?.trim() ?? ''
  if (!text) return `${kind} (${locale}) is empty`
  const { min, max } = LIMITS[kind]
  if (text.length < min) return `${kind} (${locale}) is too short (${text.length} < ${min})`
  if (text.length > max) return `${kind} (${locale}) is too long (${text.length} > ${max})`
  const share = arabicShare(text)
  if (locale === 'ar' && share < 0.6) return `${kind} (ar) is not mostly Arabic`
  if (locale === 'en' && share > 0.2) return `${kind} (en) contains Arabic`
  if (/\b(lorem|TODO|\[.*?\])\b/i.test(text)) return `${kind} (${locale}) contains a placeholder`
  return null
}

export const isEmpty = (value: unknown) => typeof value !== 'string' || value.trim() === ''

/** Short fingerprint of a text, so later edits by a person can be told apart from AI-written text. */
export const fingerprint = (text: string) => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

// Where an order came from, like WooCommerce's "Origin" column: worked out from the first page of the
// visitor's session (its referrer and utm_* tags) and sent along with the order. No cookies; the
// browser keeps it in sessionStorage, so it lasts for that tab's visit only.

export type OriginType = 'direct' | 'organic' | 'referral' | 'utm' | 'admin'

export type Origin = {
  type: OriginType
  /** Google, Instagram, chatgpt.com, the utm_source… */
  source?: string
  medium?: string
  campaign?: string
  referrer?: string
  landingPage?: string
}

const SEARCH: [RegExp, string][] = [
  [/(^|\.)google\./, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)yahoo\./, 'Yahoo'],
  [/(^|\.)yandex\./, 'Yandex'],
  [/(^|\.)baidu\.com$/, 'Baidu'],
  [/(^|\.)ecosia\.org$/, 'Ecosia'],
]

const NAMED: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, 'Facebook'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)whatsapp\.(com|net)$|^wa\.me$/, 'WhatsApp'],
  [/(^|\.)snapchat\.com$/, 'Snapchat'],
  [/(^|\.)pinterest\./, 'Pinterest'],
  [/(^|\.)(x|twitter)\.com$|^t\.co$/, 'X'],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
  [/(^|\.)claude\.ai$/, 'Claude'],
  [/(^|\.)gemini\.google\.com$/, 'Gemini'],
  [/(^|\.)copilot\.microsoft\.com$/, 'Copilot'],
]

const cap = (s: string | null | undefined, n = 200) => (s ? s.slice(0, n) : undefined)

/** Classify a landing page and its referrer. `ownHost` referrers (moving around the shop) count as direct. */
export function classifyOrigin(href: string, referrer: string, ownHost: string): Origin {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return { type: 'direct' }
  }
  const landingPage = cap(url.pathname + url.search, 300)
  const q = url.searchParams
  const utmSource = q.get('utm_source')
  if (utmSource) {
    return { type: 'utm', source: cap(utmSource, 100), medium: cap(q.get('utm_medium'), 100), campaign: cap(q.get('utm_campaign'), 100), referrer: cap(referrer, 300), landingPage }
  }
  let host = ''
  try {
    host = referrer ? new URL(referrer).hostname.replace(/^www\./, '').replace(/^(l|lm|m)\./, '') : ''
  } catch {
    host = ''
  }
  if (!host || host === ownHost.replace(/^www\./, '')) return { type: 'direct', landingPage }
  // AI assistants are checked first, since gemini.google.com would otherwise read as Google search.
  const named = NAMED.find(([re]) => re.test(host))
  if (named) return { type: 'referral', source: named[1], referrer: cap(referrer, 300), landingPage }
  const engine = SEARCH.find(([re]) => re.test(host))
  if (engine) return { type: 'organic', source: engine[1], referrer: cap(referrer, 300), landingPage }
  return { type: 'referral', source: host, referrer: cap(referrer, 300), landingPage }
}

/** Accepts only the shape above from the browser; anything else becomes "unknown" (no origin). */
export function sanitizeOrigin(value: unknown): Origin | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  const types: OriginType[] = ['direct', 'organic', 'referral', 'utm']
  if (!types.includes(v.type as OriginType)) return undefined
  const str = (x: unknown, n: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, n) : undefined)
  return {
    type: v.type as OriginType,
    source: str(v.source, 100),
    medium: str(v.medium, 100),
    campaign: str(v.campaign, 100),
    referrer: str(v.referrer, 300),
    landingPage: str(v.landingPage, 300),
  }
}

/** The text in the admin's Origin column, worded like WooCommerce's. */
export function originLabel(o: { type?: OriginType | null; source?: string | null } | null | undefined, lang: 'en' | 'ar'): string {
  const ar = lang === 'ar'
  switch (o?.type) {
    case 'direct':
      return ar ? 'مباشر' : 'Direct'
    case 'organic':
      return `${ar ? 'بحث' : 'Organic'}: ${o.source ?? '?'}`
    case 'referral':
      return `${ar ? 'إحالة' : 'Referral'}: ${o.source ?? '?'}`
    case 'utm':
      return `${ar ? 'المصدر' : 'Source'}: ${o.source ?? '?'}`
    case 'admin':
      return ar ? 'لوحة التحكم' : 'Web admin'
    default:
      return ar ? 'غير معروف' : 'Unknown'
  }
}

export const ORIGIN_KEY = 'bl-origin'

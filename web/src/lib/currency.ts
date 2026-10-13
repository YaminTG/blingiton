import type { Locale } from './locales'

/**
 * Prices are stored and charged in JOD. Visitors see them in their own currency: the proxy picks
 * one from the visitor's country (src/proxy.ts), the picker in the footer and menu can change it,
 * and <Price> converts on the page. Structured data, feeds and emails stay in JOD.
 */
export const currencies = ['JOD', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'USD', 'GBP', 'EUR'] as const
export type Currency = (typeof currencies)[number]
/** Units of each currency per 1 JOD. */
export type Rates = Record<Currency, number>

export const CURRENCY_COOKIE = 'bl-currency'

export const isCurrency = (v: unknown): v is Currency => typeof v === 'string' && (currencies as readonly string[]).includes(v)

// Used when the rates can't be fetched. JOD and the Gulf currencies are pegged to the US dollar,
// so only KWD, GBP and EUR drift from these.
export const fallbackRates: Rates = { JOD: 1, SAR: 5.289, AED: 5.18, KWD: 0.438, QAR: 5.134, BHD: 0.5303, OMR: 0.5431, USD: 1.4104, GBP: 1.066, EUR: 1.259 }

const EURO = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK']
const BY_COUNTRY: Record<string, Currency> = { JO: 'JOD', PS: 'JOD', SA: 'SAR', AE: 'AED', KW: 'KWD', QA: 'QAR', BH: 'BHD', OM: 'OMR', GB: 'GBP' }

/** Currency for a two-letter country code. Anywhere not listed (Lebanon and the US included) sees US dollars. */
export const currencyForCountry = (country: string): Currency => {
  const cc = country.toUpperCase()
  return BY_COUNTRY[cc] ?? (EURO.includes(cc) ? 'EUR' : 'USD')
}

/** Keeps a fetched rate only if it's within a sane range of the fallback, so a bad feed can't show silly prices. */
export const cleanRates = (raw: Record<string, unknown> | null | undefined): Rates =>
  Object.fromEntries(
    currencies.map((c) => {
      const v = raw?.[c] ?? raw?.[c.toLowerCase()]
      const ok = c !== 'JOD' && typeof v === 'number' && v > fallbackRates[c] / 2 && v < fallbackRates[c] * 2
      return [c, ok ? v : fallbackRates[c]]
    }),
  ) as Rates

// Whole units, except the dinars: JOD keeps its fils as before, and KWD, BHD and OMR are worth
// more than a JOD, so they show one decimal.
const decimals = (c: Currency) => (c === 'JOD' ? 2 : c === 'KWD' || c === 'BHD' || c === 'OMR' ? 1 : 0)

export const convert = (jod: number, c: Currency, rates: Rates) => {
  if (c === 'JOD') return jod
  const f = 10 ** decimals(c)
  return Math.round(jod * rates[c] * f) / f
}

// Codes after the number in English (as JOD always was), symbols for $, £ and €; Arabic symbols after the number.
const SYMBOLS: Record<Currency, { en: [string, string]; ar: [string, string] }> = {
  JOD: { en: ['', ' JOD'], ar: ['', ' د.أ'] },
  SAR: { en: ['', ' SAR'], ar: ['', ' ر.س'] },
  AED: { en: ['', ' AED'], ar: ['', ' د.إ'] },
  KWD: { en: ['', ' KWD'], ar: ['', ' د.ك'] },
  QAR: { en: ['', ' QAR'], ar: ['', ' ر.ق'] },
  BHD: { en: ['', ' BHD'], ar: ['', ' د.ب'] },
  OMR: { en: ['', ' OMR'], ar: ['', ' ر.ع'] },
  USD: { en: ['$', ''], ar: ['', ' $'] },
  GBP: { en: ['£', ''], ar: ['', ' £'] },
  EUR: { en: ['€', ''], ar: ['', ' €'] },
}

export const symbolOf = (c: Currency, locale: Locale) => SYMBOLS[c][locale]

/** Short label for the picker: the code in English, the usual abbreviation in Arabic ("SAR" / "ر.س"). */
export const shortName = (c: Currency, locale: Locale) => (locale === 'ar' ? SYMBOLS[c].ar.join('').trim() : c)

/** Flag files in public/flags (from flag-icons, MIT). */
export const flagOf: Record<Currency, string> = { JOD: 'jo', SAR: 'sa', AED: 'ae', KWD: 'kw', QAR: 'qa', BHD: 'bh', OMR: 'om', USD: 'us', GBP: 'gb', EUR: 'eu' }

/** The number alone, in Latin digits in both languages. */
export const formatAmount = (amount: number, c: Currency, locale: Locale) =>
  new Intl.NumberFormat(locale === 'ar' ? 'ar-JO-u-nu-latn' : 'en-JO', { maximumFractionDigits: decimals(c) }).format(amount)

/** An amount already in currency `c`, e.g. "238 SAR", "$64", "238 ر.س". */
export const formatMoney = (amount: number, c: Currency, locale: Locale) => {
  const [pre, post] = SYMBOLS[c][locale]
  return `${pre}${formatAmount(amount, c, locale)}${post}`
}

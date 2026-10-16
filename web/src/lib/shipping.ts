import type { SiteSetting } from '@/payload-types'

/**
 * Delivery zones and fees. Jordan has its own two options (Amman / other cities). Abroad there are
 * two: DHL Express (fast) and standard shipping (slow), each priced by zone. Countries outside the
 * Middle East and Europe pay the US price. Fees live in Site settings → Delivery & returns.
 */
export type Zone = 'jordan' | 'me' | 'europe' | 'us'
export type IntlMethod = 'intl' | 'intl_standard'
export type Method = 'amman' | 'jordan' | IntlMethod

export type Fees = {
  amman: number
  jordan: number
  intl: Record<Exclude<Zone, 'jordan'>, number>
  intl_standard: Record<Exclude<Zone, 'jordan'>, number>
  giftCard: number
}

export type Country = { code: string; zone: Zone; en: string; ar: string }

/** Grouped by zone for the checkout's country list. "Other …" rows cover anything not listed. */
export const COUNTRIES: Country[] = [
  { code: 'JO', zone: 'jordan', en: 'Jordan', ar: 'الأردن' },
  { code: 'SA', zone: 'me', en: 'Saudi Arabia', ar: 'السعودية' },
  { code: 'AE', zone: 'me', en: 'United Arab Emirates', ar: 'الإمارات' },
  { code: 'KW', zone: 'me', en: 'Kuwait', ar: 'الكويت' },
  { code: 'QA', zone: 'me', en: 'Qatar', ar: 'قطر' },
  { code: 'BH', zone: 'me', en: 'Bahrain', ar: 'البحرين' },
  { code: 'OM', zone: 'me', en: 'Oman', ar: 'عُمان' },
  { code: 'IQ', zone: 'me', en: 'Iraq', ar: 'العراق' },
  { code: 'PS', zone: 'me', en: 'Palestine', ar: 'فلسطين' },
  { code: 'LB', zone: 'me', en: 'Lebanon', ar: 'لبنان' },
  { code: 'EG', zone: 'me', en: 'Egypt', ar: 'مصر' },
  { code: 'XME', zone: 'me', en: 'Other country in the Middle East', ar: 'دولة أخرى في الشرق الأوسط' },
  { code: 'GB', zone: 'europe', en: 'United Kingdom', ar: 'المملكة المتحدة' },
  { code: 'DE', zone: 'europe', en: 'Germany', ar: 'ألمانيا' },
  { code: 'FR', zone: 'europe', en: 'France', ar: 'فرنسا' },
  { code: 'NL', zone: 'europe', en: 'Netherlands', ar: 'هولندا' },
  { code: 'BE', zone: 'europe', en: 'Belgium', ar: 'بلجيكا' },
  { code: 'SE', zone: 'europe', en: 'Sweden', ar: 'السويد' },
  { code: 'DK', zone: 'europe', en: 'Denmark', ar: 'الدنمارك' },
  { code: 'IT', zone: 'europe', en: 'Italy', ar: 'إيطاليا' },
  { code: 'ES', zone: 'europe', en: 'Spain', ar: 'إسبانيا' },
  { code: 'CH', zone: 'europe', en: 'Switzerland', ar: 'سويسرا' },
  { code: 'AT', zone: 'europe', en: 'Austria', ar: 'النمسا' },
  { code: 'IE', zone: 'europe', en: 'Ireland', ar: 'أيرلندا' },
  { code: 'XEU', zone: 'europe', en: 'Other country in Europe', ar: 'دولة أوروبية أخرى' },
  { code: 'US', zone: 'us', en: 'United States', ar: 'الولايات المتحدة' },
  { code: 'CA', zone: 'us', en: 'Canada', ar: 'كندا' },
  { code: 'AU', zone: 'us', en: 'Australia', ar: 'أستراليا' },
  { code: 'XX', zone: 'us', en: 'Other country', ar: 'دولة أخرى' },
]

export const countryByCode = (code: unknown) => COUNTRIES.find((c) => c.code === code)

/** Site settings → fees, with the owner's prices as defaults for anything not filled in yet. */
export function feesFrom(d: SiteSetting['delivery'] | undefined): Fees {
  return {
    amman: d?.amman ?? 3,
    jordan: d?.jordan ?? 5,
    intl: { me: d?.dhl?.middleEast ?? 20, europe: d?.dhl?.europe ?? 25, us: d?.dhl?.us ?? 30 },
    intl_standard: { me: d?.standard?.middleEast ?? 8, europe: d?.standard?.europe ?? 12, us: d?.standard?.us ?? 17 },
    giftCard: d?.giftCard ?? 3,
  }
}

export function deliveryFee(fees: Fees, zone: Zone, method: Method) {
  if (zone === 'jordan') return method === 'jordan' ? fees.jordan : fees.amman
  return fees[method === 'intl_standard' ? 'intl_standard' : 'intl'][zone]
}

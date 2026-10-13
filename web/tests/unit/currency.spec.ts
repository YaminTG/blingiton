import { describe, expect, it } from 'vitest'

import { cleanRates, convert, currencyForCountry, fallbackRates, formatMoney } from '@/lib/currency'

describe('currency', () => {
  it('picks a currency from the country', () => {
    expect(currencyForCountry('jo')).toBe('JOD')
    expect(currencyForCountry('PS')).toBe('JOD')
    expect(currencyForCountry('SA')).toBe('SAR')
    expect(currencyForCountry('DE')).toBe('EUR')
    expect(currencyForCountry('LB')).toBe('USD')
    expect(currencyForCountry('US')).toBe('USD')
  })

  it('converts and rounds per currency', () => {
    expect(convert(45, 'JOD', fallbackRates)).toBe(45)
    expect(convert(45, 'SAR', fallbackRates)).toBe(238)
    expect(convert(45, 'KWD', fallbackRates)).toBe(19.7)
    expect(convert(45, 'USD', fallbackRates)).toBe(63)
  })

  it('formats like the shop always has', () => {
    expect(formatMoney(45, 'JOD', 'en')).toBe('45 JOD')
    expect(formatMoney(45, 'JOD', 'ar')).toBe('45 د.أ')
    expect(formatMoney(238, 'SAR', 'en')).toBe('238 SAR')
    expect(formatMoney(238, 'SAR', 'ar')).toBe('238 ر.س')
    expect(formatMoney(63, 'USD', 'en')).toBe('$63')
    expect(formatMoney(1234, 'AED', 'en')).toBe('1,234 AED')
  })

  it('ignores missing or silly rates', () => {
    const r = cleanRates({ sar: 5.3, usd: 900, jod: 3 })
    expect(r.SAR).toBe(5.3)
    expect(r.USD).toBe(fallbackRates.USD)
    expect(r.JOD).toBe(1)
    expect(r.EUR).toBe(fallbackRates.EUR)
  })
})

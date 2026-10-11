import { describe, expect, it } from 'vitest'

import { slugify } from '@/lib/slugify'

describe('slugify', () => {
  it('makes clean English slugs', () => {
    expect(slugify('Birthstone Name Necklace')).toBe('birthstone-name-necklace')
    expect(slugify('  Love & Hugs — Earrings! ')).toBe('love-and-hugs-earrings')
    expect(slugify('Café Ring 925')).toBe('cafe-ring-925')
  })

  it('transliterates Arabic-only names', () => {
    expect(slugify('سارة')).toBe('sara')
    expect(slugify('خاتم الخط الكوفي')).toBe('khatm-alkht-alkwfy')
    expect(slugify('قِلادة')).toBe('qlada')
  })

  it('caps the length without a trailing dash', () => {
    const s = slugify('word '.repeat(40))
    expect(s.length).toBeLessThanOrEqual(80)
    expect(s.endsWith('-')).toBe(false)
  })
})

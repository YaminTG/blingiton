// Birthstones (by month) and gem colours the customer can pick on personalised pieces.
// Black onyx has no month, so birthstone pieces skip it.
export const stones = [
  { en: 'January', ar: 'كانون الثاني', sen: 'Garnet', sar: 'عقيق أحمر', c: '#8B1A2B' },
  { en: 'February', ar: 'شباط', sen: 'Amethyst', sar: 'جمشت', c: '#8E5BB5' },
  { en: 'March', ar: 'آذار', sen: 'Aquamarine', sar: 'أكوامارين', c: '#7FCFD6' },
  { en: 'April', ar: 'نيسان', sen: 'Crystal', sar: 'كريستال', c: '#E8EEF2' },
  { en: 'May', ar: 'أيار', sen: 'Emerald', sar: 'زمرد', c: '#1E8C5A' },
  { en: 'June', ar: 'حزيران', sen: 'Pearl', sar: 'لؤلؤ', c: '#EDE3D6' },
  { en: 'July', ar: 'تموز', sen: 'Ruby', sar: 'ياقوت أحمر', c: '#C8102E' },
  { en: 'August', ar: 'آب', sen: 'Peridot', sar: 'زبرجد', c: '#A6C43A' },
  { en: 'September', ar: 'أيلول', sen: 'Sapphire', sar: 'ياقوت أزرق', c: '#1F4FB5' },
  { en: 'October', ar: 'تشرين الأول', sen: 'Tourmaline', sar: 'تورمالين', c: '#F2A2C0' },
  { en: 'November', ar: 'تشرين الثاني', sen: 'Citrine', sar: 'سترين', c: '#F1A93B' },
  { en: 'December', ar: 'كانون الأول', sen: 'Turquoise', sar: 'فيروز', c: '#3FB8C9' },
  { en: '', ar: '', sen: 'Black onyx', sar: 'عقيق أسود', c: '#1B1A1E' },
] as const

export type StoneKind = 'birthstone' | 'gem'

/** "October · Tourmaline" for birthstone pieces, just the gem name otherwise. */
export const stoneLabel = (i: number, kind: StoneKind, ar: boolean) => {
  const s = stones[i]
  const gem = ar ? s.sar : s.sen
  return kind === 'birthstone' && s.en ? `${ar ? s.ar : s.en} · ${gem}` : gem
}

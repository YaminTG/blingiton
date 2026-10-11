// A 0–100 SEO score per product, from the same rules the pipeline checks. Stored on the product
// (seoScore) so the admin list can sort and filter by it; the breakdown is shown on the product page.

import { locales, type Locale } from '@/lib/locales'

import { LIMITS, arabicShare, isEmpty, type TextKind } from './rules'

type Text2 = { en: string; ar: string }
export type ScoreCheck = { id: string; label: Text2; points: number; max: number; note?: Text2 }
export type Score = { score: number; checks: ScoreCheck[] }

// With locale: 'all', localized fields come back as { en, ar }.
type AllLocales = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const at = (v: unknown, l: Locale): string | undefined =>
  v && typeof v === 'object' ? ((v as Record<string, string | undefined>)[l] ?? undefined) : undefined

const lang: Record<Locale, Text2> = { en: { en: 'English', ar: 'إنجليزي' }, ar: { en: 'Arabic', ar: 'عربي' } }

/** Full points when the text passes the rules, half when it is there but off, none when missing. */
function textCheck(id: string, label: Text2, kind: TextKind, l: Locale, value: unknown, max: number): ScoreCheck {
  const full = { id: `${id}.${l}`, label: { en: `${label.en} (${lang[l].en})`, ar: `${label.ar} (${lang[l].ar})` }, max }
  if (isEmpty(value)) return { ...full, points: 0, note: { en: 'Missing', ar: 'غير موجود' } }
  const text = (value as string).trim()
  const { min, max: most } = LIMITS[kind]
  const range = `${min}–${most}`
  const share = arabicShare(text)
  let note: Text2 | undefined
  if (text.length < min) note = { en: `Too short: ${text.length} characters, aim for ${range}`, ar: `قصير: ${text.length} حرفاً، المطلوب ${range}` }
  else if (text.length > most) note = { en: `Too long: ${text.length} characters, aim for ${range}`, ar: `طويل: ${text.length} حرفاً، المطلوب ${range}` }
  else if (l === 'ar' && share < 0.6) note = { en: 'Not written in Arabic', ar: 'غير مكتوب بالعربية' }
  else if (l === 'en' && share > 0.2) note = { en: 'Contains Arabic', ar: 'يحتوي على عربي' }
  return { ...full, points: note ? max / 2 : max, ...(note ? { note } : {}) }
}

const check = (id: string, label: Text2, ok: boolean, max: number, note?: Text2): ScoreCheck => ({
  id,
  label,
  max,
  points: ok ? max : 0,
  ...(ok || !note ? {} : { note }),
})

/**
 * `doc` must be read with locale: 'all' and depth ≥ 1 (so photos come with their size and alt text);
 * `reviews` is its number of approved reviews.
 */
export function scoreProduct(doc: AllLocales, reviews: number): Score {
  const images: AllLocales[] = (doc.images ?? []).filter((m: unknown) => m && typeof m === 'object')
  const main = images[0]
  const checks: ScoreCheck[] = [
    ...locales.flatMap((l) => [
      textCheck('metaTitle', { en: 'SEO title', ar: 'عنوان السيو' }, 'metaTitle', l, at(doc.meta?.title, l), 10),
      textCheck('metaDescription', { en: 'SEO description', ar: 'وصف السيو' }, 'metaDescription', l, at(doc.meta?.description, l), 10),
      textCheck('description', { en: 'Description', ar: 'الوصف' }, 'description', l, at(doc.description, l), 10),
      textCheck('shortDescription', { en: 'Short description', ar: 'الوصف القصير' }, 'shortDescription', l, at(doc.shortDescription, l), 2),
    ]),
    textCheck('name', { en: 'Name', ar: 'الاسم' }, 'name', 'ar', at(doc.name, 'ar'), 4),
    check('photo', { en: 'Main photo', ar: 'الصورة الرئيسية' }, Boolean(main), 8, { en: 'Add at least one photo', ar: 'أضف صورة واحدة على الأقل' }),
    check('sharp', { en: 'Sharp main photo (800px+)', ar: 'صورة رئيسية واضحة (800 بكسل+)' }, Boolean(main && !main.lowResolution), 6, main
      ? { en: `Only ${main.width}px wide; upload a larger photo`, ar: `عرضها ${main.width} بكسل فقط؛ ارفع صورة أكبر` }
      : { en: 'No photo yet', ar: 'لا توجد صورة بعد' }),
    check('gallery', { en: 'Two or more photos', ar: 'صورتان أو أكثر' }, images.length >= 2, 4, { en: 'Add another angle or a worn photo', ar: 'أضف زاوية أخرى أو صورة وهي ملبوسة' }),
    ...locales.map((l) =>
      main
        ? textCheck('alt', { en: 'Photo description', ar: 'وصف الصورة' }, 'alt', l, at(main.alt, l), 2)
        : check(`alt.${l}`, { en: `Photo description (${lang[l].en})`, ar: `وصف الصورة (${lang[l].ar})` }, false, 2, { en: 'No photo yet', ar: 'لا توجد صورة بعد' }),
    ),
    check('reviews', { en: 'Customer reviews', ar: 'تقييمات الزبائن' }, reviews > 0, 8, {
      en: 'No approved reviews yet; they give the piece star ratings on Google',
      ar: 'لا توجد تقييمات معتمدة بعد؛ هي التي تُظهر النجوم في جوجل',
    }),
    check('price', { en: 'Price set', ar: 'السعر محدد' }, Number(doc.price) > 0, 2, { en: 'Price is 0, so the piece is hidden from the shop', ar: 'السعر 0 لذلك القطعة مخفية من المتجر' }),
  ]
  const score = Math.round(checks.reduce((sum, c) => sum + c.points, 0))
  return { score, checks }
}

/** Colour band for a score, shared by the list badge, the product panel and the dashboard. */
export const scoreBand = (score: number | null | undefined) =>
  score == null ? 'none' : score >= 90 ? 'good' : score >= 70 ? 'fair' : 'poor'

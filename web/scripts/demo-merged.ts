/**
 * Builds merged products from the owner's catalog spec (Bling_It_On_Developer_Product_Tables.docx),
 * so the step-by-step product page can be shown with real photos and prices. Each one takes the
 * photos, categories and prices of the old separate products it merges; the old products are left
 * as they are (no redirects: the spec asks for an SEO review of each old URL first).
 * Safe to re-run: products are found by slug and updated.
 *
 *   npx payload run scripts/demo-merged.ts < /dev/null
 *
 * Extras and stock counts that the spec doesn't give are 0 / left out, except the Colorful
 * Character stock counts, which are placeholders to show per-design stock (one design sold out).
 */
import { getPayload, type Payload } from 'payload'

import type { Picture } from '../src/lib/choices'
import type { Product } from '../src/payload-types'
import config from '../src/payload.config'

type L = { en: string; ar: string }
type DChoice = { key: string; label: L; extra?: number; picture?: Picture; photoFrom?: number; when?: string[] }
type DQuestion = { key: string; name: L; look: NonNullable<NonNullable<Product['personalization']['options']>[number]['look']>; when?: string[]; choices: DChoice[] }
type DVariant = { key: string; when: string[]; price?: number; stock?: number; photoFrom?: number }
type Demo = {
  slug: string
  name: L
  /** Old products merged into this one; the first gives the kind and categories. */
  from: number[]
  price: number
  questions: DQuestion[]
  variants?: DVariant[]
  personalization?: { type: 'engrave' | 'name' | 'letters'; textOptional?: boolean; defaultStyle?: 'script' | 'classic' | 'modern' | 'kufi' }
}

const SILVER: L = { en: 'Silver 925', ar: 'فضة 925' }
const GOLD: L = { en: '18K gold plated', ar: 'مطلي بذهب عيار 18' }

const DEMOS: Demo[] = [
  // Spec 2: two sizes; zircon only on 1.5 cm; normal or paper clip chain; silver or gold.
  {
    slug: 'jordan-map-outline-necklace',
    name: { en: 'Jordan Map Outline Necklace', ar: 'قلادة خريطة الأردن' },
    from: [44, 40],
    price: 30,
    questions: [
      {
        key: 'size',
        name: { en: 'Size', ar: 'الحجم' },
        look: 'size',
        choices: [
          { key: 's15', label: { en: '1.5 cm', ar: '1.5 سم' }, photoFrom: 44 },
          { key: 's3', label: { en: '3 cm', ar: '3 سم' }, photoFrom: 40 },
        ],
      },
      {
        key: 'zircon',
        name: { en: 'Zircon', ar: 'الزركون' },
        look: 'sparkle',
        when: ['s15'],
        choices: [
          { key: 'zno', label: { en: 'Without zircon', ar: 'بدون زركون' }, picture: 'silver' },
          { key: 'zyes', label: { en: 'With zircon', ar: 'مع زركون' }, picture: 'white' },
        ],
      },
      {
        key: 'chain',
        name: { en: 'Chain', ar: 'السلسلة' },
        look: 'chain',
        choices: [
          { key: 'normal', label: { en: 'Normal chain', ar: 'سلسلة عادية' }, picture: 'cable' },
          { key: 'clip', label: { en: 'Paper clip chain', ar: 'سلسلة مشبك' }, picture: 'paperclip' },
        ],
      },
      {
        key: 'finish',
        name: { en: 'Finish', ar: 'المعدن' },
        look: 'finish',
        choices: [
          { key: 'silver', label: SILVER, picture: 'silver' },
          { key: 'gold', label: GOLD, picture: 'gold' },
        ],
      },
    ],
  },

  // Spec 13: Small is gold only; Big is silver or gold, with or without the 3D olive branch;
  // optional custom engraving on both.
  {
    slug: 'zaytona-olive-necklace',
    name: { en: 'Zaytona Necklace', ar: 'قلادة زيتونة' },
    from: [535, 247],
    price: 35,
    personalization: { type: 'engrave', textOptional: true, defaultStyle: 'classic' },
    questions: [
      {
        key: 'size',
        name: { en: 'Size', ar: 'الحجم' },
        look: 'size',
        choices: [
          { key: 'small', label: { en: 'Small', ar: 'صغير' }, photoFrom: 535 },
          { key: 'big', label: { en: 'Big', ar: 'كبير' }, extra: 25, photoFrom: 247 },
        ],
      },
      {
        key: 'branch',
        name: { en: 'Olive branch', ar: 'غصن الزيتون' },
        look: 'sparkle',
        when: ['big'],
        choices: [
          { key: 'plain', label: { en: 'Without olive branch', ar: 'بدون غصن زيتون' } },
          { key: 'olive', label: { en: '3D olive branch (غصن زيتون)', ar: 'غصن زيتون ثلاثي الأبعاد' } },
        ],
      },
      {
        key: 'finish',
        name: { en: 'Finish', ar: 'المعدن' },
        look: 'finish',
        choices: [
          { key: 'silver', label: SILVER, picture: 'silver', when: ['big'] },
          { key: 'gold', label: GOLD, picture: 'gold' },
        ],
      },
    ],
  },

  // Spec 21: three old pages in one. Bracelet colour, pendant, zircon for map and coin, pendant colour.
  {
    slug: 'steel-bracelet-collection',
    name: { en: 'Steel Bracelet Collection', ar: 'مجموعة الأساور الستانلس' },
    from: [493, 551, 533],
    price: 65,
    questions: [
      {
        key: 'pendant',
        name: { en: 'Pendant', ar: 'الدلاية' },
        look: 'design',
        choices: [
          { key: 'quote', label: { en: 'Darwish quote', ar: 'مقولة درويش' }, extra: 4, photoFrom: 551 },
          { key: 'map', label: { en: 'Palestine map', ar: 'خريطة فلسطين' }, photoFrom: 493 },
          { key: 'coin', label: { en: 'Palestine coin', ar: 'العملة الفلسطينية' }, extra: 10, photoFrom: 533 },
        ],
      },
      {
        key: 'zircon',
        name: { en: 'Zircon', ar: 'الزركون' },
        look: 'sparkle',
        when: ['map', 'coin'],
        choices: [
          { key: 'std', label: { en: 'Standard', ar: 'عادي' }, picture: 'silver' },
          { key: 'zir', label: { en: 'With zircon', ar: 'مع زركون' }, picture: 'white' },
        ],
      },
      {
        key: 'band',
        name: { en: 'Bracelet colour', ar: 'لون السوار' },
        look: 'colour',
        choices: [
          { key: 'bsilver', label: { en: 'Silver', ar: 'فضي' }, picture: 'silver' },
          { key: 'bgold', label: { en: 'Gold', ar: 'ذهبي' }, picture: 'gold' },
          { key: 'brose', label: { en: 'Rose gold', ar: 'ذهبي وردي' }, picture: 'rose' },
          { key: 'bblack', label: { en: 'Black', ar: 'أسود' }, picture: 'black' },
          { key: 'bnavy', label: { en: 'Navy', ar: 'كحلي' }, picture: 'navy' },
        ],
      },
      {
        key: 'pcolour',
        name: { en: 'Pendant colour', ar: 'لون الدلاية' },
        look: 'finish',
        choices: [
          { key: 'psilver', label: { en: 'Silver', ar: 'فضي' }, picture: 'silver' },
          { key: 'pgold', label: { en: 'Gold', ar: 'ذهبي' }, picture: 'gold' },
        ],
      },
    ],
  },

  // Spec 22: five old pages in one, same price, stock entered per design.
  {
    slug: 'colorful-character-necklace',
    name: { en: 'Colorful Character Necklace – 925 Sterling Silver', ar: 'قلادة الشخصية الملونة – فضة 925' },
    from: [1, 2, 3, 4, 5],
    price: 45,
    questions: [
      {
        key: 'design',
        name: { en: 'Design', ar: 'التصميم' },
        look: 'design',
        choices: [
          { key: 'pink', label: { en: 'Pink', ar: 'وردي' }, picture: 'pink', photoFrom: 1 },
          { key: 'turq', label: { en: 'Turquoise', ar: 'فيروزي' }, picture: 'turquoise', photoFrom: 2 },
          { key: 'kitty', label: { en: 'Kitty', ar: 'كيتي' }, picture: 'white', photoFrom: 4 },
          { key: 'orange', label: { en: 'Orange', ar: 'برتقالي' }, picture: 'orange', photoFrom: 3 },
          { key: 'purple', label: { en: 'Purple', ar: 'بنفسجي' }, picture: 'purple', photoFrom: 5 },
        ],
      },
    ],
    // Placeholder counts until the owner enters the real ones.
    variants: [
      { key: 'vpink', when: ['pink'], stock: 3 },
      { key: 'vturq', when: ['turq'], stock: 2 },
      { key: 'vkitty', when: ['kitty'], stock: 4 },
      { key: 'vorange', when: ['orange'], stock: 0 },
      { key: 'vpurple', when: ['purple'], stock: 1 },
    ],
  },

  // Spec 24: two old pages in one; the design changes the photo and the price.
  {
    slug: 'hometown-palestine-necklace',
    name: { en: 'Hometown Palestine Necklace – 925 Sterling Silver', ar: 'قلادة موطني فلسطين – فضة 925' },
    from: [239, 548],
    price: 57,
    questions: [
      {
        key: 'design',
        name: { en: 'Design', ar: 'التصميم' },
        look: 'design',
        choices: [
          { key: 'colorful', label: { en: 'Colorful Palestine map', ar: 'خريطة فلسطين الملونة' }, extra: 7, photoFrom: 548 },
          { key: 'mawatini', label: { en: 'Mawatini (موطني)', ar: 'موطني' }, photoFrom: 239 },
        ],
      },
      {
        key: 'finish',
        name: { en: 'Finish', ar: 'المعدن' },
        look: 'finish',
        choices: [
          { key: 'silver', label: SILVER, picture: 'silver' },
          { key: 'gold', label: GOLD, picture: 'gold' },
        ],
      },
    ],
  },
]

const idOf = (v: unknown) => (v && typeof v === 'object' && 'id' in v ? (v as { id: number }).id : (v as number))

async function build(payload: Payload, demo: Demo) {
  const originals = await payload.find({ collection: 'products', where: { id: { in: demo.from } }, depth: 0, limit: demo.from.length, draft: true })
  const byId = new Map(originals.docs.map((p) => [p.id, p]))
  const missing = demo.from.filter((id) => !byId.has(id))
  if (missing.length) throw new Error(`${demo.slug}: old products ${missing.join(', ')} not found`)
  const first = byId.get(demo.from[0])!
  const photoOf = (id?: number) => (id ? (idOf(byId.get(id)?.images?.[0]) ?? null) : null)
  // Row ids are unique across all products, so they carry the product's slug.
  const rid = (key: string) => `${demo.slug}--${key}`
  const images = [...new Set(demo.from.flatMap((id) => (byId.get(id)!.images ?? []).map(idOf)))]

  const data = (locale: 'en' | 'ar') => ({
    name: demo.name[locale],
    slug: demo.slug,
    price: demo.price,
    kind: first.kind,
    categories: (first.categories ?? []).map(idOf),
    images,
    availability: 'in_stock' as const,
    restock: 'restocked' as const,
    personalization: {
      type: demo.personalization?.type ?? 'none',
      textOptional: demo.personalization?.textOptional ?? false,
      defaultStyle: demo.personalization?.defaultStyle ?? 'script',
      stones: 'none' as const,
      goldPlated: false,
      chainLengths: [],
      options: demo.questions.map((q) => ({
        id: rid(q.key),
        name: q.name[locale],
        look: q.look,
        when: q.when?.map(rid) ?? null,
        choices: q.choices.map((c) => ({
          id: rid(c.key),
          label: c.label[locale],
          extraPrice: c.extra ?? 0,
          picture: c.picture ?? null,
          photo: photoOf(c.photoFrom),
          when: c.when?.map(rid) ?? null,
        })),
      })),
      variants: (demo.variants ?? []).map((v) => ({ id: rid(v.key), when: v.when.map(rid), price: v.price ?? null, stock: v.stock ?? null, photo: photoOf(v.photoFrom) })),
    },
    _status: 'published' as const,
  })

  const found = await payload.find({ collection: 'products', where: { slug: { equals: demo.slug } }, limit: 1, depth: 0, draft: true })
  const context = { skipSeo: true }
  const id = found.docs[0]
    ? (await payload.update({ collection: 'products', id: found.docs[0].id, data: data('en') as never, locale: 'en', context })).id
    : (await payload.create({ collection: 'products', data: data('en') as never, locale: 'en', context })).id
  await payload.update({ collection: 'products', id, data: data('ar') as never, locale: 'ar', context })
  console.log(`${found.docs[0] ? 'updated' : 'created'} ${id} /en/product/${demo.slug}  (from ${demo.from.join(', ')})`)
}

const payload = await getPayload({ config })
for (const demo of DEMOS) await build(payload, demo)
process.exit(0)

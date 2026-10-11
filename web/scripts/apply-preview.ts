/**
 * Copies the hand-tuned settings from the clickable preview (preview/assets/data.js) into the database:
 * personalization for the preview's products, the home page photos, and the Delivery / Silver care pages.
 * Safe to re-run.
 *
 *   npx payload run scripts/apply-preview.ts
 */
import { getPayload, type Payload } from 'payload'

import type { Product } from '../src/payload-types'
import config from '../src/payload.config'

type Personal = {
  id: number
  personal: 'name' | 'letters' | 'engrave'
  kind: string
  shape?: string
  estyle?: string
  stone?: boolean
  gem?: boolean
  sample?: { en: string; ar: string }
}

// From preview/assets/data.js.
const PREVIEW: Personal[] = [
  { id: 10830, personal: 'name', shape: 'plate', stone: true, kind: 'necklace' },
  { id: 13427, personal: 'name', shape: 'plate', gem: true, kind: 'necklace' },
  { id: 13712, personal: 'letters', kind: 'necklace' },
  { id: 10852, personal: 'name', gem: true, kind: 'necklace' },
  { id: 10714, personal: 'name', gem: true, kind: 'bracelet' },
  { id: 10722, personal: 'letters', gem: true, kind: 'bracelet' },
  { id: 10785, personal: 'engrave', shape: 'bandcut', estyle: 'script', gem: true, kind: 'ring', sample: { en: 'Ghada', ar: 'غادة' } },
  { id: 10787, personal: 'engrave', shape: 'bandcut', estyle: 'kufi', gem: true, kind: 'ring', sample: { en: 'Sara', ar: 'سارة' } },
  { id: 10788, personal: 'engrave', shape: 'band', estyle: 'classic', gem: true, kind: 'ring', sample: { en: 'Tareq · Eman', ar: 'طارق · إيمان' } },
  { id: 10789, personal: 'engrave', shape: 'square', estyle: 'script', gem: true, kind: 'ring', sample: { en: 'Sara', ar: 'سارة' } },
  { id: 10744, personal: 'engrave', shape: 'disc', estyle: 'classic', kind: 'cufflinks', sample: { en: 'MZ', ar: 'م ز' } },
  { id: 10739, personal: 'engrave', shape: 'enamel', estyle: 'script', kind: 'cufflinks', sample: { en: 'Mohammad', ar: 'محمد' } },
  { id: 10738, personal: 'engrave', shape: 'cut', estyle: 'script', kind: 'cufflinks', sample: { en: 'Faris', ar: 'فارس' } },
  { id: 10740, personal: 'engrave', shape: 'cut', estyle: 'classic', kind: 'cufflinks', sample: { en: 'MS', ar: 'م س' } },
]

// Photos used on the home page, with the crop the preview used (object-position, in %).
const HERO = 10830
const GIFT = { id: 10728, focal: [50, 18] }
const INSTAGRAM = [
  { id: 16160, focal: [50, 72] },
  { id: 16164, focal: [55, 58] },
  { id: 13019, focal: [48, 60] },
  { id: 17122, focal: [40, 70] },
]

const payload = await getPayload({ config })
const ctx = { skipSeo: true }

const byWoo = async (wooId: number) =>
  (await payload.find({ collection: 'products', where: { 'legacy.wooId': { equals: wooId } }, limit: 1, depth: 0 })).docs[0] as Product | undefined

const mainImage = (p: Product | undefined) => {
  const first = p?.images?.[0]
  return typeof first === 'object' ? first?.id : first
}

async function applyPersonalization(payload: Payload) {
  for (const item of PREVIEW) {
    const doc = await byWoo(item.id)
    if (!doc) {
      console.log(`! #${item.id} not found`)
      continue
    }
    const chains = item.personal === 'engrave' ? [] : item.kind === 'bracelet' ? ['16', '18', '20'] : ['40', '45', '50']
    for (const locale of ['en', 'ar'] as const) {
      const current = (await payload.findByID({ collection: 'products', id: doc.id, locale, depth: 0 })).personalization
      await payload.update({
        collection: 'products',
        id: doc.id,
        locale,
        context: ctx,
        data: {
          personalization: {
            ...current,
            type: item.personal,
            previewShape: (item.shape ?? null) as NonNullable<Product['personalization']>['previewShape'],
            defaultStyle: (item.estyle ?? (item.personal === 'letters' ? 'modern' : 'script')) as 'script',
            sampleText: item.sample?.[locale] ?? null,
            stones: item.stone ? 'birthstone' : item.gem ? 'gem' : 'none',
            goldPlated: true,
            chainLengths: chains as NonNullable<Product['personalization']>['chainLengths'],
          },
        },
      })
    }
    console.log(`✓ #${item.id} ${doc.slug}`)
  }
}

async function applyHome() {
  const hero = await byWoo(HERO)
  const gift = await byWoo(GIFT.id)
  const insta = await Promise.all(INSTAGRAM.map((i) => byWoo(i.id)))
  // Focal points only steer the crop on the home page; set straight in the database so the
  // existing image sizes aren't regenerated.
  for (const [p, focal] of [[gift, GIFT.focal], ...insta.map((p, i) => [p, INSTAGRAM[i].focal] as const)] as const) {
    const id = mainImage(p)
    if (id) await payload.db.updateOne({ collection: 'media', id, data: { focalX: focal[0], focalY: focal[1] } })
  }
  await payload.updateGlobal({
    slug: 'site-settings',
    context: ctx,
    data: {
      home: {
        heroProduct: hero?.id ?? null,
        giftPhoto: mainImage(gift) ?? null,
        instagramPhotos: insta.map(mainImage).filter((id): id is number => typeof id === 'number'),
        followers: '69K',
      },
      delivery: { amman: 3, jordan: 5, international: 15 },
    },
  })
  console.log('✓ home page photos and delivery fees')
}

const richText = (paragraphs: string[], direction: 'ltr' | 'rtl') => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction,
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      format: '' as const,
      indent: 0,
      version: 1,
      direction,
      textFormat: 0,
      textStyle: '',
      children: [{ type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '', version: 1 }],
    })),
  },
})

// The text the preview's product page already shows; the shop can expand these in the admin.
const PAGES = [
  {
    slug: 'delivery',
    en: {
      title: 'Delivery',
      body: [
        'We deliver across Jordan, and worldwide with DHL Express.',
        'Personalised pieces are made to order in 4 days. Pieces in stock are ready to ship.',
        'Pay online by card, or by card or cash when your order arrives.',
      ],
    },
    ar: {
      title: 'التوصيل',
      body: [
        'نوصل لكل مناطق الأردن، ولكل العالم عبر DHL Express.',
        'القطع المخصّصة تُصنع حسب الطلب خلال 4 أيام. القطع المتوفرة جاهزة للشحن.',
        'ادفع أونلاين بالبطاقة، أو بالبطاقة أو نقداً عند استلام طلبك.',
      ],
    },
  },
  {
    slug: 'silver-care',
    en: {
      title: 'Silver care',
      body: [
        'Every piece is 925 sterling silver.',
        'Keep it dry, take it off before swimming or showering, and store it in its pink box to keep the shine.',
      ],
    },
    ar: {
      title: 'العناية بالفضة',
      body: ['كل القطع مصنوعة من الفضة 925.', 'حافظ عليها جافة، وانزعها قبل السباحة أو الاستحمام، واحفظها في علبتها الوردية لتبقى لامعة.'],
    },
  },
]

async function applyPages() {
  for (const page of PAGES) {
    const existing = (await payload.find({ collection: 'pages', where: { slug: { equals: page.slug } }, limit: 1, depth: 0 })).docs[0]
    if (existing) {
      console.log(`- page ${page.slug} already exists, left as is`)
      continue
    }
    const created = await payload.create({
      collection: 'pages',
      locale: 'en',
      context: ctx,
      data: { title: page.en.title, slug: page.slug, content: richText(page.en.body, 'ltr'), _status: 'published' },
    })
    await payload.update({
      collection: 'pages',
      id: created.id,
      locale: 'ar',
      context: ctx,
      data: { title: page.ar.title, content: richText(page.ar.body, 'rtl'), _status: 'published' },
    })
    console.log(`✓ page ${page.slug}`)
  }
}

// The preview's top menu: Name pieces, Earrings, Rings.
async function applyMenu() {
  const menu = ['personalized-necklaces', 'earrings', 'rings']
  const { docs } = await payload.find({ collection: 'categories', limit: 0, depth: 0, select: { slug: true, inMenu: true } })
  for (const c of docs) {
    const want = menu.includes(c.slug ?? '')
    if (Boolean(c.inMenu) !== want) await payload.update({ collection: 'categories', id: c.id, data: { inMenu: want }, context: ctx })
  }
  console.log(`✓ top menu: ${menu.join(', ')}`)
}

await applyPersonalization(payload)
await applyHome()
await applyPages()
await applyMenu()
process.exit(0)

import type { Category, Product } from '@/payload-types'
import { getIndexables, getSettings, listCategories } from '@/lib/data'
import { dictionary } from '@/lib/dictionary'
import { feesFrom } from '@/lib/shipping'
import { absolute, money, paths } from '@/lib/urls'
import { BRAND } from '@/seo/rules'

// /llms.txt (llmstxt.org): a plain summary of the shop for AI assistants, built from the same
// CMS facts as the pages, so it never says more than the site does. Regenerates with the caches.
export const revalidate = 3600

const line = (s: string) => s.replace(/\s+/g, ' ').trim()
/** First sentence, capped, so one product stays one line. */
const short = (s: string) => {
  const text = line(s)
  const first = text.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? text
  return first.length > 160 ? `${first.slice(0, 157).trimEnd()}…` : first
}
const availabilityNote: Record<Product['availability'], string> = { in_stock: '', made_to_order: 'made to order', sold_out: 'sold out' }

export async function GET() {
  const t = dictionary('en')
  const [settings, categories, { products, pages }] = await Promise.all([getSettings('en'), listCategories('en'), getIndexables()])
  const name = settings.businessName || BRAND
  const summary = settings.pageSeo?.homeDescription || settings.tagline
  const facts = (settings.seoWriting?.facts ?? '').split('\n').map(line).filter(Boolean)
  const d = settings.delivery
  const city = settings.address?.city

  const out: string[] = [`# ${name}`, '']
  if (summary) out.push(`> ${line(summary)}`, '')
  out.push(
    `${name} is an online jewelry shop${city ? ` based in ${city}, Jordan` : ' in Jordan'}. The site is in English (${absolute(paths.home('en'))}) and Arabic (${absolute(paths.home('ar'))}).`,
    // Mirrors placeOrder in src/lib/orders.ts. Update when HyperPay takes international card payments.
    `Orders are placed on the website. In Jordan, customers pay by card or cash on delivery. For international orders, the shop arranges payment with the customer on WhatsApp after the order is placed.`,
  )
  const contact = [
    settings.whatsapp && `WhatsApp: +${settings.whatsapp}`,
    settings.phone && `Phone: ${settings.phone}`,
    settings.email && `Email: ${settings.email}`,
    settings.social?.instagram && `Instagram: ${settings.social.instagram}`,
    settings.social?.tiktok && `TikTok: ${settings.social.tiktok}`,
  ].filter(Boolean)
  if (contact.length) out.push('', ...contact.map((c) => `- ${c}`))

  if (facts.length) out.push('', '## About the jewelry', '', ...facts.map((f) => `- ${f}`))

  if (d) {
    const fees = feesFrom(d)
    const zones = (m: 'intl' | 'intl_standard') =>
      `Middle East & Gulf ${money(fees[m].me, 'en')}, Europe ${money(fees[m].europe, 'en')}, USA and rest of world ${money(fees[m].us, 'en')}`
    out.push(
      '',
      '## Delivery and payment',
      '',
      `- ${t.co.amman}: ${money(fees.amman, 'en')}, ${t.co.ammanTime}`,
      `- ${t.co.jordanCities}: ${money(fees.jordan, 'en')}, ${t.co.jordanTime}`,
      `- ${t.co.intl}, ${t.co.intlTime}: ${zones('intl')}`,
      `- ${t.co.intlStd}, ${t.co.intlStdTime}: ${zones('intl_standard')}`,
      `- ${t.co.madeNote}`,
      `- ${t.co.surcharge}`,
      `- ${t.co.giftCard}: ${money(fees.giftCard, 'en')}`,
      `- ${t.madeLine}`,
      `- ${t.deliveryBody}`,
    )
    if (d.returnDays != null) {
      out.push(
        d.returnDays > 0
          ? `- Returns accepted within ${d.returnDays} days${d.personalisedReturns ? '' : ' (name and engraved pieces are made to order and cannot be returned)'}`
          : '- Returns are not accepted',
      )
    }
  }

  // Every listed product, under its top-level category (the first one it's filed in).
  const byId = new Map(categories.map((c) => [c.id, c]))
  const topOf = (c: Category | undefined) => {
    const seen = new Set<number>()
    while (c?.parent && !seen.has(c.id)) {
      seen.add(c.id)
      c = byId.get(typeof c.parent === 'object' ? c.parent.id : c.parent) ?? c
    }
    return c
  }
  const groups = new Map<number | null, Product[]>()
  for (const p of products.filter((p) => p.price > 0 && p.slug)) {
    const first = (p.categories ?? []).map((c) => byId.get(typeof c === 'object' ? c.id : c)).find(Boolean)
    const key = topOf(first)?.id ?? null
    const list = groups.get(key) ?? []
    list.push(p)
    groups.set(key, list)
  }
  const sections = [...categories.filter((c) => !c.parent && c.slug).map((c) => [c, groups.get(c.id)] as const), [null, groups.get(null)] as const]
  for (const [c, list] of sections) {
    if (!list?.length) continue
    out.push('', `## ${c ? c.name : 'Other pieces'}`, '')
    const about = c && (c.meta?.description || c.intro)
    if (c) out.push(`[All ${c.name.toLowerCase()}](${absolute(paths.category('en', c.slug ?? ''))})${about ? `: ${line(about)}` : ''}`, '')
    for (const p of list) {
      const blurb = p.shortDescription || p.description
      const note = availabilityNote[p.availability]
      out.push(`- [${line(p.name)}](${absolute(paths.product('en', p.slug ?? ''))}): ${money(p.price, 'en')}${note ? `, ${note}` : ''}${blurb ? `. ${short(blurb)}` : ''}`)
    }
  }

  const info = pages.filter((p) => p.slug)
  if (info.length) {
    out.push('', '## Information', '')
    for (const p of info) out.push(`- [${p.title || p.slug}](${absolute(paths.page('en', p.slug ?? ''))})`)
  }

  out.push(
    '',
    '## Optional',
    '',
    `- [All products](${absolute(paths.shop('en'))})`,
    `- [Sitemap](${absolute('/sitemap.xml')}): every product and category, in English and Arabic`,
    `- [Product feed](${absolute('/feeds/google.xml')}): prices and availability for every product`,
    '',
  )

  return new Response(out.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' },
  })
}

import type { Category } from '@/payload-types'
import { getIndexables, imageUrl, mediaOf } from '@/lib/data'
import { absolute, paths } from '@/lib/urls'
import { BRAND } from '@/seo/rules'

// Google Merchant Center product feed (free listings). Regenerates with the product cache.
export const revalidate = 3600

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const availability = { in_stock: 'in_stock', made_to_order: 'in_stock', sold_out: 'out_of_stock' } as const

export async function GET() {
  const { products } = await getIndexables()
  const items = products
    .filter((p) => p.price > 0 && p.images?.length)
    .map((p) => {
      const [main, ...more] = (p.images ?? []).map((m) => imageUrl(mediaOf(m), 'large')).filter((u): u is string => Boolean(u))
      const category = (p.categories ?? []).find((c): c is Category => typeof c === 'object')
      return `<item>
<g:id>BL-${p.id}</g:id>
<g:title>${esc(p.name)}</g:title>
<g:description>${esc(p.description || p.shortDescription || p.name)}</g:description>
<g:link>${esc(absolute(paths.product('en', p.slug ?? '')))}</g:link>
<g:image_link>${esc(absolute(main))}</g:image_link>
${more.slice(0, 10).map((u) => `<g:additional_image_link>${esc(absolute(u))}</g:additional_image_link>`).join('\n')}
<g:availability>${availability[p.availability]}</g:availability>
<g:price>${p.price.toFixed(2)} JOD</g:price>
<g:brand>${BRAND}</g:brand>
<g:condition>new</g:condition>
<g:identifier_exists>no</g:identifier_exists>
<g:google_product_category>188</g:google_product_category>
${category ? `<g:product_type>${esc(category.name)}</g:product_type>` : ''}
</item>`
    })
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${BRAND}</title>
<link>${absolute('/en')}</link>
<description>${BRAND} handcrafted silver jewelry</description>
${items.join('\n')}
</channel>
</rss>`
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}

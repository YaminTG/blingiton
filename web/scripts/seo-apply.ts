/**
 * Applies SEO text written for the one-time batches (see scripts/seo-export.ts). Validates every
 * field against src/seo/rules.ts before anything is written.
 *
 *   npx payload run scripts/seo-apply.ts                      # every *.output.json in scripts/output/seo
 *   SEO_FILES=products-01 npx payload run scripts/seo-apply.ts # just one batch
 *   SEO_DRY_RUN=1 npx payload run scripts/seo-apply.ts         # check only, write nothing
 *   SEO_DIR=seo-v2 SEO_REWRITE=1 npx payload run scripts/seo-apply.ts
 *     # replace earlier AI-written text that nobody has edited since (never a person's text)
 *
 * Output files hold an array of { id, ...input }:
 *   products-*.output.json   ProductSeoInput, plus optional `slug` and `nameEn` corrections
 *   categories.output.json   CategorySeoInput
 *   pages.output.json        PageSeoInput
 *   site.output.json         a single { homeTitle, homeDescription, shopTitle, shopDescription } (each { en, ar })
 */
import fs from 'fs/promises'
import path from 'path'
import { getPayload } from 'payload'
import { fileURLToPath } from 'url'

import { upsertRedirect } from '../src/hooks/lifecycle'
import { locales } from '../src/lib/locales'
import config from '../src/payload.config'
import { applyCategorySeo, applyPageSeo, applyProductSeo, type CategorySeoInput, type Loc, type PageSeoInput, type ProductSeoInput } from '../src/seo/apply'
import { checkText, type TextKind } from '../src/seo/rules'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output', process.env.SEO_DIR || 'seo')
const only = process.env.SEO_FILES?.split(',')
const dryRun = Boolean(process.env.SEO_DRY_RUN)
const rewrite = Boolean(process.env.SEO_REWRITE)

type Entry = { id: number; slug?: string; nameEn?: string } & ProductSeoInput & CategorySeoInput & PageSeoInput
type SiteEntry = { homeTitle?: Loc; homeDescription?: Loc; shopTitle?: Loc; shopDescription?: Loc }

const kindOf = (file: string) => (file.startsWith('categories') ? 'categories' : file.startsWith('pages') ? 'pages' : file.startsWith('site') ? 'site' : 'products')
const order = { site: 0, pages: 1, categories: 2, products: 3 }
const files = (await fs.readdir(DIR))
  .filter((f) => f.endsWith('.output.json'))
  .filter((f) => !only || only.some((o) => f.startsWith(o)))
  .sort((a, b) => order[kindOf(a)] - order[kindOf(b)] || a.localeCompare(b))

const payload = await getPayload({ config })

// Pre-check everything first, so a bad batch is reported before anything is written.
const problems: string[] = []
const seenTitles = new Map<string, number>()
const seenDescriptions = new Map<string, number>()
const entries: { file: string; entry: Entry }[] = []
let site: SiteEntry | null = null
const takenSlugs = new Map(
  (await payload.find({ collection: 'products', limit: 0, depth: 0, draft: true, select: { slug: true } })).docs.map((d) => [d.slug ?? '', d.id]),
)

const checkLoc = (where: string, kind: TextKind, value: Loc | undefined) => {
  if (!value) return
  for (const l of locales) {
    const p = checkText(kind, l, value[l])
    if (p) problems.push(`${where}: ${p}`)
  }
}

for (const file of files) {
  const raw = JSON.parse(await fs.readFile(path.join(DIR, file), 'utf8'))
  if (kindOf(file) === 'site') {
    site = raw as SiteEntry
    checkLoc(file, 'metaTitle', site.homeTitle)
    checkLoc(file, 'metaTitle', site.shopTitle)
    checkLoc(file, 'metaDescription', site.homeDescription)
    checkLoc(file, 'metaDescription', site.shopDescription)
    continue
  }
  for (const entry of raw as Entry[]) {
    entries.push({ file, entry })
    const checks: [TextKind, keyof Entry][] = [
      ['metaTitle', 'metaTitle'],
      ['metaDescription', 'metaDescription'],
      ['shortDescription', 'shortDescription'],
      ['description', 'description'],
      ['intro', 'intro'],
      ['alt', 'mainAlt'],
      ['name', 'name'],
    ]
    for (const [kind, key] of checks) {
      const value = entry[key] as Loc | undefined
      if (!value) continue
      for (const l of locales) {
        // A field can be given in one language only (e.g. a better Arabic intro).
        if ((key === 'name' && l === 'en') || value[l] === undefined) continue
        const p = checkText(kind, l, value[l])
        if (p) problems.push(`${file} #${entry.id} ${String(key)}: ${p}`)
      }
    }
    if (entry.slug) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.slug)) problems.push(`${file} #${entry.id}: slug "${entry.slug}" isn't lowercase words joined by hyphens`)
      const owner = takenSlugs.get(entry.slug)
      if (owner !== undefined && owner !== entry.id) problems.push(`${file} #${entry.id}: slug "${entry.slug}" is already used by #${owner}`)
      takenSlugs.set(entry.slug, entry.id)
    }
    if (kindOf(file) === 'products') {
      for (const l of locales) {
        const t = entry.metaTitle?.[l]?.toLowerCase()
        const d = entry.metaDescription?.[l]?.toLowerCase()
        if (t && seenTitles.has(`${l}:${t}`)) problems.push(`${file} #${entry.id}: same SEO title (${l}) as #${seenTitles.get(`${l}:${t}`)}`)
        if (d && seenDescriptions.has(`${l}:${d}`)) problems.push(`${file} #${entry.id}: same SEO description (${l}) as #${seenDescriptions.get(`${l}:${d}`)}`)
        if (t) seenTitles.set(`${l}:${t}`, entry.id)
        if (d) seenDescriptions.set(`${l}:${d}`, entry.id)
      }
    }
  }
}
console.log(`${entries.length} entries in ${files.length} files, ${problems.length} problems${rewrite ? ' (rewrite mode)' : ''}`)
for (const p of problems) console.log(`  ✗ ${p}`)
if (dryRun || problems.length) process.exit(problems.length ? 1 : 0)

const ctx = { skipSeo: true }

if (site) {
  for (const l of locales) {
    const data = Object.fromEntries(Object.entries(site).map(([k, v]) => [k, (v as Loc)[l]]))
    await payload.updateGlobal({ slug: 'site-settings', locale: l, data: { pageSeo: data }, context: ctx })
  }
  console.log('home & shop SEO set')
}

const tally = { done: 0, attention: 0 }
const attention: string[] = []
for (const [i, { file, entry }] of entries.entries()) {
  const { id, slug, nameEn, ...input } = entry
  const kind = kindOf(file)

  // Address and spelling fixes first; the old address keeps working through a 301.
  if (kind === 'products' && (slug || nameEn)) {
    const before = await payload.findByID({ collection: 'products', id, depth: 0, draft: true, locale: 'en' })
    await payload.update({ collection: 'products', id, locale: 'en', draft: before._status === 'draft', depth: 0, context: ctx, data: { ...(slug ? { slug } : {}), ...(nameEn ? { name: nameEn } : {}) } })
    if (slug && before.slug && before.slug !== slug) await upsertRedirect(payload, `/product/${before.slug}`, 'products', id)
  }

  const result =
    kind === 'categories'
      ? await applyCategorySeo(payload, id, input, 'session', { rewrite })
      : kind === 'pages'
        ? await applyPageSeo(payload, id, input, 'session', { rewrite })
        : await applyProductSeo(payload, id, input, 'session', { rewrite })
  tally[result.status]++
  if (result.status === 'attention') {
    const doc = await payload.findByID({ collection: kind as 'products', id, depth: 0, draft: true })
    attention.push(`#${id} ${String(doc.name ?? (doc as unknown as { title: string }).title)}: ${((doc.ai as { issues?: string[] })?.issues ?? []).join('; ')}`)
  }
  if ((i + 1) % 20 === 0) console.log(`applied ${i + 1}/${entries.length}`)
}
console.log(`Done: ${tally.done} complete, ${tally.attention} need a look`)
await fs.writeFile(path.join(DIR, 'needs-a-look.md'), `# Needs a look\n\n${attention.map((a) => `- ${a}`).join('\n')}\n`)
process.exit(0)

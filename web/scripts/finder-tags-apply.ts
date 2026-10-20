/**
 * Applies gift-finder tags written for products (see scripts/finder-tags-export.ts). Checks every
 * line before anything is written.
 *
 *   FINDER_DRY_RUN=1 npx payload run scripts/finder-tags-apply.ts < /dev/null   # check only
 *   npx payload run scripts/finder-tags-apply.ts < /dev/null
 *   FINDER_REWRITE=1 ...   # also replace earlier suggestions nobody has checked yet
 *
 * Reads scripts/output/finder-tags/*.output.json ([{ id, for, occasions, styles }]) and *.tags.txt,
 * one product per line, `id for occasions styles`, each a run of one-letter codes (`-` for none):
 *   for        h her · m mom · f friend/sister · H him · c child
 *   occasions  b birthday · l engagement/wedding/anniversary · g graduation · e Eid/Ramadan
 *              M Mother's Day · n new baby · j just because
 *   styles     N name · P homeland & heritage · F faith · S sparkle · R pearls · E everyday · L hearts
 * Only products without tags are written (with FINDER_REWRITE, also unchecked suggestions); tags a
 * person set or checked are never replaced. Written tags are marked "suggested", not "checked", for
 * the shop to review in Products → Gift finder.
 */
import fs from 'fs/promises'
import path from 'path'
import { getPayload } from 'payload'
import { fileURLToPath } from 'url'

import { OCCASIONS, TAG_RECIPIENTS, TAG_STYLES } from '../src/lib/finder'
import config from '../src/payload.config'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output', 'finder-tags')
const dryRun = Boolean(process.env.FINDER_DRY_RUN)
const rewrite = Boolean(process.env.FINDER_REWRITE)

const CODES = {
  for: { h: 'her', m: 'mom', f: 'friend', H: 'him', c: 'child' },
  occasions: { b: 'birthday', l: 'love', g: 'graduation', e: 'eid', M: 'mothers-day', n: 'baby', j: 'just-because' },
  styles: { N: 'name', P: 'heritage', F: 'faith', S: 'sparkle', R: 'pearls', E: 'everyday', L: 'hearts' },
} as const
type Field = keyof typeof CODES
type Tags = { id: number; for: string[]; occasions: string[]; styles: string[] }
const ALLOWED: Record<Field, readonly string[]> = { for: TAG_RECIPIENTS, occasions: OCCASIONS, styles: TAG_STYLES }

const problems: string[] = []
const entries = new Map<number, Tags & { from: string }>()

const decode = (field: Field, run: string, where: string) => {
  if (run === '-') return []
  const out: string[] = []
  for (const ch of run) {
    const v = (CODES[field] as Record<string, string>)[ch]
    if (!v) problems.push(`${where}: unknown ${field} code "${ch}"`)
    else if (!out.includes(v)) out.push(v)
  }
  return out
}

const add = (t: Tags, from: string) => {
  if (!Number.isInteger(t.id)) return problems.push(`${from}: bad id ${t.id}`)
  if (entries.has(t.id)) problems.push(`${from}: #${t.id} is also in ${entries.get(t.id)!.from}`)
  for (const f of Object.keys(ALLOWED) as Field[]) {
    for (const v of t[f]) if (!ALLOWED[f].includes(v)) problems.push(`${from} #${t.id}: "${v}" isn't a ${f} tag`)
    // Every piece is for someone and some occasion; a style can be left out (gift vouchers).
    if (!t[f].length && f !== 'styles') problems.push(`${from} #${t.id}: no ${f}`)
  }
  entries.set(t.id, { ...t, from })
}

for (const file of (await fs.readdir(DIR)).sort()) {
  const text = await fs.readFile(path.join(DIR, file), 'utf8')
  if (file.endsWith('.output.json')) {
    for (const t of JSON.parse(text) as Tags[]) add(t, file)
  } else if (file.endsWith('.tags.txt')) {
    text.split(/\r?\n/).forEach((line, i) => {
      const clean = line.replace(/#.*$/, '').trim()
      if (!clean) return
      const where = `${file}:${i + 1}`
      const parts = clean.split(/\s+/)
      if (parts.length !== 4) return problems.push(`${where}: expected "id for occasions styles", got "${clean}"`)
      add({ id: Number(parts[0]), for: decode('for', parts[1], where), occasions: decode('occasions', parts[2], where), styles: decode('styles', parts[3], where) }, where)
    })
  }
}

const payload = await getPayload({ config })
const { docs } = await payload.find({ collection: 'products', locale: 'en', draft: true, limit: 0, pagination: false, depth: 0, select: { name: true, finder: true } })
const byId = new Map(docs.map((d) => [d.id, d]))
for (const id of entries.keys()) if (!byId.has(id)) problems.push(`#${id}: no such product`)
const missing = docs.filter((d) => !entries.has(d.id) && !(d.finder?.forWhom?.length || d.finder?.occasions?.length || d.finder?.styles?.length))

if (problems.length) {
  console.log(`${problems.length} problem(s), nothing written:\n${problems.map((p) => `  ${p}`).join('\n')}`)
  process.exit(1)
}

let written = 0
let kept = 0
const failed: string[] = []
const todo = [...entries.values()].filter((t) => {
  const f = byId.get(t.id)!.finder
  const has = Boolean(f?.forWhom?.length || f?.occasions?.length || f?.styles?.length)
  const replaceable = !has || (rewrite && f?.suggested && !f?.checked)
  if (!replaceable) kept++
  return replaceable
})
console.log(`${entries.size} tagged · ${todo.length} to write · ${kept} kept (already tagged by a person or checked) · ${missing.length} products still without tags`)
if (missing.length) console.log(`  untagged: ${missing.map((d) => `#${d.id} ${d.name}`).join(', ')}`)

if (!dryRun) {
  // A few at a time: each save also writes a version.
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async (t) => {
        try {
          const doc = await payload.findByID({ collection: 'products', id: t.id, draft: true, depth: 0, select: { _status: true } })
          await payload.update({
            collection: 'products',
            id: t.id,
            draft: doc._status === 'draft',
            depth: 0,
            context: { skipSeo: true },
            data: { finder: { forWhom: t.for, occasions: t.occasions, styles: t.styles, suggested: true, checked: false } } as never,
          })
          written++
        } catch (err) {
          // e.g. a product that fails its own checks (no category or photo); fix it in the admin and re-run.
          failed.push(`#${t.id} ${byId.get(t.id)!.name}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }),
    )
    if (written % 40 === 0) console.log(`  ${written}/${todo.length}`)
  }
  console.log(`Wrote tags on ${written} products. Restart \`npm run dev\` so the finder sees them.`)
  if (failed.length) console.log(`${failed.length} not saved:\n${failed.map((f) => `  ${f}`).join('\n')}`)
}
process.exit(0)

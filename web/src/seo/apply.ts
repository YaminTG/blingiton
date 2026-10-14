// Writes generated SEO text into a product, category or page, in both languages, with bookkeeping
// so a later human edit is never overwritten. Used by the one-time batches (scripts/seo-apply.ts)
// and by the automatic pipeline.
//
// Normally only empty fields are filled. With `rewrite`, text that this pipeline wrote earlier is
// replaced too, but only while it is unchanged (its fingerprint still matches); anything a person
// has edited stays as it is.

import type { Payload } from 'payload'

import { locales, type Locale } from '@/lib/locales'

import { checkText, fingerprint, isEmpty, type TextKind } from './rules'
import { productScore } from './productScore'

export type Loc = Partial<Record<Locale, string>>

export type ProductSeoInput = {
  name?: Loc
  shortDescription?: Loc
  description?: Loc
  metaTitle?: Loc
  metaDescription?: Loc
  /** Alt text for the main photo; other photos get "<name> – photo N". */
  mainAlt?: Loc
  /** Positional, matching personalization.options. */
  options?: { name?: Loc; choices?: Loc[] }[]
}

export type CategorySeoInput = { name?: Loc; intro?: Loc; metaTitle?: Loc; metaDescription?: Loc }
export type PageSeoInput = { metaTitle?: Loc; metaDescription?: Loc }

export type ApplyResult = { written: string[]; problems: string[]; status: 'done' | 'attention' }
/** 'refresh' re-checks status after a person edits, without claiming any text as AI-written. */
export type Source = 'session' | 'api' | 'refresh'
export type ApplyOptions = { rewrite?: boolean }

// With locale: 'all', localized fields come back as { en, ar }.
type AllLocales = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
/** An upload loaded at depth 1 comes back as an object; writes take its id. */
const idOf = (v: unknown) => (v && typeof v === 'object' && 'id' in v ? (v as { id: number }).id : (v ?? null))
const at = (v: unknown, l: Locale): string | undefined =>
  v && typeof v === 'object' ? ((v as Record<string, string | undefined>)[l] ?? undefined) : undefined

type Plan = {
  data: Record<Locale, AllLocales>
  written: Record<string, string>
  problems: string[]
  /** Fingerprints of what this pipeline wrote before (from the document's `ai.written`). */
  previous: Record<string, string>
  rewrite: boolean
}

const newPlan = (doc: AllLocales, opts: ApplyOptions): Plan => ({
  data: { en: {}, ar: {} },
  written: {},
  problems: [],
  previous: doc.ai?.written ?? {},
  rewrite: Boolean(opts.rewrite),
})

/** Queue `value` for `path` in locale `l` if the field may be written and the text passes the rules. */
function fill(plan: Plan, path: string, kind: TextKind, l: Locale, current: unknown, value: string | undefined, set: (v: string) => void) {
  if (!value) return
  const ours = typeof current === 'string' && plan.previous[`${path}.${l}`] === fingerprint(current.trim())
  if (!isEmpty(current) && !(plan.rewrite && ours)) return
  if (typeof current === 'string' && current.trim() === value.trim()) return
  const problem = checkText(kind, l, value)
  if (problem) return void plan.problems.push(`${path}: ${problem}`)
  set(value.trim())
  plan.written[`${path}.${l}`] = fingerprint(value.trim())
}

type Check = [label: string, kind: TextKind, get: (d: AllLocales) => unknown]

/** Missing text, and text outside the length rules, in either language. */
const issuesOf = (doc: AllLocales, checks: Check[]) =>
  locales.flatMap((l) =>
    checks.flatMap(([label, kind, get]) => {
      const value = at(get(doc), l)
      if (isEmpty(value)) return [`${label} (${l}) missing`]
      const problem = checkText(kind, l, value)
      return problem ? [`${label}: ${problem.replace(`${kind} `, '')}`] : []
    }),
  )

/** The document as it will be after this write, for the status check. */
function merge(doc: AllLocales, plan: Plan, keys: string[]) {
  const merged: AllLocales = structuredClone(doc)
  for (const l of locales) {
    const d = plan.data[l]
    for (const key of keys) if (d[key]) (merged[key] ??= {})[l] = d[key]
    if (d.meta?.title) ((merged.meta ??= {}).title ??= {})[l] = d.meta.title
    if (d.meta?.description) ((merged.meta ??= {}).description ??= {})[l] = d.meta.description
  }
  return merged
}

async function save(payload: Payload, collection: 'products' | 'categories' | 'pages', doc: AllLocales, plan: Plan, extra: AllLocales) {
  const draft = doc._status === 'draft'
  const common = { collection, id: doc.id, depth: 0, draft, context: { skipSeo: true } } as const
  if (Object.keys(plan.data.ar).length) await payload.update({ ...common, locale: 'ar', data: plan.data.ar } as never)
  await payload.update({ ...common, locale: 'en', data: { ...plan.data.en, ...extra } } as never)
}

const bookkeeping = (doc: AllLocales, plan: Plan, source: Source, issues: string[]) => ({
  ...(doc.ai ?? {}),
  written: { ...(doc.ai?.written ?? {}), ...plan.written },
  source: source === 'refresh' ? (doc.ai?.source ?? null) : source,
  at: new Date().toISOString(),
  issues,
})

export async function applyProductSeo(payload: Payload, id: number, input: ProductSeoInput, source: Source, opts: ApplyOptions = {}): Promise<ApplyResult> {
  const doc: AllLocales = await payload.findByID({ collection: 'products', id, locale: 'all', depth: 1, draft: true })
  const plan = newPlan(doc, opts)

  for (const l of locales) {
    const d = plan.data[l]
    if (l === 'ar') fill(plan, 'name', 'name', l, at(doc.name, l), input.name?.[l], (v) => (d.name = v))
    fill(plan, 'shortDescription', 'shortDescription', l, at(doc.shortDescription, l), input.shortDescription?.[l], (v) => (d.shortDescription = v))
    fill(plan, 'description', 'description', l, at(doc.description, l), input.description?.[l], (v) => (d.description = v))
    fill(plan, 'meta.title', 'metaTitle', l, at(doc.meta?.title, l), input.metaTitle?.[l], (v) => ((d.meta ??= {}).title = v))
    fill(plan, 'meta.description', 'metaDescription', l, at(doc.meta?.description, l), input.metaDescription?.[l], (v) => ((d.meta ??= {}).description = v))

    // Questions are arrays: send every row (with ids) and all its fields so nothing else changes.
    const options: AllLocales[] = doc.personalization?.options ?? []
    if (options.length && input.options?.length) {
      let changed = false
      const rows = options.map((o, i) => {
        const gen = input.options?.[i]
        let name = at(o.name, l)
        if (isEmpty(name) && gen?.name?.[l]) {
          name = gen.name[l]
          changed = true
        }
        const choices = (o.choices ?? []).map((c: AllLocales, j: number) => {
          let label = at(c.label, l)
          if (isEmpty(label) && gen?.choices?.[j]?.[l]) {
            label = gen.choices[j][l]
            changed = true
          }
          return { id: c.id, label, extraPrice: c.extraPrice, picture: c.picture, photo: idOf(c.photo), when: c.when }
        })
        return { id: o.id, name, look: o.look, when: o.when, choices }
      })
      if (changed) {
        d.personalization = { options: rows }
        plan.written[`personalization.options.${l}`] = 'set'
      }
    }
  }

  await applyAlts(payload, doc, input.mainAlt, plan)

  // Status after this write: every text field present and within the rules, plus a usable main photo.
  const issues = issuesOf(merge(doc, plan, ['name', 'shortDescription', 'description']), [
    ['name', 'name', (x) => x.name],
    ['short description', 'shortDescription', (x) => x.shortDescription],
    ['description', 'description', (x) => x.description],
    ['SEO title', 'metaTitle', (x) => x.meta?.title],
    ['SEO description', 'metaDescription', (x) => x.meta?.description],
  ])
  const main = doc.images?.[0]
  if (!main) issues.push('no photo')
  else if (typeof main === 'object' && main.lowResolution) issues.push(`main photo is low resolution (${main.width}px wide)`)
  if (!doc.price) issues.push('price is 0')
  issues.push(...plan.problems)

  const status = issues.length ? 'attention' : 'done'
  const { score } = await productScore(payload, merge(doc, plan, ['name', 'shortDescription', 'description']))
  await save(payload, 'products', doc, plan, { seoStatus: status, seoScore: score, ai: bookkeeping(doc, plan, source, issues) })
  return { written: Object.keys(plan.written), problems: plan.problems, status }
}

async function applyAlts(payload: Payload, product: AllLocales, mainAlt: Loc | undefined, plan: Plan) {
  const images: AllLocales[] = (product.images ?? []).filter((m: unknown) => m && typeof m === 'object')
  for (const [i, media] of images.entries()) {
    const done: Record<string, string> = media.ai?.alt ?? {}
    for (const l of locales) {
      const name = at(product.name, l) ?? plan.data[l].name
      const generated = i === 0 ? mainAlt?.[l] : name ? `${name} – ${l === 'ar' ? 'صورة' : 'photo'} ${i + 1}` : undefined
      if (!generated) continue
      // Alt text imported from the old site is replaced once; anything written since is kept.
      const replaceable = isEmpty(at(media.alt, l)) || (media.wooId && !done[l])
      if (!replaceable) continue
      const problem = checkText('alt', l, generated)
      if (problem) {
        plan.problems.push(`photo ${i + 1}: ${problem}`)
        continue
      }
      done[l] = fingerprint(generated)
      await payload.update({ collection: 'media', id: media.id, locale: l, data: { alt: generated, ai: { alt: done } }, depth: 0, context: { skipSeo: true } })
      media.alt = { ...(media.alt ?? {}), [l]: generated } // so the score below sees it
    }
  }
}

export async function applyCategorySeo(payload: Payload, id: number, input: CategorySeoInput, source: Source, opts: ApplyOptions = {}): Promise<ApplyResult> {
  const doc: AllLocales = await payload.findByID({ collection: 'categories', id, locale: 'all', depth: 0 })
  const plan = newPlan(doc, opts)
  for (const l of locales) {
    const d = plan.data[l]
    if (l === 'ar') fill(plan, 'name', 'name', l, at(doc.name, l), input.name?.[l], (v) => (d.name = v))
    fill(plan, 'intro', 'intro', l, at(doc.intro, l), input.intro?.[l], (v) => (d.intro = v))
    fill(plan, 'meta.title', 'metaTitle', l, at(doc.meta?.title, l), input.metaTitle?.[l], (v) => ((d.meta ??= {}).title = v))
    fill(plan, 'meta.description', 'metaDescription', l, at(doc.meta?.description, l), input.metaDescription?.[l], (v) => ((d.meta ??= {}).description = v))
  }
  const issues = [
    ...issuesOf(merge(doc, plan, ['name', 'intro']), [
      ['name', 'name', (x) => x.name],
      ['intro', 'intro', (x) => x.intro],
      ['SEO title', 'metaTitle', (x) => x.meta?.title],
      ['SEO description', 'metaDescription', (x) => x.meta?.description],
    ]),
    ...plan.problems,
  ]
  const status = issues.length ? 'attention' : 'done'
  await save(payload, 'categories', doc, plan, { seoStatus: status, ai: bookkeeping(doc, plan, source, issues) })
  return { written: Object.keys(plan.written), problems: plan.problems, status }
}

/** Content pages: the SEO title and description (the page text itself is written by the shop). */
export async function applyPageSeo(payload: Payload, id: number, input: PageSeoInput, source: Source, opts: ApplyOptions = {}): Promise<ApplyResult> {
  const doc: AllLocales = await payload.findByID({ collection: 'pages', id, locale: 'all', depth: 0, draft: true })
  const plan = newPlan(doc, opts)
  for (const l of locales) {
    const d = plan.data[l]
    fill(plan, 'meta.title', 'metaTitle', l, at(doc.meta?.title, l), input.metaTitle?.[l], (v) => ((d.meta ??= {}).title = v))
    fill(plan, 'meta.description', 'metaDescription', l, at(doc.meta?.description, l), input.metaDescription?.[l], (v) => ((d.meta ??= {}).description = v))
  }
  const issues = [
    ...issuesOf(merge(doc, plan, []), [
      ['SEO title', 'metaTitle', (x) => x.meta?.title],
      ['SEO description', 'metaDescription', (x) => x.meta?.description],
    ]),
    ...locales.filter((l) => !at(doc.content, l)).map((l) => `page text (${l}) missing`),
    ...plan.problems,
  ]
  const status = issues.length ? 'attention' : 'done'
  await save(payload, 'pages', doc, plan, { seoStatus: status, ai: bookkeeping(doc, plan, source, issues) })
  return { written: Object.keys(plan.written), problems: plan.problems, status }
}

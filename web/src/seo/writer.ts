// The automatic SEO writer: when ANTHROPIC_API_KEY is set, the seo-refresh job asks Claude for the
// text a product, category or page is still missing (EN + AR), checks it against src/seo/rules.ts,
// and hands it to applyProductSeo / applyCategorySeo / applyPageSeo, which fill only empty fields.
// Only missing fields are requested, so a fully written item costs nothing on later saves.

import Anthropic from '@anthropic-ai/sdk'
import type { Payload } from 'payload'

import { locales, type Locale } from '@/lib/locales'
import { serverUrl } from '@/lib/site'

import type { CategorySeoInput, Loc, PageSeoInput, ProductSeoInput } from './apply'
import { categoryFacts, productFacts } from './facts'
import { systemPrompt } from './prompts'
import { checkText, isEmpty, type TextKind } from './rules'

export const MODEL = 'claude-opus-5-5'
export const writerEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY)

type AllLocales = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const at = (v: unknown, l: Locale): string | undefined =>
  v && typeof v === 'object' ? ((v as Record<string, string | undefined>)[l] ?? undefined) : undefined
const other = (l: Locale): Locale => (l === 'en' ? 'ar' : 'en')

/** One field to write: its key in the reply, the rule it must pass (null: just non-empty), and the missing languages. */
export type Ask = { key: string; kind: TextKind | null; locales: Locale[]; note?: string }
export type Reply = Record<string, Loc>

const missing = (v: unknown, only: readonly Locale[] = locales) => only.filter((l) => isEmpty(at(v, l)))
const asker = (asks: Ask[]) => (key: string, kind: TextKind | null, ls: Locale[], note?: string) => {
  if (ls.length) asks.push({ key, kind, locales: ls, ...(note ? { note } : {}) })
}

export function productAsks(doc: AllLocales): Ask[] {
  const asks: Ask[] = []
  const add = asker(asks)
  add('name', 'name', missing(doc.name, ['ar']))
  add('shortDescription', 'shortDescription', missing(doc.shortDescription))
  add('description', 'description', missing(doc.description))
  add('metaTitle', 'metaTitle', missing(doc.meta?.title))
  add('metaDescription', 'metaDescription', missing(doc.meta?.description))
  const main = doc.images?.[0]
  if (main && typeof main === 'object') {
    // Same rule as applyAlts: empty, or still the alt text imported from the old site.
    add('mainAlt', 'alt', locales.filter((l) => isEmpty(at(main.alt, l)) || (main.wooId && !main.ai?.alt?.[l])))
  }
  // Personalization labels are translated from whichever language has them.
  for (const [i, o] of ((doc.personalization?.options ?? []) as AllLocales[]).entries()) {
    const has = (v: unknown) => (l: Locale) => !isEmpty(at(v, other(l)))
    add(`option${i + 1}`, null, missing(o.name).filter(has(o.name)), `the name of personalization option ${i + 1}, e.g. "Chain length"`)
    for (const [j, c] of ((o.choices ?? []) as AllLocales[]).entries()) {
      add(`option${i + 1}_choice${j + 1}`, null, missing(c.label).filter(has(c.label)), `choice ${j + 1} of option ${i + 1}, a short label`)
    }
  }
  return asks
}

export function categoryAsks(doc: AllLocales): Ask[] {
  const asks: Ask[] = []
  const add = asker(asks)
  add('name', 'name', missing(doc.name, ['ar']))
  add('intro', 'intro', missing(doc.intro))
  add('metaTitle', 'metaTitle', missing(doc.meta?.title))
  add('metaDescription', 'metaDescription', missing(doc.meta?.description))
  return asks
}

export function pageAsks(doc: AllLocales): Ask[] {
  const asks: Ask[] = []
  const add = asker(asks)
  add('metaTitle', 'metaTitle', missing(doc.meta?.title))
  add('metaDescription', 'metaDescription', missing(doc.meta?.description))
  return asks
}

/** JSON schema for the reply: exactly the asked fields and languages. */
export function schemaFor(asks: Ask[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: asks.map((a) => a.key),
    properties: Object.fromEntries(
      asks.map((a) => [
        a.key,
        { type: 'object', additionalProperties: false, required: a.locales, properties: Object.fromEntries(a.locales.map((l) => [l, { type: 'string' }])) },
      ]),
    ),
  }
}

/** Fields in the reply that break the rules. */
export function problemsIn(asks: Ask[], reply: Reply): string[] {
  return asks.flatMap((a) =>
    a.locales.flatMap((l) => {
      const value = at(reply[a.key], l)
      const problem = a.kind ? checkText(a.kind, l, value) : isEmpty(value) ? `${a.key} (${l}) is empty` : null
      return problem ? [`${a.key}: ${problem}`] : []
    }),
  )
}

/** Rich text (Lexical JSON) to plain text, one block per line. */
export function plainText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as { root?: unknown; text?: unknown; type?: string; children?: unknown[] }
  if (n.root) return plainText(n.root)
  if (typeof n.text === 'string') return n.text
  const block = n.type === 'root' || n.type === 'list'
  return (n.children ?? []).map(plainText).join(block ? '\n' : '').trim()
}

const askList = (asks: Ask[]) =>
  asks.map((a) => `- ${a.key} (${a.locales.join(', ')})${a.kind ? `: ${a.kind}` : ''}${a.note ? ` — ${a.note}` : ''}`).join('\n')

type ImageBlock = Anthropic.Beta.BetaImageBlockParam
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const

/** The main photo (800px card size), or null if it can't be fetched. */
async function photo(media: AllLocales | undefined, payload: Payload): Promise<ImageBlock | null> {
  const url: string | undefined = media?.sizes?.card?.url ?? media?.url
  if (!url) return null
  try {
    const res = await fetch(url.startsWith('http') ? url : `${serverUrl}${url}`, { signal: AbortSignal.timeout(15_000) })
    const type = res.headers.get('content-type')?.split(';')[0] as (typeof IMAGE_TYPES)[number]
    if (!res.ok || !IMAGE_TYPES.includes(type)) throw new Error(`${res.status} ${type}`)
    const data = Buffer.from(await res.arrayBuffer()).toString('base64')
    return { type: 'image', source: { type: 'base64', media_type: type, data } }
  } catch (err) {
    payload.logger.warn({ msg: 'seo-writer: main photo not sent', url, err: String(err) })
    return null
  }
}

/** SEO titles in the reply that another item of the same collection already uses. */
async function titleClashes(payload: Payload, collection: 'products' | 'categories' | 'pages', id: number, reply: Reply) {
  const clashes: { l: Locale; problem: string }[] = []
  for (const l of locales) {
    const title = at(reply.metaTitle, l)?.trim()
    if (!title) continue
    const found = await payload.find({
      collection,
      where: { and: [{ 'meta.title': { equals: title } }, { id: { not_equals: id } }] },
      locale: l,
      limit: 1,
      depth: 0,
      draft: true,
      select: {},
    })
    if (found.docs[0]) clashes.push({ l, problem: `metaTitle (${l}) is already used by another item; make it more specific` })
  }
  return clashes
}

let client: Anthropic | null = null

/** Ask Claude for the fields, check them, and ask once more for fixes if anything fails. */
async function ask(
  payload: Payload,
  where: { collection: 'products' | 'categories' | 'pages'; id: number },
  asks: Ask[],
  content: Anthropic.Beta.BetaContentBlockParam[],
): Promise<Reply> {
  client ??= new Anthropic()
  const settings = await payload.findGlobal({ slug: 'site-settings', locale: 'all' as never, depth: 0 })
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content }]
  let reply: Reply = {}

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Should a safety classifier decline (very unlikely here), the API reruns on a fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: schemaFor(asks) } },
      system: systemPrompt(settings),
      messages,
    })
    payload.logger.info({ msg: 'seo-writer', ...where, attempt, fields: asks.map((a) => a.key), usage: res.usage })
    if (res.stop_reason === 'refusal') throw new Error(`seo-writer: request declined (${res.stop_details?.category ?? 'no category'})`)
    if (res.stop_reason === 'max_tokens') throw new Error('seo-writer: reply cut off at max_tokens')
    const text = res.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') throw new Error('seo-writer: no text in reply')
    reply = JSON.parse(text.text) as Reply

    const clashes = await titleClashes(payload, where.collection, where.id, reply)
    const problems = [...problemsIn(asks, reply), ...clashes.map((c) => c.problem)]
    if (!problems.length) return reply
    if (attempt === 2) {
      // Leave a clashing title out (it shows as missing in the admin) rather than duplicate one.
      for (const c of clashes) delete (reply.metaTitle as Record<string, string>)[c.l]
      return reply // anything else still wrong is rejected and reported by apply.ts
    }
    messages.push(
      { role: 'assistant', content: res.content },
      { role: 'user', content: `These fields don't pass the checks:\n${problems.map((p) => `- ${p}`).join('\n')}\nSend every field again, with these fixed and the rest unchanged.` },
    )
  }
  return reply
}

const json = (v: unknown) => JSON.stringify(v, null, 1)
const pickLoc = (v: unknown): Loc => ({ en: at(v, 'en') ?? '', ar: at(v, 'ar') ?? '' })

export async function writeProductSeo(payload: Payload, id: number): Promise<ProductSeoInput | null> {
  const doc: AllLocales = await payload.findByID({ collection: 'products', id, locale: 'all', depth: 1, draft: true })
  const asks = productAsks(doc)
  if (!asks.length) return null

  const facts = { ...productFacts(doc as never), goldPlatedAvailable: Boolean(doc.personalization?.goldPlated) }
  const current = {
    name: pickLoc(doc.name),
    shortDescription: pickLoc(doc.shortDescription),
    description: pickLoc(doc.description),
    metaTitle: pickLoc(doc.meta?.title),
    metaDescription: pickLoc(doc.meta?.description),
    options: ((doc.personalization?.options ?? []) as AllLocales[]).map((o) => ({
      name: pickLoc(o.name),
      choices: ((o.choices ?? []) as AllLocales[]).map((c) => pickLoc(c.label)),
    })),
  }
  const image = asks.some((a) => ['mainAlt', 'description', 'shortDescription'].includes(a.key)) ? await photo(doc.images?.[0], payload) : null
  const reply = await ask(payload, { collection: 'products', id }, asks, [
    ...(image ? [image, { type: 'text' as const, text: 'Above: the main product photo.' }] : []),
    {
      type: 'text',
      text: `<product>\n${json(facts)}\n</product>\n\n<current_text>\nWritten by the shop; empty strings are missing.\n${json(current)}\n</current_text>\n\nWrite these fields:\n${askList(asks)}`,
    },
  ])

  return {
    name: reply.name as Loc,
    shortDescription: reply.shortDescription as Loc,
    description: reply.description as Loc,
    metaTitle: reply.metaTitle as Loc,
    metaDescription: reply.metaDescription as Loc,
    mainAlt: reply.mainAlt as Loc,
    options: current.options.map((o, i) => ({
      name: reply[`option${i + 1}`] as Loc,
      choices: o.choices.map((_, j) => (reply[`option${i + 1}_choice${j + 1}`] as Loc) ?? {}),
    })),
  }
}

export async function writeCategorySeo(payload: Payload, id: number): Promise<CategorySeoInput | null> {
  const doc: AllLocales = await payload.findByID({ collection: 'categories', id, locale: 'all', depth: 1 })
  const asks = categoryAsks(doc)
  if (!asks.length) return null

  const products = await payload.find({
    collection: 'products',
    where: { and: [{ categories: { in: [id] } }, { _status: { equals: 'published' } }] },
    locale: 'en',
    depth: 0,
    limit: 40,
    select: { name: true },
  })
  const parent = doc.parent && typeof doc.parent === 'object' ? at(doc.parent.name, 'en') : undefined
  const facts = categoryFacts(doc as never, products.docs.map((p) => p.name), parent)
  const current = { name: pickLoc(doc.name), intro: pickLoc(doc.intro), metaTitle: pickLoc(doc.meta?.title), metaDescription: pickLoc(doc.meta?.description) }
  const reply = await ask(payload, { collection: 'categories', id }, asks, [
    {
      type: 'text',
      text: `<category>\n${json({ ...facts, productCount: products.totalDocs })}\n</category>\n\n<current_text>\nWritten by the shop; empty strings are missing.\n${json(current)}\n</current_text>\n\nWrite these fields:\n${askList(asks)}`,
    },
  ])
  return { name: reply.name as Loc, intro: reply.intro as Loc, metaTitle: reply.metaTitle as Loc, metaDescription: reply.metaDescription as Loc }
}

const MAX_PAGE_TEXT = 4000

export async function writePageSeo(payload: Payload, id: number): Promise<PageSeoInput | null> {
  const doc: AllLocales = await payload.findByID({ collection: 'pages', id, locale: 'all', depth: 0, draft: true })
  const asks = pageAsks(doc)
  const text = Object.fromEntries(locales.map((l) => [l, plainText(doc.content?.[l]).slice(0, MAX_PAGE_TEXT)]))
  // Nothing to describe until the shop has written the page.
  if (!asks.length || !locales.some((l) => text[l])) return null

  const reply = await ask(payload, { collection: 'pages', id }, asks, [
    {
      type: 'text',
      text: `<page>\n${json({ title: pickLoc(doc.title), slug: doc.slug, text })}\n</page>\n\n<current_text>\n${json({ metaTitle: pickLoc(doc.meta?.title), metaDescription: pickLoc(doc.meta?.description) })}\n</current_text>\n\nWrite these fields, describing what the page covers:\n${askList(asks)}`,
    },
  ])
  return { metaTitle: reply.metaTitle as Loc, metaDescription: reply.metaDescription as Loc }
}

export function writeSeo(payload: Payload, collection: 'products' | 'categories' | 'pages', id: number) {
  if (collection === 'categories') return writeCategorySeo(payload, id)
  if (collection === 'pages') return writePageSeo(payload, id)
  return writeProductSeo(payload, id)
}

// The instructions the Claude API writer works from. Tune the writing here; the shop's own facts,
// tone and banned phrases come from Site settings → SEO writing, so the cousin can change those
// without a deploy. Same rules as the seo-v2 bulk rewrite (written in a Claude Code session).

import type { SiteSetting } from '@/payload-types'

import { BRAND, LIMITS, type TextKind } from './rules'

type Loc = { en?: string | null; ar?: string | null } | string | null | undefined
const both = (v: Loc) => (v && typeof v === 'object' ? v : { en: v ?? '', ar: '' })
const list = (text: string | null | undefined) =>
  (text ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `- ${s}`)
    .join('\n')

/** What each field is for, with its length range. The model is told the limits in characters. */
export const FIELD_GUIDE: Record<TextKind, string> = {
  name: 'The product or category name. In Arabic, the name a Jordanian shopper would use (سلسال, اسوارة, حلق, كبك, خلخال), with brand-style names like "Charmie" written in Arabic letters (تشارمي).',
  metaTitle: `The Google result title. The piece's name plus what it is and what it's made of, ending in " | ${BRAND}". Each one must be unique to this item.`,
  metaDescription: 'The Google result snippet. One or two plain sentences on what the piece is and why someone would want it. No calls to action like "order now".',
  shortDescription: 'One or two sentences shown next to the price.',
  description: 'The product page text, one or two short paragraphs. What it is, what it is made of, how it can be worn or given, and the made-to-order/delivery facts that apply.',
  intro: 'The text at the top of a category page: what the category holds and who it suits, naming a few kinds of pieces in it. One or two short paragraphs.',
  alt: 'Describes the main photo for Google and screen readers: what is visible (the piece, its shape, colour, text on it). No "image of" or "photo of".',
}

export function systemPrompt(settings: SiteSetting | Record<string, unknown>): string {
  const w = ((settings as SiteSetting).seoWriting ?? {}) as Record<string, Loc>
  const facts = both(w.facts)
  const voice = both(w.voice)
  const avoid = both(w.avoid)
  const keywords = both(w.keywords)
  const limits = (Object.keys(LIMITS) as TextKind[]).map((k) => `- ${k} (${LIMITS[k].min}–${LIMITS[k].max} characters): ${FIELD_GUIDE[k]}`).join('\n')

  return `You write product, category and page text for ${BRAND}, an online jewelry shop in Amman, Jordan, in English and Arabic. Your text is published straight to the website and Google without a person reading it first, so it has to be correct.

<facts_rule>
State only facts that appear in the item's data you are given, in the shop facts below, or that are clearly visible in the photo. Never invent materials, stones, sizes, weights, plating, prices, delivery times, guarantees or reviews. If the data doesn't say a piece is silver or 925, don't call it that. If the photo shows a colour or shape, you may describe it, but don't name a stone or material from the photo alone. When the data is thin, write less rather than padding with claims.
</facts_rule>

<shop_facts>
English:
${list(facts.en) || '- (none)'}
Arabic:
${list(facts.ar) || '- (none)'}
</shop_facts>

<voice>
English: ${voice.en || 'Warm, clear, short sentences.'}
Arabic: ${voice.ar || 'دافئ وواضح، جمل قصيرة.'}
</voice>

<never_say>
${[list(avoid.en), list(avoid.ar)].filter(Boolean).join('\n') || '- (none)'}
</never_say>

<search_phrases>
Phrases customers search for. Use one where it describes the item naturally; never stuff them in or use one that doesn't fit.
English:
${list(keywords.en) || '- (none)'}
Arabic:
${list(keywords.ar) || '- (none)'}
</search_phrases>

<fields>
${limits}
Stay inside every character range; text outside it is rejected.
</fields>

<languages>
- English: plain, natural English. No Arabic letters.
- Arabic: write it as a Jordanian copywriter would, in simple Modern Standard Arabic, not a word-for-word translation of the English. Keep the same facts in both languages. Write names in Arabic letters; only "${BRAND}", "DHL Express" and numbers such as 925 stay as they are.
- When text already exists in one language, the other language must say the same things.
</languages>

Return only the fields you are asked for, in the JSON shape requested.`
}

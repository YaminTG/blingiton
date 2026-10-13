import { describe, expect, it } from 'vitest'

import { systemPrompt } from '@/seo/prompts'
import { categoryAsks, pageAsks, plainText, problemsIn, productAsks, schemaFor } from '@/seo/writer'

const full = (en: string, ar: string) => ({ en, ar })

describe('seo writer', () => {
  it('asks only for what a new product is missing', () => {
    const asks = productAsks({
      name: { en: 'Kufi Name Necklace', ar: null },
      images: [{ id: 1, alt: { en: null, ar: null } }],
      personalization: { options: [{ name: { en: 'Chain length', ar: null }, choices: [{ label: { en: '40 cm', ar: null } }, { label: { en: null, ar: null } }] }] },
    })
    expect(asks.map((a) => `${a.key}:${a.locales.join('+')}`)).toEqual([
      'name:ar',
      'shortDescription:en+ar',
      'description:en+ar',
      'metaTitle:en+ar',
      'metaDescription:en+ar',
      'mainAlt:en+ar',
      'option1:ar',
      'option1_choice1:ar',
      // choice 2 has no text in either language, so there's nothing to translate
    ])
  })

  it('asks for nothing once a product is written', () => {
    const doc = {
      name: full('Kufi Name Necklace', 'سلسال اسم كوفي'),
      shortDescription: full('x', 'y'),
      description: full('x', 'y'),
      meta: { title: full('x', 'y'), description: full('x', 'y') },
      images: [{ id: 1, alt: full('x', 'y') }],
    }
    expect(productAsks(doc)).toEqual([])
    // Alt text imported from the old site is replaced once.
    expect(productAsks({ ...doc, images: [{ id: 1, wooId: 9, alt: full('x', 'y'), ai: { alt: { en: 'f' } } }] }).map((a) => `${a.key}:${a.locales}`)).toEqual(['mainAlt:ar'])
  })

  it('asks categories and pages for their own fields', () => {
    expect(categoryAsks({ name: full('Rings', 'خواتم'), intro: { en: 'x' } }).map((a) => a.key)).toEqual(['intro', 'metaTitle', 'metaDescription'])
    expect(pageAsks({ meta: { title: full('x', 'y') } }).map((a) => a.key)).toEqual(['metaDescription'])
  })

  it('builds a strict schema with just the asked languages', () => {
    const schema = schemaFor([{ key: 'name', kind: 'name', locales: ['ar'] }])
    expect(schema).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: { name: { type: 'object', additionalProperties: false, required: ['ar'], properties: { ar: { type: 'string' } } } },
    })
  })

  it('checks replies against the length and language rules', () => {
    const asks = [
      { key: 'metaTitle', kind: 'metaTitle' as const, locales: ['en' as const] },
      { key: 'option1', kind: null, locales: ['ar' as const] },
    ]
    expect(problemsIn(asks, { metaTitle: { en: 'Too short | Blingiton' }, option1: { ar: '' } })).toEqual([
      'metaTitle: metaTitle (en) is too short (21 < 50)',
      'option1: option1 (ar) is empty',
    ])
    expect(problemsIn(asks, { metaTitle: { en: 'Kufi Arabic Name Necklace in 925 Sterling Silver | Blingiton' }, option1: { ar: 'طول السلسال' } })).toEqual([])
  })

  it('reads page text out of rich text', () => {
    const content = {
      root: {
        type: 'root',
        children: [
          { type: 'heading', children: [{ type: 'text', text: 'Delivery' }] },
          { type: 'paragraph', children: [{ type: 'text', text: 'Amman in ' }, { type: 'text', text: '1–2 days.' }] },
        ],
      },
    }
    expect(plainText(content)).toBe('Delivery\nAmman in 1–2 days.')
  })

  it('puts the shop facts and banned phrases in the prompt', () => {
    const prompt = systemPrompt({ seoWriting: { facts: { en: 'Handcrafted in Jordan.', ar: 'مصنوعة يدوياً في الأردن.' }, avoid: { en: 'cheap', ar: 'رخيص' } } })
    expect(prompt).toContain('- Handcrafted in Jordan.')
    expect(prompt).toContain('- مصنوعة يدوياً في الأردن.')
    expect(prompt).toContain('- cheap')
    expect(prompt).toContain('metaTitle (50–60 characters)')
  })
})

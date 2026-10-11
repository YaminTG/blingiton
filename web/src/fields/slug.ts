import type { TextField } from 'payload'

import { slugify } from '@/lib/slugify'

import { l } from './label'

/**
 * One URL slug shared by both languages (/en/product/x and /ar/product/x). Filled from the name on
 * first save when left empty; Arabic-only names are transliterated. Editing it later is allowed:
 * the SEO pipeline adds a redirect from the old address.
 */
export const slugField = (from = 'name'): TextField => ({
  name: 'slug',
  type: 'text',
  label: l('URL', 'الرابط'),
  index: true,
  unique: true,
  admin: {
    position: 'sidebar',
    description: l('Filled in automatically from the name.', 'يُملأ تلقائياً من الاسم.'),
  },
  hooks: {
    beforeValidate: [
      ({ value, data, originalDoc }) => {
        if (typeof value === 'string' && value.trim()) return slugify(value)
        if (originalDoc?.slug) return originalDoc.slug
        const source = data?.[from] ?? originalDoc?.[from]
        // A localized field can arrive as a string (current locale) or as { en, ar }.
        const text = typeof source === 'string' ? source : (source?.en ?? source?.ar ?? '')
        return slugify(text) || undefined
      },
    ],
  },
  validate: (value: string | null | undefined) =>
    !value || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || 'Use lowercase letters, numbers and dashes only.',
})

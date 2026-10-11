import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'
import type { Field, SelectField, Tab } from 'payload'

import { l } from './label'

/**
 * Where a document stands with the automatic SEO pipeline. Shown as a column in the admin list.
 *   pending   — saved, waiting for the pipeline
 *   done      — every SEO field is filled (by a person or by AI)
 *   attention — something needs a human (e.g. no photo, AI output failed a check)
 */
export const seoStatusField: SelectField = {
  name: 'seoStatus',
  type: 'select',
  label: l('SEO', 'السيو'),
  defaultValue: 'pending',
  options: [
    { label: l('⏳ Pending', '⏳ قيد المعالجة'), value: 'pending' },
    { label: l('✓ Done', '✓ مكتمل'), value: 'done' },
    { label: l('⚠ Needs a look', '⚠ يحتاج مراجعة'), value: 'attention' },
  ],
  admin: { position: 'sidebar', readOnly: true },
}

/**
 * Bookkeeping for the pipeline, hidden from editors: which fields AI wrote (and the text it wrote,
 * so a later human edit is detected and never overwritten), plus the last run and any problems.
 */
export const aiField: Field = {
  name: 'ai',
  type: 'json',
  admin: { hidden: true },
}

/** The "SEO (automatic)" tab: search preview plus meta title, description and share image. */
export const seoTab = (): Tab => ({
  name: 'meta',
  label: l('SEO (automatic)', 'السيو (تلقائي)'),
  description: l(
    'Filled in automatically when you save. Edit anything here and it will be kept as you wrote it.',
    'يُملأ تلقائياً عند الحفظ. أي تعديل تكتبه هنا سيبقى كما هو.',
  ),
  fields: [
    OverviewField({
      titlePath: 'meta.title',
      descriptionPath: 'meta.description',
      imagePath: 'meta.image',
      titleOverrides: { minLength: 30, maxLength: 60 },
      descriptionOverrides: { minLength: 70, maxLength: 155 },
    }),
    MetaTitleField({ hasGenerateFn: false, overrides: { localized: true } }),
    MetaDescriptionField({ hasGenerateFn: false, overrides: { localized: true } }),
    MetaImageField({ relationTo: 'media', hasGenerateFn: false }),
    PreviewField({ hasGenerateFn: false, titlePath: 'meta.title', descriptionPath: 'meta.description' }),
  ],
})

/** Where a record came from on the old WooCommerce site; used to redirect old links. */
export const legacyField: Field = {
  name: 'legacy',
  type: 'group',
  label: l('Old website', 'الموقع القديم'),
  admin: { position: 'sidebar', condition: (data) => Boolean(data?.legacy?.wooId) },
  fields: [
    { name: 'wooId', type: 'number', index: true, admin: { readOnly: true } },
    { name: 'url', type: 'text', admin: { readOnly: true } },
    { name: 'name', type: 'text', admin: { readOnly: true } },
    // The old site's text, kept as reference material for the SEO pipeline (not shown on the site).
    { name: 'description', type: 'textarea', admin: { readOnly: true } },
  ],
}

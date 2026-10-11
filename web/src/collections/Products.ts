import type { CollectionConfig } from 'payload'

import { loggedIn, publishedOrLoggedIn } from '@/access'
import { l } from '@/fields/label'
import { aiField, legacyField, seoStatusField, seoTab } from '@/fields/seo'
import { slugField } from '@/fields/slug'
import { productAfterChange, productAfterDelete } from '@/hooks/lifecycle'

// Option lists mirror the preview store (preview/assets/data.js).
const kinds = [
  { label: l('Necklace', 'قلادة'), value: 'necklace' },
  { label: l('Bracelet', 'سوار'), value: 'bracelet' },
  { label: l('Ring', 'خاتم'), value: 'ring' },
  { label: l('Earrings', 'أقراط'), value: 'earrings' },
  { label: l('Cufflinks', 'أزرار أكمام'), value: 'cufflinks' },
  { label: l('Anklet', 'خلخال'), value: 'anklet' },
  { label: l('Other', 'أخرى'), value: 'other' },
]

export const Products: CollectionConfig = {
  slug: 'products',
  labels: { singular: l('Product', 'منتج'), plural: l('Products', 'المنتجات') },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'images', 'price', 'categories', 'availability', 'seoScore', '_status'],
    listSearchableFields: ['name', 'slug'],
    group: l('Shop', 'المتجر'),
  },
  access: {
    read: publishedOrLoggedIn,
    create: loggedIn,
    update: loggedIn,
    delete: loggedIn,
  },
  versions: {
    drafts: true,
    maxPerDoc: 20,
  },
  hooks: {
    afterChange: [productAfterChange],
    afterDelete: [productAfterDelete],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: l('Basics', 'الأساسيات'),
          description: l(
            'Only the name, price, category and photos are needed. Descriptions, translations and SEO are written automatically if you leave them empty.',
            'يكفي الاسم والسعر والفئة والصور. الوصف والترجمة والسيو تُكتب تلقائياً إذا تركتها فارغة.',
          ),
          fields: [
            { name: 'name', type: 'text', label: l('Name', 'الاسم'), required: true, localized: true },
            {
              type: 'row',
              fields: [
                {
                  name: 'price',
                  type: 'number',
                  label: l('Price (JOD)', 'السعر (د.أ)'),
                  required: true,
                  min: 0,
                  admin: { step: 0.5, width: '33%' },
                },
                {
                  name: 'compareAtPrice',
                  type: 'number',
                  label: l('Was (optional)', 'السعر قبل الخصم (اختياري)'),
                  min: 0,
                  admin: { step: 0.5, width: '33%', description: l('Shows a sale price.', 'لإظهار خصم.') },
                },
                {
                  name: 'kind',
                  type: 'select',
                  label: l('Type', 'النوع'),
                  required: true,
                  options: kinds,
                  admin: { width: '33%' },
                },
              ],
            },
            {
              name: 'categories',
              type: 'relationship',
              label: l('Categories', 'الفئات'),
              relationTo: 'categories',
              hasMany: true,
              required: true,
            },
            {
              name: 'images',
              type: 'upload',
              label: l('Photos', 'الصور'),
              relationTo: 'media',
              hasMany: true,
              required: true,
              minRows: 1,
              admin: {
                description: l('The first photo is the main one.', 'الصورة الأولى هي الرئيسية.'),
                components: { Cell: '/components/admin/PhotoCell#PhotoCell' },
              },
            },
            {
              name: 'shortDescription',
              type: 'textarea',
              label: l('Short description', 'وصف قصير'),
              localized: true,
              maxLength: 200,
              admin: { description: l('One line under the name. Written automatically if empty.', 'سطر واحد تحت الاسم. يُكتب تلقائياً إذا كان فارغاً.') },
            },
            {
              name: 'description',
              type: 'textarea',
              label: l('Description', 'الوصف'),
              localized: true,
              admin: { description: l('Written automatically if empty.', 'يُكتب تلقائياً إذا كان فارغاً.') },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'availability',
                  type: 'select',
                  label: l('Availability', 'التوفر'),
                  required: true,
                  defaultValue: 'made_to_order',
                  options: [
                    { label: l('Made to order', 'يُصنع حسب الطلب'), value: 'made_to_order' },
                    { label: l('In stock', 'متوفر'), value: 'in_stock' },
                    { label: l('Sold out', 'نفدت الكمية'), value: 'sold_out' },
                  ],
                  admin: { width: '50%' },
                },
                {
                  name: 'stock',
                  type: 'number',
                  label: l('Pieces in stock', 'الكمية المتوفرة'),
                  min: 0,
                  admin: { width: '50%', condition: (data) => data?.availability === 'in_stock' },
                },
              ],
            },
            {
              name: 'keywords',
              type: 'text',
              label: l('Search phrases (optional)', 'عبارات البحث (اختياري)'),
              localized: true,
              admin: {
                description: l(
                  'What customers might type into Google for this piece, separated by commas.',
                  'ما قد يكتبه الزبائن في جوجل لهذه القطعة، مفصولة بفواصل.',
                ),
              },
            },
            {
              name: 'featured',
              type: 'checkbox',
              label: l('Show in “Most loved” on the home page', 'إظهار في "الأكثر حباً" في الصفحة الرئيسية'),
            },
          ],
        },
        {
          name: 'personalization',
          label: l('Personalization', 'التخصيص'),
          fields: [
            {
              name: 'type',
              type: 'select',
              label: l('Can customers personalize it?', 'هل يمكن للزبون تخصيصها؟'),
              required: true,
              defaultValue: 'none',
              options: [
                { label: l('No', 'لا'), value: 'none' },
                { label: l('Name (cut-out)', 'اسم (مقصوص)'), value: 'name' },
                { label: l('Letters / initials', 'حروف / أحرف أولى'), value: 'letters' },
                { label: l('Engraving', 'نقش / حفر'), value: 'engrave' },
              ],
            },
            {
              type: 'row',
              admin: { condition: (_, siblingData) => siblingData?.type && siblingData.type !== 'none' },
              fields: [
                {
                  name: 'previewShape',
                  type: 'select',
                  label: l('Preview shape', 'شكل المعاينة'),
                  options: [
                    { label: l('Name plate', 'لوحة اسم'), value: 'plate' },
                    { label: l('Cut into band', 'مقصوص في الخاتم'), value: 'bandcut' },
                    { label: l('Engraved band', 'خاتم محفور'), value: 'band' },
                    { label: l('Square face', 'وجه مربع'), value: 'square' },
                    { label: l('Disc', 'دائرة'), value: 'disc' },
                    { label: l('Black enamel', 'مينا سوداء'), value: 'enamel' },
                    { label: l('Cut-out', 'مقصوص'), value: 'cut' },
                  ],
                  admin: { width: '33%' },
                },
                {
                  name: 'defaultStyle',
                  type: 'select',
                  label: l('Default lettering', 'الخط الافتراضي'),
                  defaultValue: 'script',
                  options: [
                    { label: l('Script', 'خط يدوي'), value: 'script' },
                    { label: l('Classic', 'كلاسيكي'), value: 'classic' },
                    { label: l('Modern', 'عصري'), value: 'modern' },
                    { label: l('Kufi', 'كوفي'), value: 'kufi' },
                  ],
                  admin: { width: '33%' },
                },
                {
                  name: 'sampleText',
                  type: 'text',
                  label: l('Sample text', 'نص المعاينة'),
                  localized: true,
                  admin: { width: '33%', placeholder: 'Sara / سارة' },
                },
              ],
            },
            {
              name: 'stones',
              type: 'select',
              label: l('Stone choice', 'اختيار الحجر'),
              defaultValue: 'none',
              options: [
                { label: l('None', 'بدون'), value: 'none' },
                { label: l('Birthstone (by month)', 'حجر الميلاد (حسب الشهر)'), value: 'birthstone' },
                { label: l('Any gem colour', 'أي لون حجر'), value: 'gem' },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'goldPlated',
                  type: 'checkbox',
                  label: l('Also available 18K gold plated', 'متوفرة أيضاً بطلاء ذهب عيار 18'),
                  admin: { width: '50%' },
                },
                {
                  name: 'goldPlatedExtra',
                  type: 'number',
                  label: l('Extra for gold plating (JOD)', 'إضافة طلاء الذهب (د.أ)'),
                  min: 0,
                  defaultValue: 0,
                  admin: { width: '50%', condition: (_, siblingData) => Boolean(siblingData?.goldPlated) },
                },
              ],
            },
            {
              name: 'chainLengths',
              type: 'select',
              label: l('Chain lengths offered (cm)', 'أطوال السلسلة المتاحة (سم)'),
              hasMany: true,
              options: ['14', '16', '18', '20', '40', '45', '50', '55'].map((v) => ({ label: `${v} cm`, value: v })),
            },
            {
              // Choices the customer picks that can change the price, e.g. "Number of names":
              // One (+0) / Two (+10) / Three (+20), or "Style": Plain / With zircon (+5).
              name: 'options',
              type: 'array',
              dbName: 'product_options', // keeps generated Postgres names under 63 characters
              label: l('Options', 'الخيارات'),
              labels: { singular: l('Option', 'خيار'), plural: l('Options', 'الخيارات') },
              admin: {
                description: l(
                  'Choices that can change the price, like number of names or plain / with zircon.',
                  'اختيارات قد تغيّر السعر، مثل عدد الأسماء أو سادة / مع زركون.',
                ),
                initCollapsed: true,
              },
              fields: [
                { name: 'name', type: 'text', label: l('Option name', 'اسم الخيار'), required: true, localized: true },
                {
                  name: 'choices',
                  type: 'array',
                  dbName: 'product_option_choices',
                  label: l('Choices', 'الاختيارات'),
                  minRows: 1,
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        { name: 'label', type: 'text', label: l('Choice', 'الاختيار'), required: true, localized: true, admin: { width: '60%' } },
                        { name: 'extraPrice', type: 'number', label: l('Extra (JOD)', 'إضافة (د.أ)'), defaultValue: 0, admin: { width: '40%', step: 0.5 } },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              name: 'maxCharacters',
              type: 'number',
              label: l('Max characters (optional)', 'أقصى عدد أحرف (اختياري)'),
              min: 1,
              admin: { condition: (_, siblingData) => siblingData?.type && siblingData.type !== 'none' },
            },
          ],
        },
        seoTab(),
      ],
    },
    {
      // 0–100, kept up to date by the SEO pipeline after every save (src/seo/score.ts).
      name: 'seoScore',
      type: 'number',
      label: l('SEO score', 'تقييم السيو'),
      index: true,
      min: 0,
      max: 100,
      admin: {
        position: 'sidebar',
        readOnly: true,
        components: {
          Field: '/components/admin/SeoPanel#SeoPanel',
          Cell: '/components/admin/SeoScoreCell#SeoScoreCell',
        },
      },
    },
    slugField(),
    // The score panel above covers this on the product page; it stays as a list filter.
    { ...seoStatusField, admin: { ...seoStatusField.admin, condition: () => false } },
    legacyField,
    aiField,
  ],
}

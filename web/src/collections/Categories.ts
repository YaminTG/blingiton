import type { CollectionConfig } from 'payload'

import { anyone, may } from '@/access'
import { l } from '@/fields/label'
import { aiField, legacyField, seoStatusField, seoTab } from '@/fields/seo'
import { slugField } from '@/fields/slug'
import { categoryAfterChange, refreshAfterDelete } from '@/hooks/lifecycle'
import { tags } from '@/lib/tags'

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: l('Category', 'فئة'), plural: l('Categories', 'الفئات') },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'parent', 'slug', 'order', 'seoStatus'],
    group: l('Shop', 'المتجر'),
  },
  defaultSort: 'order',
  hooks: {
    afterChange: [categoryAfterChange],
    afterDelete: [refreshAfterDelete(tags.categories, tags.products, tags.redirects)],
  },
  access: {
    read: anyone,
    create: may('catalog'),
    update: may('catalog'),
    delete: may('catalog'),
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: l('Basics', 'الأساسيات'),
          fields: [
            { name: 'name', type: 'text', label: l('Name', 'الاسم'), required: true, localized: true },
            {
              name: 'parent',
              type: 'relationship',
              label: l('Inside category (optional)', 'ضمن فئة (اختياري)'),
              relationTo: 'categories',
              filterOptions: ({ id }) => ({ id: { not_equals: id } }),
            },
            { name: 'image', type: 'upload', label: l('Photo', 'الصورة'), relationTo: 'media' },
            {
              // A short paragraph at the top of the category page. Category pages rank for broad
              // searches ("silver name necklace"), and this text is what gives them something to rank with.
              name: 'intro',
              type: 'textarea',
              label: l('Intro paragraph', 'فقرة تعريفية'),
              localized: true,
              admin: { description: l('Shown at the top of the category page. Written automatically if empty.', 'تظهر أعلى صفحة الفئة. تُكتب تلقائياً إذا كانت فارغة.') },
            },
            {
              name: 'keywords',
              type: 'text',
              label: l('Search phrases (optional)', 'عبارات البحث (اختياري)'),
              localized: true,
              admin: {
                description: l(
                  'What customers type into Google for this category, separated by commas. Used when writing SEO text.',
                  'ما يكتبه الزبائن في جوجل لهذه الفئة، مفصولة بفواصل. تُستخدم عند كتابة نصوص السيو.',
                ),
              },
            },
            {
              type: 'row',
              fields: [
                { name: 'order', type: 'number', label: l('Order', 'الترتيب'), defaultValue: 0, admin: { width: '50%' } },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'showOnHome',
                  type: 'checkbox',
                  label: l('Show on the home page', 'إظهار في الصفحة الرئيسية'),
                  defaultValue: true,
                  admin: { width: '50%' },
                },
                {
                  name: 'inMenu',
                  type: 'checkbox',
                  label: l('Show in the top menu', 'إظهار في القائمة العلوية'),
                  defaultValue: false,
                  admin: { width: '50%', description: l('Keep it to 3 or 4.', 'يفضّل 3 أو 4 فقط.') },
                },
              ],
            },
            {
              name: 'products',
              type: 'join',
              label: l('Products', 'المنتجات'),
              collection: 'products',
              on: 'categories',
              admin: { defaultColumns: ['name', 'price', '_status'] },
            },
          ],
        },
        seoTab(),
      ],
    },
    slugField(),
    seoStatusField,
    legacyField,
    aiField,
  ],
}

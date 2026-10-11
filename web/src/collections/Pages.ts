import type { CollectionConfig } from 'payload'

import { loggedIn, publishedOrLoggedIn } from '@/access'
import { l } from '@/fields/label'
import { aiField, seoStatusField, seoTab } from '@/fields/seo'
import { slugField } from '@/fields/slug'
import { pageAfterChange, refreshAfterDelete } from '@/hooks/lifecycle'
import { tags } from '@/lib/tags'

// Content pages: About, Silver care guide, Shipping & Returns, FAQ, etc.
export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: l('Page', 'صفحة'), plural: l('Pages', 'الصفحات') },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'seoStatus', '_status'],
    group: l('Content', 'المحتوى'),
  },
  access: {
    read: publishedOrLoggedIn,
    create: loggedIn,
    update: loggedIn,
    delete: loggedIn,
  },
  versions: { drafts: true, maxPerDoc: 20 },
  hooks: {
    afterChange: [pageAfterChange],
    afterDelete: [refreshAfterDelete(tags.pages)],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: l('Content', 'المحتوى'),
          fields: [
            { name: 'title', type: 'text', label: l('Title', 'العنوان'), required: true, localized: true },
            { name: 'content', type: 'richText', label: l('Content', 'المحتوى'), localized: true },
          ],
        },
        seoTab(),
      ],
    },
    slugField('title'),
    seoStatusField,
    aiField,
  ],
}

import type { CollectionConfig } from 'payload'

import { admins, may } from '@/access'
import { l } from '@/fields/label'

// Shoppers waiting for a sold-out piece (or one combination of it) to come back. Created only by the
// product page's "Email me when it's back" form (/restock-request); emailed once by
// src/lib/restockNotify.ts when the piece can genuinely be ordered again.
export const RestockRequests: CollectionConfig = {
  slug: 'restock-requests',
  labels: { singular: l('Back-in-stock request', 'طلب تنبيه بالتوفر'), plural: l('Back-in-stock requests', 'طلبات التنبيه بالتوفر') },
  admin: {
    useAsTitle: 'email',
    group: l('Shop', 'المتجر'),
    defaultColumns: ['product', 'wanted', 'email', 'status', 'createdAt', 'notifiedAt'],
    description: l(
      'Shoppers who asked to be emailed when a sold-out piece is back. They get one email, automatically, as soon as it can be ordered again: set the piece (or its combination) back in stock and save.',
      'زبائن طلبوا رسالة عند عودة قطعة نفدت. تصلهم رسالة واحدة تلقائياً بمجرد أن يصبح طلبها ممكناً: أعد القطعة (أو التركيبة) إلى المخزون واحفظ.',
    ),
  },
  defaultSort: '-createdAt',
  access: { read: may('catalog', 'orders', 'customers'), create: () => false, update: may('catalog'), delete: admins },
  indexes: [{ fields: ['product', 'status'] }],
  fields: [
    { name: 'product', type: 'relationship', relationTo: 'products', label: l('Piece', 'القطعة'), required: true, index: true, admin: { readOnly: true } },
    {
      name: 'wanted',
      type: 'text',
      label: l('Choices', 'الاختيارات'),
      admin: { readOnly: true, description: l('The combination they want, when it has its own stock count.', 'التركيبة المطلوبة عندما يكون لها مخزون خاص.') },
    },
    // The combination row (Personalization → Combinations) whose count was empty; empty = the whole piece.
    { name: 'variant', type: 'text', index: true, admin: { hidden: true } },
    { name: 'choices', type: 'json', admin: { hidden: true } },
    // Cleared 90 days after the email (or a cancellation); the request stays as a count of demand.
    { name: 'email', type: 'email', label: l('Email', 'البريد الإلكتروني'), index: true, admin: { readOnly: true } },
    {
      name: 'locale',
      type: 'select',
      label: l('Language', 'اللغة'),
      defaultValue: 'en',
      options: [
        { label: 'English', value: 'en' },
        { label: 'العربية', value: 'ar' },
      ],
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'status',
      type: 'select',
      label: l('Status', 'الحالة'),
      required: true,
      defaultValue: 'waiting',
      index: true,
      options: [
        { label: l('Waiting', 'بالانتظار'), value: 'waiting' },
        { label: l('Emailed', 'أُرسلت الرسالة'), value: 'notified' },
        { label: l('Cancelled', 'أُلغي'), value: 'cancelled' },
      ],
      admin: { position: 'sidebar', description: l('Cancel to stop the email.', 'ألغِ لإيقاف الرسالة.') },
    },
    { name: 'notifiedAt', type: 'date', label: l('Emailed on', 'تاريخ الإرسال'), admin: { readOnly: true, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
  ],
}

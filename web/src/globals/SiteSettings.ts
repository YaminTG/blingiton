import type { GlobalConfig } from 'payload'

import { anyone, may } from '@/access'
import { l } from '@/fields/label'
import { settingsAfterChange } from '@/hooks/lifecycle'
import { restampStuck } from '@/lib/stuckOrders'

// Business details (feed the JewelryStore/Organization data Google reads) and the
// writing settings used by the automatic SEO pipeline.
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: l('Site settings', 'إعدادات الموقع'),
  admin: { group: l('Content', 'المحتوى') },
  access: { read: anyone, update: may('settings') },
  hooks: { afterChange: [settingsAfterChange, restampStuck] },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: l('Business', 'النشاط التجاري'),
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'businessName', type: 'text', label: l('Shop name', 'اسم المتجر'), localized: true, defaultValue: 'Blingiton', required: true },
                { name: 'tagline', type: 'text', label: l('Tagline', 'الشعار'), localized: true },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'phone', type: 'text', label: l('Phone', 'الهاتف'), admin: { placeholder: '+962 7…' } },
                { name: 'whatsapp', type: 'text', label: 'WhatsApp', defaultValue: '962796384424', admin: { description: l('Digits only, with country code.', 'أرقام فقط مع رمز الدولة.') } },
                { name: 'email', type: 'email', label: l('Email', 'البريد الإلكتروني') },
              ],
            },
            {
              name: 'social',
              type: 'group',
              label: l('Social accounts', 'حسابات التواصل'),
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'instagram', type: 'text', defaultValue: 'https://www.instagram.com/blingitonnnn/' },
                    { name: 'tiktok', type: 'text' },
                    { name: 'facebook', type: 'text' },
                  ],
                },
              ],
            },
            {
              name: 'address',
              type: 'group',
              label: l('Shop / workshop address', 'عنوان المتجر / المشغل'),
              fields: [
                { name: 'street', type: 'text', label: l('Street', 'الشارع'), localized: true },
                {
                  type: 'row',
                  fields: [
                    { name: 'city', type: 'text', label: l('City', 'المدينة'), localized: true, defaultValue: 'Amman' },
                    { name: 'postalCode', type: 'text', label: l('Postal code', 'الرمز البريدي') },
                    { name: 'country', type: 'text', label: l('Country code', 'رمز الدولة'), defaultValue: 'JO' },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'latitude', type: 'number', label: l('Latitude', 'خط العرض') },
                    { name: 'longitude', type: 'number', label: l('Longitude', 'خط الطول') },
                  ],
                },
              ],
            },
            {
              name: 'openingHours',
              type: 'array',
              label: l('Opening hours', 'ساعات العمل'),
              labels: { singular: l('Hours', 'ساعات'), plural: l('Hours', 'ساعات') },
              fields: [
                {
                  name: 'days',
                  type: 'select',
                  hasMany: true,
                  required: true,
                  options: [
                    { label: l('Saturday', 'السبت'), value: 'Saturday' },
                    { label: l('Sunday', 'الأحد'), value: 'Sunday' },
                    { label: l('Monday', 'الاثنين'), value: 'Monday' },
                    { label: l('Tuesday', 'الثلاثاء'), value: 'Tuesday' },
                    { label: l('Wednesday', 'الأربعاء'), value: 'Wednesday' },
                    { label: l('Thursday', 'الخميس'), value: 'Thursday' },
                    { label: l('Friday', 'الجمعة'), value: 'Friday' },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'opens', type: 'text', required: true, admin: { placeholder: '10:00' } },
                    { name: 'closes', type: 'text', required: true, admin: { placeholder: '20:00' } },
                  ],
                },
              ],
            },
            { name: 'defaultShareImage', type: 'upload', relationTo: 'media', label: l('Default share image', 'صورة المشاركة الافتراضية') },
          ],
        },
        {
          name: 'home',
          label: l('Home page', 'الصفحة الرئيسية'),
          fields: [
            {
              name: 'heroProduct',
              type: 'relationship',
              relationTo: 'products',
              label: l('“Try your name” product', 'منتج "جرّب اسمك"'),
              admin: {
                description: l(
                  'The name necklace the top of the home page opens, and the photo shown beside the preview.',
                  'قلادة الاسم التي يفتحها أعلى الصفحة الرئيسية، وصورتها بجانب المعاينة.',
                ),
              },
            },
            {
              name: 'giftPhoto',
              type: 'upload',
              relationTo: 'media',
              label: l('Gift section photo', 'صورة قسم الهدايا'),
              admin: { description: l('Tall photo of the pink box or gift bag.', 'صورة طولية للعلبة الوردية أو حقيبة الهدايا.') },
            },
            {
              name: 'instagramPhotos',
              type: 'upload',
              relationTo: 'media',
              hasMany: true,
              maxRows: 4,
              label: l('Instagram row photos', 'صور صف إنستغرام'),
            },
            {
              name: 'followers',
              type: 'text',
              label: l('Instagram followers (shown on the home page)', 'عدد متابعي إنستغرام (يظهر في الرئيسية)'),
              defaultValue: '69K',
            },
          ],
        },
        {
          // The home and shop pages aren't documents in the admin, so their Google title and
          // description live here.
          name: 'pageSeo',
          label: l('SEO: home & shop', 'السيو: الرئيسية والمتجر'),
          description: l(
            'What Google shows for the home page and the shop page. Titles 50–60 characters, descriptions 100–150.',
            'ما يظهر في جوجل للصفحة الرئيسية وصفحة المتجر. العنوان 50–60 حرفاً والوصف 100–150.',
          ),
          fields: [
            { name: 'homeTitle', type: 'text', label: l('Home page: SEO title', 'الرئيسية: عنوان السيو'), localized: true, maxLength: 60 },
            { name: 'homeDescription', type: 'textarea', label: l('Home page: SEO description', 'الرئيسية: وصف السيو'), localized: true, maxLength: 150 },
            { name: 'shopTitle', type: 'text', label: l('Shop page: SEO title', 'المتجر: عنوان السيو'), localized: true, maxLength: 60 },
            { name: 'shopDescription', type: 'textarea', label: l('Shop page: SEO description', 'المتجر: وصف السيو'), localized: true, maxLength: 150 },
          ],
        },
        {
          name: 'delivery',
          label: l('Delivery & returns', 'التوصيل والإرجاع'),
          description: l('Fees shown at checkout, in JOD, and the return policy.', 'الرسوم التي تظهر عند إتمام الطلب، بالدينار، وسياسة الإرجاع.'),
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'amman', type: 'number', label: l('Amman', 'داخل عمّان'), min: 0, defaultValue: 3, required: true, admin: { width: '33%' } },
                { name: 'jordan', type: 'number', label: l('Other cities in Jordan', 'مدن أخرى في الأردن'), min: 0, defaultValue: 5, required: true, admin: { width: '33%' } },
                {
                  name: 'giftCard',
                  type: 'number',
                  label: l('Gift card', 'بطاقة الإهداء'),
                  min: 0,
                  defaultValue: 3,
                  required: true,
                  admin: { width: '33%', description: l('Added at checkout, with the customer’s message.', 'تُضاف عند إتمام الطلب مع رسالة العميل.') },
                },
              ],
            },
            // Abroad: one price per zone for each way of shipping. Countries outside the Middle East
            // and Europe pay the US price (zones: src/lib/shipping.ts).
            ...(
              [
                ['dhl', l('International · DHL Express (3–5 business days)', 'دولي · DHL Express (3–5 أيام عمل)'), [20, 25, 30]],
                ['standard', l('International · Standard shipping (14–20 business days)', 'دولي · شحن عادي (14–20 يوم عمل)'), [8, 12, 17]],
              ] as const
            ).map(([name, label, [me, eu, us]]) => ({
              name,
              type: 'group' as const,
              label,
              admin: { description: l('Canada, Australia and every other country pay the US price.', 'كندا وأستراليا وباقي الدول تدفع سعر أمريكا.') },
              fields: [
                {
                  type: 'row' as const,
                  fields: [
                    { name: 'middleEast', type: 'number' as const, label: l('Middle East & Gulf', 'الشرق الأوسط والخليج'), min: 0, defaultValue: me, required: true, admin: { width: '33%' } },
                    { name: 'europe', type: 'number' as const, label: l('Europe', 'أوروبا'), min: 0, defaultValue: eu, required: true, admin: { width: '33%' } },
                    { name: 'us', type: 'number' as const, label: l('USA & rest of world', 'أمريكا وباقي العالم'), min: 0, defaultValue: us, required: true, admin: { width: '33%' } },
                  ],
                },
              ],
            })),
            {
              type: 'row',
              fields: [
                {
                  name: 'returnDays',
                  type: 'number',
                  label: l('Days to return a piece', 'أيام إرجاع القطعة'),
                  min: 0,
                  admin: {
                    width: '50%',
                    description: l(
                      'Shown to Google and AI search. 0 = no returns. Leave empty until the policy is decided.',
                      'يظهر لجوجل وبحث الذكاء الاصطناعي. 0 = لا يوجد إرجاع. اتركه فارغاً حتى تُحدَّد السياسة.',
                    ),
                  },
                },
                {
                  name: 'personalisedReturns',
                  type: 'checkbox',
                  label: l('Name and engraved pieces can be returned too', 'يمكن إرجاع قطع الأسماء والحفر أيضاً'),
                  defaultValue: false,
                  admin: { width: '50%' },
                },
              ],
            },
          ],
        },
        {
          // The order pipeline (src/lib/orderStages.ts): how long each stage may take before the
          // team is alerted, and which stages email the customer.
          name: 'orderFlow',
          label: l('Orders & alerts', 'الطلبات والتنبيهات'),
          description: l(
            'Paid → preparing → packed → shipped → delivered. An order that sits in one stage longer than its time below is “stuck”: it turns red in the orders list and on the dashboard, and the team gets an email.',
            'مدفوع ← قيد التحضير ← مغلّف ← تم الشحن ← تم التسليم. الطلب الذي يبقى في مرحلة أطول من الوقت المحدد أدناه يصبح "متأخراً": يظهر بالأحمر في قائمة الطلبات ولوحة التحكم، ويصل الفريق بريد تنبيه.',
          ),
          fields: [
            {
              name: 'limits',
              type: 'group',
              label: l('Hours allowed in each stage', 'الساعات المسموحة في كل مرحلة'),
              admin: { description: l('24 = one day, 120 = five days. 0 = never alert for that stage.', '24 = يوم، 120 = خمسة أيام. 0 = بلا تنبيه لهذه المرحلة.') },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'paid', type: 'number', label: l('Paid → start preparing', 'مدفوع ← بدء التحضير'), min: 0, defaultValue: 24, admin: { width: '33%' } },
                    { name: 'preparing', type: 'number', label: l('Preparing → packed', 'التحضير ← التغليف'), min: 0, defaultValue: 120, admin: { width: '33%' } },
                    { name: 'packed', type: 'number', label: l('Packed → shipped', 'مغلّف ← الشحن'), min: 0, defaultValue: 24, admin: { width: '33%' } },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'shippedLocal', type: 'number', label: l('Shipped → delivered (Jordan)', 'الشحن ← التسليم (الأردن)'), min: 0, defaultValue: 72, admin: { width: '33%' } },
                    { name: 'shippedDhl', type: 'number', label: l('Shipped → delivered (DHL Express)', 'الشحن ← التسليم (DHL Express)'), min: 0, defaultValue: 168, admin: { width: '33%' } },
                    {
                      name: 'shippedStandard',
                      type: 'number',
                      label: l('Shipped → delivered (standard abroad)', 'الشحن ← التسليم (شحن دولي عادي)'),
                      min: 0,
                      defaultValue: 720,
                      admin: { width: '33%' },
                    },
                  ],
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'alertEmails',
                  type: 'text',
                  label: l('Send stuck-order alerts to', 'أرسل تنبيهات التأخير إلى'),
                  admin: {
                    width: '67%',
                    placeholder: 'orders@blingitonjewels.com, owner@gmail.com',
                    description: l('Separate addresses with commas. Empty = the shop email on the Business tab.', 'افصل العناوين بفواصل. فارغ = بريد المتجر في تبويب النشاط التجاري.'),
                  },
                },
                {
                  name: 'remindHours',
                  type: 'number',
                  label: l('Remind again every (hours)', 'كرّر التذكير كل (ساعة)'),
                  min: 1,
                  defaultValue: 24,
                  admin: { width: '33%', description: l('While an order stays stuck.', 'ما دام الطلب متأخراً.') },
                },
              ],
            },
            {
              name: 'notify',
              type: 'group',
              label: l('Email the customer when the order is…', 'راسل العميل عندما يصبح الطلب…'),
              admin: {
                description: l(
                  'The “we’ve got your order” email always goes out. Each email is sent once per order, with a link to a page showing where the order is.',
                  'رسالة "وصلنا طلبك" تُرسل دائماً. كل رسالة تُرسل مرة واحدة لكل طلب، مع رابط لصفحة تُظهر أين وصل الطلب.',
                ),
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'preparing', type: 'checkbox', label: l('Being prepared', 'قيد التحضير'), defaultValue: true, admin: { width: '25%' } },
                    { name: 'packed', type: 'checkbox', label: l('Packed', 'مغلّف'), defaultValue: false, admin: { width: '25%' } },
                    { name: 'shipped', type: 'checkbox', label: l('Shipped', 'تم الشحن'), defaultValue: true, admin: { width: '25%' } },
                    { name: 'delivered', type: 'checkbox', label: l('Delivered', 'تم التسليم'), defaultValue: true, admin: { width: '25%' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: 'seoWriting',
          label: l('SEO writing', 'كتابة السيو'),
          description: l(
            'Guides the automatic descriptions, translations and SEO text. Changes apply to anything written from now on.',
            'توجّه الأوصاف والترجمات ونصوص السيو التلقائية. تُطبّق التغييرات على ما يُكتب من الآن فصاعداً.',
          ),
          fields: [
            {
              name: 'keywords',
              type: 'textarea',
              label: l('Phrases customers search for', 'العبارات التي يبحث عنها الزبائن'),
              localized: true,
              admin: {
                description: l('One per line, e.g. “silver name necklace Jordan”.', 'عبارة في كل سطر، مثل "قلادة اسم فضة الأردن".'),
              },
            },
            {
              name: 'facts',
              type: 'textarea',
              label: l('Facts that are always true', 'معلومات ثابتة دائماً'),
              localized: true,
              admin: {
                description: l(
                  'The AI may only state facts from here or from the product itself, e.g. “925 sterling silver”, “made to order in 4 days”, “DHL Express worldwide”.',
                  'لا يذكر الذكاء الاصطناعي إلا معلومات من هنا أو من المنتج نفسه، مثل "فضة 925" و"تُصنع خلال 4 أيام".',
                ),
              },
            },
            {
              name: 'voice',
              type: 'textarea',
              label: l('Tone of voice', 'أسلوب الكتابة'),
              localized: true,
              admin: { description: l('How the shop sounds, e.g. “warm, playful, short sentences”.', 'كيف يبدو صوت المتجر، مثل "دافئ ومرح وجمل قصيرة".') },
            },
            {
              name: 'avoid',
              type: 'textarea',
              label: l('Never say', 'لا تقل أبداً'),
              localized: true,
              admin: { description: l('Words or claims to avoid, one per line.', 'كلمات أو ادعاءات يجب تجنبها، واحدة في كل سطر.') },
            },
          ],
        },
      ],
    },
  ],
}

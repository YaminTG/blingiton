import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { ar } from '@payloadcms/translations/languages/ar'
import { en } from '@payloadcms/translations/languages/en'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { admins, isAdmin } from './access'
import { AuditLog } from './collections/AuditLog'
import { Categories } from './collections/Categories'
import { CustomerActivity } from './collections/CustomerActivity'
import { Customers } from './collections/Customers'
import { Events } from './collections/Events'
import { HealthSignals } from './collections/HealthSignals'
import { Media } from './collections/Media'
import { OrderCases } from './collections/OrderCases'
import { Orders } from './collections/Orders'
import { Pages } from './collections/Pages'
import { Products } from './collections/Products'
import { RestockRequests } from './collections/RestockRequests'
import { Reviews } from './collections/Reviews'
import { TwoFactor } from './collections/TwoFactor'
import { Users } from './collections/Users'
import { HealthState } from './globals/HealthState'
import { SecurityState } from './globals/SecurityState'
import { SiteSettings } from './globals/SiteSettings'
import { refreshAfterChange, refreshAfterDelete } from './hooks/lifecycle'
import { pruneActivityTask } from './lib/activityPrune'
import { withAudit, withAuditGlobal } from './lib/audit'
import { backupTask, restoreTestTask } from './lib/backup'
import { shopHealthTask } from './lib/health'
import { restockNotifyTask } from './lib/restockTask'
import { stuckOrdersTask } from './lib/stuckOrders'
import { tags } from './lib/tags'
import { seoRefreshTask } from './seo/tasks'
import { defaultLocale } from './lib/locales'
import { serverUrl } from './lib/site'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  serverURL: serverUrl,
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    // Always the light, gift-bag pink look; no dark theme.
    theme: 'light',
    meta: {
      titleSuffix: ' · Blingiton',
      icons: [{ rel: 'icon', type: 'image/png', url: '/icon-96.png' }],
    },
    components: {
      graphics: {
        Logo: '/components/admin/Brand#Logo',
        Icon: '/components/admin/Brand#Icon',
      },
      beforeDashboard: ['/components/admin/Dashboard#Dashboard'],
      afterNavLinks: ['/components/admin/ShopHealth#HealthNavLink', '/components/admin/CustomerInsights#InsightsNavLink', '/components/admin/Security#SecurityNavLink'],
      // The two-factor code step, shown on the login page while a login waits for its code.
      beforeLogin: ['/components/admin/TwoFactor#TwoFactor'],
      views: {
        customerInsights: { Component: '/components/admin/CustomerInsights#CustomerInsights', path: '/customer-insights' },
        security: { Component: '/components/admin/Security#Security', path: '/security' },
        shopHealth: { Component: '/components/admin/ShopHealth#ShopHealth', path: '/shop-health' },
      },
    },
  },
  collections: [Orders, OrderCases, Customers, Products, RestockRequests, Categories, Reviews, Pages, Media, Users, Events, CustomerActivity, HealthSignals, AuditLog, TwoFactor],
  globals: [SiteSettings, SecurityState, HealthState],
  // Order emails go through any SMTP service (Resend, Brevo, Zoho, Google Workspace…). Without
  // SMTP_HOST, Payload writes the emails to the server log instead, which is fine for development.
  email: process.env.SMTP_HOST
    ? nodemailerAdapter({
        defaultFromAddress: process.env.EMAIL_FROM_ADDRESS || 'orders@blingitonjewels.com',
        defaultFromName: process.env.EMAIL_FROM_NAME || 'Blingiton',
        transportOptions: {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: Number(process.env.SMTP_PORT) === 465,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        },
      })
    : undefined,
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  // Content in English and Arabic; Arabic falls back to English while a translation is missing.
  localization: {
    locales: [
      { code: 'en', label: 'English' },
      { code: 'ar', label: 'العربية', rtl: true },
    ],
    defaultLocale,
    fallback: true,
  },
  // The admin panel itself can be switched between English and Arabic per user.
  i18n: {
    supportedLanguages: { en, ar },
    fallbackLanguage: 'en',
  },
  jobs: {
    access: {
      // Admins, or a scheduler that sends `Authorization: Bearer $CRON_SECRET`.
      run: ({ req }) => {
        if (isAdmin(req.user)) return true
        const secret = process.env.CRON_SECRET
        return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`
      },
    },
    // On an always-on server (VPS), Payload can poll the queue itself. Serverless hosts call
    // /api/payload-jobs/run from their scheduler instead.
    autoRun: process.env.JOBS_AUTORUN === 'true' ? [{ cron: '* * * * *', limit: 20 }] : undefined,
    tasks: [seoRefreshTask, pruneActivityTask, stuckOrdersTask, backupTask, restoreTestTask, shopHealthTask, restockNotifyTask],
  },
  sharp,
  // Largest single upload. Phone photos are 3–12 MB; anything bigger is almost certainly a mistake.
  upload: { limits: { fileSize: 20 * 1024 * 1024 } },
  plugins: [
    // SEO fields are placed by hand in each collection's "SEO" tab (src/fields/seo.ts); the plugin
    // is registered for its admin components and translations only.
    seoPlugin({ uploadsCollection: 'media' }),
    redirectsPlugin({
      collections: ['products', 'categories', 'pages'],
      redirectTypes: ['301', '302'],
      redirectTypeFieldOverride: { defaultValue: '301' },
      overrides: {
        admin: { group: 'SEO' },
        access: { read: () => true, create: admins, update: admins, delete: admins },
        hooks: { afterChange: [refreshAfterChange(tags.redirects)], afterDelete: [refreshAfterDelete(tags.redirects)] },
      },
    }),
    // Photos go to any S3-compatible bucket (Cloudflare R2, Hetzner, DigitalOcean Spaces, AWS)
    // when one is configured; otherwise they stay on local disk, which is fine for development.
    s3Storage({
      enabled: Boolean(process.env.S3_BUCKET),
      collections: { media: true },
      bucket: process.env.S3_BUCKET || '',
      config: {
        endpoint: process.env.S3_ENDPOINT || undefined,
        region: process.env.S3_REGION || 'auto',
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        },
      },
    }),
    // Last, so it sees the plugins' collections too (Redirects): every change a signed-in person
    // makes goes into the audit log (src/lib/audit.ts). Not the log itself, the two-factor
    // records, the raw funnel and browsing rows or Payload's internal collections.
    (incoming) => ({
      ...incoming,
      collections: withAudit(incoming.collections ?? [], ['audit-log', 'two-factor', 'events', 'customer-activity', 'health-signals']),
      globals: (incoming.globals ?? []).map(withAuditGlobal),
    }),
  ],
})

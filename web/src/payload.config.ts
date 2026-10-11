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

import { admins } from './access'
import { Categories } from './collections/Categories'
import { Media } from './collections/Media'
import { Orders } from './collections/Orders'
import { Pages } from './collections/Pages'
import { Products } from './collections/Products'
import { Reviews } from './collections/Reviews'
import { Users } from './collections/Users'
import { SiteSettings } from './globals/SiteSettings'
import { refreshAfterChange, refreshAfterDelete } from './hooks/lifecycle'
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
    meta: {
      titleSuffix: ' · Blingiton',
      icons: [{ rel: 'icon', type: 'image/png', url: '/logo.png' }],
    },
    components: {
      graphics: {
        Logo: '/components/admin/Brand#Logo',
        Icon: '/components/admin/Brand#Icon',
      },
      beforeDashboard: ['/components/admin/Dashboard#Dashboard'],
    },
  },
  collections: [Orders, Products, Categories, Reviews, Pages, Media, Users],
  globals: [SiteSettings],
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
      // Logged-in admins, or a scheduler that sends `Authorization: Bearer $CRON_SECRET`.
      run: ({ req }) => {
        if (req.user) return true
        const secret = process.env.CRON_SECRET
        return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`
      },
    },
    // On an always-on server (VPS), Payload can poll the queue itself. Serverless hosts call
    // /api/payload-jobs/run from their scheduler instead.
    autoRun: process.env.JOBS_AUTORUN === 'true' ? [{ cron: '* * * * *', limit: 20 }] : undefined,
    tasks: [seoRefreshTask],
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
  ],
})

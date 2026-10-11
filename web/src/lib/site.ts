// Public address of the site, without a trailing slash. Used for canonical URLs, sitemaps and the admin.
export const serverUrl = (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000').replace(/\/$/, '')

// Only the live store may be indexed. Every other environment (local, test deploys, previews)
// is noindex, whichever host it runs on.
export const isProduction = process.env.SITE_ENV === 'production'

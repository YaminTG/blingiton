import type { MetadataRoute } from 'next'

import { isProduction } from '@/lib/site'
import { absolute } from '@/lib/urls'

export default function robots(): MetadataRoute.Robots {
  // Test and preview deploys must never end up in search results.
  if (!isProduction) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/redirect-lookup', '/bag-items', '/en/checkout', '/ar/checkout'] },
    sitemap: absolute('/sitemap.xml'),
    host: absolute('/'),
  }
}

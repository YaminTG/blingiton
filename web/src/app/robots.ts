import type { MetadataRoute } from 'next'

import { isProduction } from '@/lib/site'
import { absolute } from '@/lib/urls'

const PRIVATE = ['/admin', '/api', '/redirect-lookup', '/bag-items', '/place-order', '/submit-review', '/track', '/en/checkout', '/ar/checkout', '/en/review', '/ar/review']

// AI search and assistant crawlers, named so the welcome is explicit (some hosts and CDNs block
// them unless the site says otherwise). They get the same rules as everyone else.
const AI_BOTS = [
  'OAI-SearchBot', // ChatGPT search
  'ChatGPT-User', // ChatGPT browsing on a user's behalf
  'GPTBot', // OpenAI training
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended', // Gemini
  'Applebot-Extended', // Apple Intelligence
  'Bingbot', // Bing, which also powers Copilot and ChatGPT search
  'meta-externalagent', // Meta AI
  'DuckAssistBot',
]

export default function robots(): MetadataRoute.Robots {
  // Test and preview deploys must never end up in search results.
  if (!isProduction) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE },
      { userAgent: AI_BOTS, allow: '/', disallow: PRIVATE },
    ],
    sitemap: absolute('/sitemap.xml'),
    host: absolute('/'),
  }
}

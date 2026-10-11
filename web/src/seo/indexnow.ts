import { isProduction } from '@/lib/site'
import { absolute } from '@/lib/urls'

/**
 * Tells Bing, Yandex, Seznam and other IndexNow engines that pages changed, so they recrawl
 * within minutes. Google uses the sitemap instead. Live site only.
 */
export async function pingIndexNow(paths: string[]) {
  const key = process.env.INDEXNOW_KEY
  if (!isProduction || !key || !paths.length) return
  const host = new URL(absolute('/')).host
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation: absolute('/indexnow-key.txt'), urlList: paths.map(absolute) }),
  })
  if (!res.ok && res.status !== 202) console.warn(`[indexnow] ${res.status} for ${paths.length} urls`)
}

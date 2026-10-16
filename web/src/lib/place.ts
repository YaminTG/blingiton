/**
 * Where a request came from: the visitor's IP and whatever location the host reports. Cloudflare
 * and Vercel put both in headers; other hosts give the IP only. Nothing here is guessed: what the
 * headers don't say stays null.
 */

export type Place = { ip: string; country: string | null; city: string | null; region: string | null; agent: string | null }

const header = (h: Headers, ...names: string[]) => {
  for (const n of names) {
    const v = h.get(n)?.trim()
    if (v) return v
  }
  return null
}

const decode = (v: string | null) => {
  if (!v) return null
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

export function placeOf(h: Headers): Place {
  const country = header(h, 'cf-ipcountry', 'x-vercel-ip-country')
  return {
    ip: header(h, 'cf-connecting-ip', 'x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
    // Cloudflare: XX = unknown, T1 = Tor.
    country: country && country !== 'XX' ? country.toUpperCase() : null,
    city: decode(header(h, 'x-vercel-ip-city', 'cf-ipcity')),
    region: decode(header(h, 'x-vercel-ip-country-region', 'cf-region')),
    agent: h.get('user-agent')?.slice(0, 300) ?? null,
  }
}

export const countryName = (code: string) => {
  if (code === 'T1') return 'Tor network (hidden location)'
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

export const where = (p: Place) => (p.country ? [p.city, p.region, countryName(p.country)].filter(Boolean).join(', ') : 'unknown location')

import { unstable_cache } from 'next/cache'

import { cleanRates, fallbackRates, type Rates } from './currency'

// Free daily rates (no key), with a mirror. Rates are per 1 JOD.
const SOURCES = [
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/jod.json',
  'https://latest.currency-api.pages.dev/v1/currencies/jod.json',
]

/** Today's exchange rates, refreshed once a day. Falls back to fixed rates if both sources fail. */
export const getRates = unstable_cache(
  async (): Promise<Rates> => {
    for (const url of SOURCES) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
        if (!res.ok) continue
        const body = (await res.json()) as { jod?: Record<string, unknown> }
        if (body.jod) return cleanRates(body.jod)
      } catch {
        // try the next source
      }
    }
    return fallbackRates
  },
  ['currency-rates', 'v1'],
  { revalidate: 86400 },
)

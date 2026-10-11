import type { NextRequest } from 'next/server'

import { getBagProducts } from '@/lib/data'
import { isLocale } from '@/lib/locales'

// Names, photos and current prices for the products in a visitor's bag (the bag itself lives in their browser).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const locale = params.get('locale') ?? 'en'
  const ids = [...new Set((params.get('ids') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50)
  if (!isLocale(locale)) return Response.json([], { status: 400 })
  return Response.json(await getBagProducts(locale, ids.sort((a, b) => a - b)), {
    headers: { 'X-Robots-Tag': 'noindex' },
  })
}

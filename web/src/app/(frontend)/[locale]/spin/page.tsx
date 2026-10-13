import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SpinWheel } from '@/components/spin/SpinWheel'
import { dictionary } from '@/lib/dictionary'
import { isLocale } from '@/lib/locales'
import { prizes } from '@/lib/spinPrizes'
import { paths } from '@/lib/urls'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  // A temporary page for the bazaar: reached from a QR code, never from search.
  return { title: { absolute: `${dictionary(locale).spin.title} · Blingiton` }, robots: { index: false, follow: false } }
}

/** Bazaar prize wheel. Prizes are in src/lib/spinPrizes.ts. */
export default async function SpinPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  return <SpinWheel locale={locale} t={dictionary(locale).spin} prizes={prizes} shopHref={paths.shop(locale)} />
}

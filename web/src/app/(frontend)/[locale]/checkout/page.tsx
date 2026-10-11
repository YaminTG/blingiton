import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Checkout } from '@/components/checkout/Checkout'
import { getSettings } from '@/lib/data'
import { dictionary } from '@/lib/dictionary'
import { isLocale } from '@/lib/locales'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: { absolute: `${dictionary(locale).co.title} · Blingiton` }, robots: { index: false, follow: false } }
}

export default async function CheckoutPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const settings = await getSettings(locale)
  const fees = { amman: settings.delivery?.amman ?? 3, jordan: settings.delivery?.jordan ?? 5, international: settings.delivery?.international ?? 15 }
  return (
    <div className="wrap" id="co-root">
      <Checkout locale={locale} fees={fees} whatsapp={settings.whatsapp || '962796384424'} />
    </div>
  )
}

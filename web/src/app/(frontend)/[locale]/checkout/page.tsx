import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Checkout } from '@/components/checkout/Checkout'
import { getSettings } from '@/lib/data'
import { dictionary } from '@/lib/dictionary'
import { hyperpayConfig } from '@/lib/hyperpay'
import { isLocale } from '@/lib/locales'
import { feesFrom } from '@/lib/shipping'

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
  return (
    <div className="wrap" id="co-root">
      <Checkout locale={locale} fees={feesFrom(settings.delivery)} whatsapp={settings.whatsapp || '962796384424'} payOnline={hyperpayConfig() !== null} />
    </div>
  )
}

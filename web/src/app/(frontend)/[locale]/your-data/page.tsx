import config from '@payload-config'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { ForgetDevice } from '@/components/me/ForgetDevice'
import { DEVICE_COOKIE } from '@/lib/activity'
import { readDeviceToken } from '@/lib/customerToken'
import { trackingState, type TrackingState } from '@/lib/customers'
import { dictionary } from '@/lib/dictionary'
import { isLocale } from '@/lib/locales'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: { absolute: `${dictionary(locale).me.title} · Blingiton` }, robots: { index: false, follow: true } }
}

/** What the shop keeps, and the switch to stop personal suggestions (src/lib/activity.ts). */
export default async function YourDataPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = dictionary(locale).me

  // Whether this browser is remembered. Only the state is shown, never who it belongs to.
  let state: TrackingState = 'off'
  const token = readDeviceToken((await cookies()).get(DEVICE_COOKIE)?.value)
  if (token) {
    const payload = await getPayload({ config })
    const customer = await payload.findByID({ collection: 'customers', id: token.customer, depth: 0, disableErrors: true, select: { tracking: true, verifiedOrders: true } })
    if (customer && (customer.tracking?.epoch ?? 0) === token.epoch) state = trackingState(customer)
  }

  return (
    <div className="wrap">
      <article className="me">
        <h1>{t.heading}</h1>
        <p>{t.lead}</p>
        <h2>{t.orderTitle}</h2>
        <p>{t.orderBody}</p>
        <h2>{t.browseTitle}</h2>
        <p>{t.browseBody}</p>
        <ForgetDevice locale={locale} state={state} />
        <p>{t.other}</p>
      </article>
    </div>
  )
}

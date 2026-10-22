import config from '@payload-config'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { PayCard, PayChecking } from '@/components/checkout/PayCard'
import { PaidThanks } from '@/components/checkout/Thanks'
import { dictionary } from '@/lib/dictionary'
import { isLocale } from '@/lib/locales'
import { trackPath, validTrackToken } from '@/lib/orderTrack'
import { verifyCheckout, type Settled } from '@/lib/payments'
import { money, paths } from '@/lib/urls'

type Props = { params: Promise<{ locale: string; order: string; token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: { absolute: `${dictionary(locale).pay.title} · Blingiton` }, robots: { index: false, follow: false } }
}

/**
 * Card payment for an order waiting to be paid online (src/lib/payments.ts). The checkout sends
 * the customer here; HyperPay sends them back here with `?id=<checkout id>`, and this page asks
 * HyperPay itself how the payment went (never trusting the address alone). Refreshing is safe: a
 * paid order just shows the thank-you screen again.
 */
export default async function PayPage({ params, searchParams }: Props) {
  const { locale, order: orderParam, token } = await params
  if (!isLocale(locale)) notFound()
  const id = Number(orderParam)
  const q = await searchParams
  const checkoutId = Array.isArray(q.id) ? q.id[0] : q.id
  const t = dictionary(locale)
  const payload = await getPayload({ config })

  const load = () =>
    payload.findByID({ collection: 'orders', id, depth: 0, disableErrors: true, select: { number: true, status: true, total: true, payment: true, customer: true } })
  let order = validTrackToken(id, token) ? await load() : null

  if (!order) {
    return (
      <div className="wrap">
        <div className="co-empty empty">
          <Image src="/logo.png" alt="" width={96} height={96} />
          <h1>{t.os.badLinkTitle}</h1>
          <p>{t.os.badLinkBody}</p>
          <Link className="btn btn-primary" href={paths.shop(locale)}>
            {t.rv.backToShop}
          </Link>
        </div>
      </div>
    )
  }

  // Back from HyperPay, and not settled yet: ask how it went.
  let result: Settled | 'error' | null = null
  if (checkoutId && !order.payment.paidAt && order.status === 'pending') {
    try {
      result = await verifyCheckout(payload, id, checkoutId.slice(0, 100))
    } catch (err) {
      payload.logger.error({ err, order: id }, 'Could not check a HyperPay payment on return')
      result = 'error'
    }
    if (result === 'paid') order = (await load()) ?? order
  }

  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0, select: { whatsapp: true } })
  const no = `#${order.number}`
  const wa = `https://wa.me/${settings.whatsapp || '962796384424'}?text=${encodeURIComponent(t.co.waAbout(no))}`

  if (order.payment.method === 'card_online' && order.payment.paidAt) {
    return (
      <div className="wrap" id="co-root">
        <PaidThanks
          locale={locale}
          order={order.id}
          done={{ first: order.customer.name.trim().split(/\s+/)[0], no, email: order.customer.email ?? '', abroad: false, wa, track: trackPath(locale, order.id) }}
        />
      </div>
    )
  }

  const open = order.payment.method === 'card_online' && order.status === 'pending'
  return (
    <div className="wrap">
      <section className="pay" aria-labelledby="pay-h">
        <h1 id="pay-h">{t.pay.title}</h1>
        <p className="pay-lead">
          {t.pay.lead(no)} · <b>{money(order.total ?? 0, locale)}</b>
        </p>
        {!open ? (
          <>
            <p className="pay-msg">{t.pay.closed}</p>
            <Link className="btn btn-primary" href={paths.checkout(locale)}>
              {t.pay.back}
            </Link>
          </>
        ) : result === 'pending' || result === 'error' ? (
          <PayChecking locale={locale} />
        ) : (
          <>
            {result === 'failed' ? (
              <div className="err-sum" role="alert">
                <p>{t.pay.failed}</p>
              </div>
            ) : null}
            <PayCard locale={locale} order={order.id} token={token} />
            <p className="help">
              {t.pay.amount(money(order.total ?? 0, locale))} {t.pay.bankNote}
            </p>
            <p className="help">{t.pay.secure}</p>
          </>
        )}
        <a className="btn btn-outline" href={wa} target="_blank" rel="noopener">
          {t.pay.whatsapp}
        </a>
      </section>
    </div>
  )
}

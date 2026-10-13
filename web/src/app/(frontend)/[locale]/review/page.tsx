import config from '@payload-config'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { ReviewForm } from '@/components/review/ReviewForm'
import { dictionary } from '@/lib/dictionary'
import { isLocale, type Locale } from '@/lib/locales'
import { loadReviewable, ReviewError, type Reviewable } from '@/lib/reviews'
import { paths } from '@/lib/urls'

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: { absolute: `${dictionary(locale).rv.title} · Blingiton` }, robots: { index: false, follow: false } }
}

function Message({ locale, title, body }: { locale: Locale; title: string; body: string }) {
  return (
    <div className="co-empty empty">
      <Image src="/logo.png" alt="" width={96} height={96} />
      <h1>{title}</h1>
      <p>{body}</p>
      <Link className="btn btn-primary" href={paths.shop(locale)}>
        {dictionary(locale).rv.backToShop}
      </Link>
    </div>
  )
}

/** Reached from the "on its way" email: rate the pieces in that order. */
export default async function ReviewPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const q = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const t = dictionary(locale).rv

  let order: Reviewable
  try {
    order = await loadReviewable(await getPayload({ config }), Number(one(q.o)), one(q.t), locale)
  } catch (err) {
    if (!(err instanceof ReviewError)) throw err
    const notReady = err.code === 'not-ready'
    return (
      <div className="wrap">
        <Message locale={locale} title={notReady ? t.notReadyTitle : t.badLinkTitle} body={notReady ? t.notReadyBody : t.badLinkBody} />
      </div>
    )
  }

  return (
    <div className="wrap">
      {order.items.length && order.items.some((i) => !i.reviewed) ? (
        <ReviewForm locale={locale} order={order} token={one(q.t) ?? ''} />
      ) : (
        <Message locale={locale} title={t.thanksTitle} body={t.allDone} />
      )}
    </div>
  )
}

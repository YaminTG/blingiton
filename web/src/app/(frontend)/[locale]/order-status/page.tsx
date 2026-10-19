import config from '@payload-config'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { dictionary } from '@/lib/dictionary'
import { isLocale } from '@/lib/locales'
import { orderStages, stageRank, type Stage } from '@/lib/orderStages'
import { carrierLink, validTrackToken } from '@/lib/orderTrack'
import { reviewLink } from '@/lib/reviewCheck'
import { paths } from '@/lib/urls'

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: { absolute: `${dictionary(locale).os.title} · Blingiton` }, robots: { index: false, follow: false } }
}

const date = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'long', timeZone: 'Asia/Amman' }).format(new Date(iso))

/**
 * "Where is my order?", answered before the customer has to ask: reached from the link in every
 * order email and the thank-you page (signed, see src/lib/orderTrack.ts). Shows the stages with
 * their dates, the tracking number once shipped, and a WhatsApp button.
 */
export default async function OrderStatusPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const q = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const id = Number(one(q.o))
  const t = dictionary(locale)
  const os = t.os

  const payload = await getPayload({ config })
  const order = validTrackToken(id, one(q.t))
    ? await payload.findByID({
        collection: 'orders',
        id,
        depth: 0,
        disableErrors: true,
        select: { number: true, status: true, stage: true, stageHistory: true, createdAt: true, items: true, tracking: true },
      })
    : null

  if (!order) {
    return (
      <div className="wrap">
        <div className="co-empty empty">
          <Image src="/logo.png" alt="" width={96} height={96} />
          <h1>{os.badLinkTitle}</h1>
          <p>{os.badLinkBody}</p>
          <Link className="btn btn-primary" href={paths.shop(locale)}>
            {t.rv.backToShop}
          </Link>
        </div>
      </div>
    )
  }

  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0, select: { whatsapp: true } })
  const no = `#${order.number}`
  const wa = settings.whatsapp ? `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(t.co.waAbout(no))}` : null
  const stage = order.stage as Stage | null | undefined
  const reached = new Map<string, string>()
  for (const h of order.stageHistory ?? []) reached.set(h.step, h.at)
  const ended = order.status === 'cancelled' || order.status === 'refunded' || order.status === 'failed' || order.status === 'pending'
  const message = ended ? os[order.status as 'cancelled' | 'refunded' | 'failed' | 'pending'] : order.status === 'on-hold' && stage === 'paid' ? os.onHold : stage ? os.now[stage] : ''
  const trackingNo = stageRank(stage) >= stageRank('shipped') ? order.tracking?.number?.trim() : null
  const parcel = trackingNo ? order.tracking?.url?.trim() || carrierLink(order.tracking?.carrier, trackingNo) : null

  return (
    <div className="wrap">
      <article className="me os">
        <h1>{os.title}</h1>
        <p>{os.lead(no, date(order.createdAt, locale))}</p>

        <p className={`os-now${ended ? ' os-now--ended' : ''}`} role="status">
          {message}
        </p>

        {!ended ? (
          <ol className="os-steps">
            {orderStages.map((s) => {
              const state = s.value === stage ? 'now' : stageRank(s.value) < stageRank(stage) ? 'done' : 'todo'
              const at = state !== 'todo' ? reached.get(s.value) : undefined
              return (
                <li key={s.value} className={`is-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
                  <b>{os.steps[s.value]}</b>
                  {at ? <small>{date(at, locale)}</small> : null}
                </li>
              )
            })}
          </ol>
        ) : null}

        {trackingNo ? (
          <p className="os-tracking">
            {os.tracking}: <b dir="ltr">{trackingNo}</b>
            {parcel ? (
              <>
                {' · '}
                <a href={parcel} target="_blank" rel="noopener noreferrer">
                  {os.trackParcel}
                </a>
              </>
            ) : null}
          </p>
        ) : null}

        <h2>{os.items}</h2>
        <ul className="os-items">
          {(order.items ?? []).map((it, i) => (
            <li key={it.id ?? i}>
              {it.quantity > 1 ? `${it.quantity} × ` : ''}
              {it.name}
            </li>
          ))}
        </ul>

        <div className="os-help">
          <p>{os.help}</p>
          {wa ? (
            <a className="btn btn-primary" href={wa} target="_blank" rel="noopener">
              {os.whatsapp}
            </a>
          ) : null}
          {order.status === 'completed' ? (
            <a className="btn btn-outline" href={reviewLink(locale, order.id)}>
              {os.review}
            </a>
          ) : null}
        </div>
      </article>
    </div>
  )
}

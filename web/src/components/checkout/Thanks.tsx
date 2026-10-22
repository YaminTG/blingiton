'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'

import { Icon } from '@/components/Icon'
import { NamePreview } from '@/components/preview/NamePreview'
import { useStore } from '@/components/store/StoreProvider'
import type { BagProduct, CartItem } from '@/lib/cart'
import { dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/locales'
import { paths } from '@/lib/urls'

export type Done = { first: string; no: string; email: string; abroad: boolean; item: CartItem | null; product: BagProduct | null; wa: string; track: string | null }

const SPARK_COLORS = ['#D23E78', '#F070A0', '#FFFFFF', '#A01040', '#C9C8CF', '#F8D3DA']

/** The thank-you screen: the pink box opens on the first piece in the order. */
export function Thanks({ locale, done }: { locale: Locale; done: Done }) {
  const t = dictionary(locale)
  const c = t.co
  const [replay, setReplay] = useState(0)
  const thanksRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    window.scrollTo({ top: 0 })
    thanksRef.current?.focus()
  }, [])

  const it = done.item
  const showName = Boolean(it?.name && done.product && done.product.type !== 'engrave')
  const sparks = Array.from({ length: 26 }, (_, i) => {
    const a = -Math.PI / 2 + (((i * 37) % 26) / 26 - 0.5) * Math.PI * 1.3
    const d = 90 + ((i * 53) % 110)
    return {
      background: SPARK_COLORS[i % SPARK_COLORS.length],
      '--dx': `${Math.round(Math.cos(a) * d)}px`,
      '--dy': `${Math.round(Math.sin(a) * d)}px`,
      '--r': `${(i * 97) % 540}deg`,
      animationDelay: `${(1.25 + i * 0.012).toFixed(3)}s`,
    } as CSSProperties
  })
  return (
    <section className="thanks" aria-labelledby="thanks-h">
      <div className="unbox" aria-hidden="true" key={replay}>
        <div className="ub-box">
          {sparks.map((s, i) => (
            <i key={i} className="ub-spark" style={s} />
          ))}
          <div className="ub-rise">
            {showName && it ? (
              <NamePreview shape="plate" text={it.name ?? ''} sample={it.name ?? ''} style={it.style ?? 'script'} stone={it.stone ?? null} metal={it.finish ?? 'silver'} />
            ) : done.product?.image ? (
              <Image src={done.product.image} alt="" width={120} height={120} />
            ) : null}
          </div>
          <div className="ub-base">
            <span>BLINGITON</span>
          </div>
          <div className="ub-ribbon-h" />
          <div className="ub-lid">
            <b>
              BLING
              <br />
              IT ON!
            </b>
          </div>
          <div className="ub-ribbon-v" />
          <div className="ub-bow" />
          <Image className="ub-sticker sticker" src="/logo.png" alt="" width={88} height={88} />
        </div>
      </div>
      <h1 id="thanks-h" ref={thanksRef} tabIndex={-1}>
        {c.thanks(done.first)}
      </h1>
      <div className="rope" aria-hidden="true" />
      <p>{done.abroad ? c.thanksIntl(done.no, done.email) : c.thanksP(done.no, done.email)}</p>
      {done.track ? (
        <Link className="btn btn-primary" href={done.track}>
          {t.os.trackThanks}
        </Link>
      ) : null}
      <a className={`btn ${done.track ? 'btn-outline' : 'btn-primary'}`} href={done.wa} target="_blank" rel="noopener">
        <Icon name="whatsapp" />
        <span>{c.openAgain}</span>
      </a>
      <Link className="btn btn-outline" href={paths.shop(locale)}>
        {c.keep}
      </Link>
      <button className="replay" type="button" onClick={() => setReplay((n) => n + 1)}>
        {c.replay}
      </button>
    </section>
  )
}

/** Set by the checkout just before it goes to the card page: the order's first piece, for the box. */
const PAYING_KEY = 'bl-paying'
type Paying = { order: number; item: CartItem | null; product: BagProduct | null; cleared?: boolean }

export function rememberPaying(paying: Paying) {
  try {
    sessionStorage.setItem(PAYING_KEY, JSON.stringify(paying))
  } catch {
    // storage blocked: the box opens without the piece, and the bag isn't emptied
  }
}

const readPaying = () => {
  try {
    return sessionStorage.getItem(PAYING_KEY)
  } catch {
    return null
  }
}
const noSubscribe = () => () => {}

/**
 * The thank-you screen after a confirmed card payment (the /pay page). The bag was kept until now,
 * in case the payment failed. When this browser placed the order, its first piece goes in the box and
 * the bag is emptied, once (a refresh days later leaves a new bag alone).
 */
export function PaidThanks({ locale, order, done }: { locale: Locale; order: number; done: Omit<Done, 'item' | 'product'> }) {
  const { clear, ready } = useStore()
  const raw = useSyncExternalStore(noSubscribe, readPaying, () => null)
  const paying = useMemo(() => {
    try {
      const p = JSON.parse(raw ?? 'null') as Paying | null
      return p?.order === order ? p : null
    } catch {
      return null
    }
  }, [raw, order])

  useEffect(() => {
    if (!ready || !paying || paying.cleared) return
    clear()
    rememberPaying({ ...paying, cleared: true })
  }, [ready, paying, clear])

  if (!ready) return null
  return <Thanks locale={locale} done={{ ...done, item: paying?.item ?? null, product: paying?.product ?? null }} />
}

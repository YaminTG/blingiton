'use client'

import Image from 'next/image'
import { useState, type ReactNode } from 'react'

import { Icon } from '@/components/Icon'
import { NamePreview } from '@/components/preview/NamePreview'
import { MetalSwitch } from '@/components/store/Chrome'
import { dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/locales'

type Props = {
  locale: Locale
  /** The pill, heading and lead, rendered on the server. */
  intro: ReactNode
  /** The name necklace "Design yours" opens. */
  productHref: string | null
  photo: { src: string; alt: string; caption: string } | null
  note: string | null
}

/** Home page hero: type a name and watch it turn into a silver (or gold) necklace. */
export function HeroTry({ locale, intro, productHref, photo, note }: Props) {
  const t = dictionary(locale)
  const [name, setName] = useState('')
  const [style, setStyle] = useState<'script' | 'kufi'>('script')

  return (
    <div className="wrap hero-grid">
      <div>
        {intro}
        <form className="try" action={productHref ?? undefined} method="get">
          <input type="hidden" name="style" value={style} />
          <label className="caps" htmlFor="try-name">
            {t.tryLabel}
          </label>
          <div className="try-row">
            <input className="input" id="try-name" name="name" type="text" autoComplete="off" placeholder={t.tryPh} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-primary" type="submit" disabled={!productHref}>
              <span>{t.tryBtn}</span>
              <Icon name="arrow" className="flip" />
            </button>
          </div>
          <div className="try-meta">
            <div className="metal style-sw" role="radiogroup" aria-label={t.fStyle}>
              {(['script', 'kufi'] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={style === s} onClick={() => setStyle(s)}>
                  <span className={`sw-${s}`}>{t.styles[s]}</span>
                </button>
              ))}
            </div>
            <MetalSwitch />
            {note ? <span className="help">{note}</span> : null}
          </div>
        </form>
      </div>
      <div className="hero-art">
        <NamePreview shape="plate" text={name} sample={t.sampleName} style={style} />
        <Image className="sticker hero-sticker" src="/logo.png" alt="Bling it on!" width={144} height={144} priority />
        {photo ? (
          <figure className="hero-photo">
            <Image src={photo.src} alt={photo.alt} width={146} height={146} sizes="160px" />
            <figcaption>{photo.caption}</figcaption>
          </figure>
        ) : null}
      </div>
    </div>
  )
}

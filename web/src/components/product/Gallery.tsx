'use client'

import Image from 'next/image'
import { useState } from 'react'

import { usePick } from './live'

type Photo = { id: number; large: string; thumb: string; alt: string }

export function Gallery({ photos, label, showLabel }: { photos: Photo[]; label: string; showLabel: string[] }) {
  const [current, setCurrent] = useState(0)
  // The photo for what the customer picked (a design, a colour) takes over until a thumbnail is clicked.
  const pick = usePick()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const picked = pick?.photo?.large ?? null
  const chosen = picked && picked !== dismissed ? picked : null

  const main = photos[current]
  const src = chosen ?? main?.large
  return (
    <section className="gallery" aria-label={label}>
      <div className="stage">
        {src ? (
          <Image key={src} className="photo" src={src} alt={main?.alt ?? ''} width={1200} height={1200} sizes="(min-width: 1024px) 600px, 100vw" loading="eager" fetchPriority="high" data-chosen={chosen ? '' : undefined} />
        ) : null}
        <Image className="sticker" src="/logo.png" alt="" width={88} height={88} />
      </div>
      {photos.length > 1 ? (
        <div className="thumbs">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-label={showLabel[i]}
              aria-current={!chosen && i === current}
              onClick={() => {
                setCurrent(i)
                setDismissed(picked)
              }}
            >
              <Image src={p.thumb} alt="" width={160} height={160} sizes="96px" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

'use client'

import Image from 'next/image'
import { useState } from 'react'

type Photo = { id: number; large: string; thumb: string; alt: string }

export function Gallery({ photos, label, showLabel }: { photos: Photo[]; label: string; showLabel: string[] }) {
  const [current, setCurrent] = useState(0)
  const main = photos[current]
  return (
    <section className="gallery" aria-label={label}>
      <div className="stage">
        {main ? <Image className="photo" src={main.large} alt={main.alt} width={1200} height={1200} sizes="(min-width: 1024px) 600px, 100vw" priority /> : null}
        <Image className="sticker" src="/logo.png" alt="" width={88} height={88} />
      </div>
      {photos.length > 1 ? (
        <div className="thumbs">
          {photos.map((p, i) => (
            <button key={p.id} type="button" aria-label={showLabel[i]} aria-current={i === current} onClick={() => setCurrent(i)}>
              <Image src={p.thumb} alt="" width={160} height={160} sizes="96px" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

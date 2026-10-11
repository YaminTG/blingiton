'use client'

import { useEffect, useRef } from 'react'

import { engrave, plate, type EngraveShape, type LetterStyle, type Metal, type PreviewApi } from './draw'

type Props = {
  /** 'plate' draws a name necklace; any other shape is an engraved ring or cufflinks. */
  shape: 'plate' | EngraveShape
  text: string
  sample: string
  style: LetterStyle
  stone?: number | null
  scale?: number
  /** Force a finish (the order unboxing); otherwise the site-wide silver/gold choice. */
  metal?: Metal
  className?: string
  id?: string
}

/** The metallic name preview. The text stays in the page for screen readers; the piece is drawn on canvas. */
export function NamePreview({ shape, text, sample, style, stone = null, scale = 1, metal, className = '', id }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const api = useRef<PreviewApi | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const a = shape === 'plate' ? plate(el, { metal }) : engrave(el, { shape })
    api.current = a
    return () => {
      a.destroy()
      api.current = null
    }
  }, [shape, metal])

  // Runs after the effect above, including right after the drawing is (re)created.
  useEffect(() => {
    api.current?.set({ text, sample, style, stone, scale })
  }, [shape, metal, text, sample, style, stone, scale])

  // The drawing code owns the hidden .name span (its text and data attributes), so React leaves it empty.
  return (
    <div ref={ref} id={id} className={`plate ${className}`.trim()}>
      <span className="name" />
    </div>
  )
}

'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/Icon'
import { convert, currencies, flagOf, formatAmount, formatMoney, shortName, symbolOf, type Currency } from '@/lib/currency'
import { dictionary } from '@/lib/dictionary'

import { useStore } from './StoreProvider'

/**
 * Formats JOD amounts in the visitor's currency. `total` converts each part before adding, so a
 * subtotal always equals the lines shown above it.
 */
export function useMoney() {
  const { currency, rates, locale } = useStore()
  const conv = (jod: number) => convert(jod, currency, rates)
  return {
    fmt: (jod: number) => formatMoney(conv(jod), currency, locale),
    total: (jods: number[]) => formatMoney(jods.reduce((s, j) => s + conv(j), 0), currency, locale),
  }
}

// `data-price` lets the layout hide prices until they're in the visitor's currency.

/** A JOD price, shown in the visitor's currency. Usable from server components. */
export function Price({ jod, className }: { jod: number; className?: string }) {
  const { fmt } = useMoney()
  return (
    <span className={className} data-price="">
      {fmt(jod)}
    </span>
  )
}

/** "212–317 SAR": a price range, kept left-to-right in Arabic. */
export function PriceRange({ from, to }: { from: number; to: number }) {
  const { currency, rates, locale } = useStore()
  const [pre, post] = symbolOf(currency, locale)
  const n = (jod: number) => formatAmount(convert(jod, currency, rates), currency, locale)
  return (
    <span data-price="">
      <bdi dir="ltr">
        {pre}
        {n(from)}–{n(to)}
      </bdi>
      {post}
    </span>
  )
}

const Flag = ({ c }: { c: Currency }) => <Image className="flag" src={`/flags/${flagOf[c]}.svg`} alt="" width={24} height={24} unoptimized />

/** Header dropdown: the current flag and code, opening a list of every currency. */
export function CurrencyPicker() {
  const { currency, setCurrency, locale } = useStore()
  const t = dictionary(locale)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Open: focus the current choice; arrows move, Escape or a click outside closes.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus()
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const items = [...(listRef.current?.querySelectorAll<HTMLElement>('button') ?? [])]
        const i = items.indexOf(document.activeElement as HTMLElement)
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
      } else if (e.key === 'Tab') {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="cur" ref={rootRef}>
      <button
        ref={btnRef}
        className="cur-btn"
        type="button"
        aria-expanded={open}
        aria-controls="cur-list"
        aria-label={`${t.currency}: ${t.currencyNames[currency]}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="cur-now" data-price="">
          <Flag c={currency} />
          <span className="cur-code">{shortName(currency, locale)}</span>
        </span>
        <Icon name="chevron" />
      </button>
      {open ? (
        <div className="cur-pop" id="cur-list">
          <p className="cur-title">{t.currency}</p>
          <ul ref={listRef}>
            {currencies.map((c) => (
              <li key={c}>
                <button
                  type="button"
                  aria-current={c === currency ? 'true' : undefined}
                  onClick={() => {
                    setCurrency(c)
                    setOpen(false)
                    btnRef.current?.focus()
                  }}
                >
                  <Flag c={c} />
                  <span>{t.currencyNames[c]}</span>
                  <span className="cur-sym">{shortName(c, locale)}</span>
                  {c === currency ? <Icon name="check" /> : <span />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/Icon'
import type { SortOrder } from '@/lib/data'

const ORDER: SortOrder[] = ['loved', 'low', 'high']

/** The preview's sort listbox. Choosing an order loads the listing with ?sort=… */
export function SortMenu({ label, labels, value, hrefs }: { label: string; labels: Record<SortOrder, string>; value: SortOrder; hrefs: Record<SortOrder, string> }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(ORDER.indexOf(value))
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLUListElement>(null)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menu.current?.focus()
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  const show = () => {
    setActive(ORDER.indexOf(value))
    setOpen(true)
  }
  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) btn.current?.focus()
  }
  const choose = (i: number) => {
    close()
    if (ORDER[i] !== value) router.push(hrefs[ORDER[i]], { scroll: false })
  }

  return (
    <div className="sort" ref={wrap}>
      <span id="sort-label">{label}</span>
      <button
        ref={btn}
        className="sort-btn"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="sort-menu"
        aria-labelledby="sort-label sort-value"
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            show()
          }
        }}
      >
        <span id="sort-value">{labels[value]}</span>
        <Icon name="chevron" />
      </button>
      <ul
        ref={menu}
        className="sort-menu"
        id="sort-menu"
        role="listbox"
        aria-labelledby="sort-label"
        aria-activedescendant={open ? `sort-${ORDER[active]}` : undefined}
        tabIndex={-1}
        hidden={!open}
        onKeyDown={(e) => {
          const k = e.key
          if (k === 'ArrowDown') setActive((a) => (a + 1) % ORDER.length)
          else if (k === 'ArrowUp') setActive((a) => (a + ORDER.length - 1) % ORDER.length)
          else if (k === 'Home') setActive(0)
          else if (k === 'End') setActive(ORDER.length - 1)
          else if (k === 'Enter' || k === ' ') choose(active)
          else if (k === 'Escape') close()
          else if (k === 'Tab') return close(false)
          else return
          e.preventDefault()
        }}
      >
        {ORDER.map((o, i) => (
          <li key={o} id={`sort-${o}`} role="option" aria-selected={o === value} className={i === active ? 'active' : undefined} onClick={() => choose(i)} onMouseMove={() => setActive(i)}>
            <Icon name="check" />
            <span>{labels[o]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

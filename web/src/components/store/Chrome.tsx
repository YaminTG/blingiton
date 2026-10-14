'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'

import { Icon } from '@/components/Icon'
import { itemImage, optionLines, unitPrice } from '@/lib/cart'
import { dictionary } from '@/lib/dictionary'
import { paths } from '@/lib/urls'

import { useMoney } from './Money'
import { useStore } from './StoreProvider'

/* ---------- header buttons ---------- */

export function MenuButton({ label }: { label: string }) {
  const { openDrawer, drawer } = useStore()
  return (
    <button className="icon-btn menu-btn" type="button" aria-label={label} aria-controls="menu" aria-expanded={drawer === 'menu'} onClick={() => openDrawer('menu')}>
      <Icon name="menu" />
    </button>
  )
}

export function BagButton() {
  const { cart, openDrawer, drawer, bump, locale } = useStore()
  const t = dictionary(locale)
  const n = cart.reduce((s, i) => s + i.qty, 0)
  return (
    <button className="icon-btn" id="bag-btn" type="button" aria-controls="bag" aria-expanded={drawer === 'bag'} aria-label={`${t.bagTitle}, ${t.items(n)}`} onClick={() => openDrawer('bag')}>
      <Icon name="bag" />
      <span key={bump} className={`count${bump ? ' bump' : ''}`} data-n={n} aria-hidden="true">
        {n}
      </span>
    </button>
  )
}

/* ---------- silver / gold ---------- */

export function MetalSwitch({ label }: { label?: string }) {
  const { metal, setMetal, locale } = useStore()
  const t = dictionary(locale)
  return (
    <div className="metal" role="radiogroup" aria-label={label ?? t.fFinish}>
      <button type="button" role="radio" aria-checked={metal === 'silver'} onClick={() => setMetal('silver')}>
        <span className="dot" />
        <span>{t.silver}</span>
      </button>
      <button type="button" role="radio" aria-checked={metal === 'gold'} onClick={() => setMetal('gold')}>
        <span className="dot gold" />
        <span>{t.gold}</span>
      </button>
    </div>
  )
}

/* ---------- quick add on product cards ---------- */

export function CardAdd({ id, label }: { id: number; label: string }) {
  const { add } = useStore()
  return (
    <button className="card-add" type="button" aria-label={label} onClick={() => add({ id })}>
      <Icon name="plus" />
    </button>
  )
}

/* ---------- drawers ---------- */

function Drawer({ id, side, open, title, onClose, closeLabel, children, foot }: { id: string; side?: 'left'; open: boolean; title: string; onClose(): void; closeLabel: string; children: ReactNode; foot?: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const timer = setTimeout(() => closeRef.current?.focus(), 60)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (e.key !== 'Tab' || !ref.current) return
      const f = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea')].filter((x) => x.offsetParent !== null)
      if (!f.length) return
      const first = f[0],
        last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.documentElement.style.overflow = 'hidden'
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = ''
      opener?.focus?.({ preventScroll: true })
    }
  }, [open, onClose])

  return (
    <aside ref={ref} className={`drawer${side ? ` ${side}` : ''}${open ? ' open' : ''}`} id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-hidden={!open}>
      <div className="drawer-head">
        <h2 id={`${id}-title`}>{title}</h2>
        <button ref={closeRef} className="icon-btn" type="button" aria-label={closeLabel} onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      {children}
      {foot}
    </aside>
  )
}

function BagLines() {
  const { cart, products, setQty, remove, locale } = useStore()
  const { fmt } = useMoney()
  const t = dictionary(locale)
  const ar = locale === 'ar'
  return (
    <>
      {cart.map((it, i) => {
        const p = products[it.id]
        if (!p) return null
        return (
          <div className="line-item" key={i}>
            {itemImage(p, it) ? <Image src={itemImage(p, it)!} alt="" width={76} height={76} sizes="76px" /> : <span />}
            <div>
              <div className="li-name">
                <Link href={paths.product(locale, p.slug)}>{p.name}</Link>
              </div>
              <div className="li-meta">
                {optionLines(it, p, t, ar).map(([k, v], j) => (
                  <div key={j}>
                    {k ? <b>{k}:</b> : null} <bdi>{v}</bdi>
                  </div>
                ))}
              </div>
              <div className="li-row">
                <div className="stepper">
                  <button type="button" aria-label={t.decrease} onClick={() => setQty(i, it.qty - 1)}>
                    −
                  </button>
                  <span aria-label={t.qty}>{it.qty}</span>
                  <button type="button" aria-label={t.increase} onClick={() => setQty(i, it.qty + 1)}>
                    +
                  </button>
                </div>
                <span className="price">{fmt(unitPrice(p, it) * it.qty)}</span>
              </div>
              <button className="link-btn" type="button" onClick={() => remove(i)}>
                {t.remove}
              </button>
            </div>
          </div>
        )
      })}
    </>
  )
}

export function Drawers({ links }: { links: { href: string; label: string }[] }) {
  const { drawer, closeDrawer, cart, products, locale, toast } = useStore()
  const t = dictionary(locale)
  const pathname = usePathname()

  // A link inside a drawer (or the language switch) moves to another page: close it.
  useEffect(() => {
    closeDrawer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const { total } = useMoney()
  const lineTotals = cart.filter((it) => products[it.id]).map((it) => unitPrice(products[it.id], it) * it.qty)

  return (
    <>
      <div className={`scrim${drawer ? ' open' : ''}`} onClick={closeDrawer} />
      <Drawer id="menu" side="left" open={drawer === 'menu'} title={t.menu} onClose={closeDrawer} closeLabel={t.close}>
        <nav className="drawer-nav" aria-label={t.menu}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={closeDrawer}>
              {l.label}
            </Link>
          ))}
        </nav>
      </Drawer>
      <Drawer
        id="bag"
        open={drawer === 'bag'}
        title={t.bagTitle}
        onClose={closeDrawer}
        closeLabel={t.close}
        foot={
          cart.length ? (
            <div className="drawer-foot">
              <div className="sum-row">
                <span>{t.subtotal}</span>
                <span className="price">{total(lineTotals)}</span>
              </div>
              <Link className="btn btn-primary btn-block" href={paths.checkout(locale)} onClick={closeDrawer}>
                {t.checkout} <Icon name="arrow" className="flip" />
              </Link>
            </div>
          ) : null
        }
      >
        <div className="drawer-body">
          {cart.length ? (
            <BagLines />
          ) : (
            <div className="empty">
              <Image src="/logo.png" alt="" width={96} height={96} />
              <p>{t.bagEmpty}</p>
              <Link className="btn btn-outline" href={paths.shop(locale)} onClick={closeDrawer}>
                {t.shopNow}
              </Link>
            </div>
          )}
        </div>
      </Drawer>
      <div className={`toast${toast.visible ? ' show' : ''}`} role="status" aria-live="polite">
        <Image key={toast.key} src="/logo.png" alt="" width={34} height={34} />
        <span>{toast.text}</span>
      </div>
    </>
  )
}

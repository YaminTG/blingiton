'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'

import { Icon } from '@/components/Icon'
import { NamePreview } from '@/components/preview/NamePreview'
import { useStore } from '@/components/store/StoreProvider'
import { optionLines, unitPrice, type BagProduct, type CartItem } from '@/lib/cart'
import { dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/locales'
import { serverUrl } from '@/lib/site'
import { money, paths } from '@/lib/urls'

type Fees = { amman: number; jordan: number; international: number }
type Method = 'amman' | 'jordan' | 'intl'
type Pay = 'carddel' | 'cash' | 'intl'
type Form = { name: string; phone: string; email: string; country: number; city: string; address: string; method: Method; pay: Pay }
type Field = 'name' | 'phone' | 'email' | 'city' | 'address'
type Done = { first: string; phone: string; no: string; item: CartItem | null; product: BagProduct | null; wa: string }

// Short reference the customer and the shop can quote on WhatsApp.
const orderNumber = () => `BL-${Date.now().toString().slice(-6)}`

const SPARK_COLORS = ['#D23E78', '#F070A0', '#FFFFFF', '#A01040', '#C9C8CF', '#F8D3DA']

/** The preview's checkout. Until online payment is set up, the order is sent to the shop on WhatsApp. */
export function Checkout({ locale, fees, whatsapp }: { locale: Locale; fees: Fees; whatsapp: string }) {
  const t = dictionary(locale)
  const c = t.co
  const ar = locale === 'ar'
  const { cart, products, clear, ready } = useStore()
  const [f, setF] = useState<Form>({ name: '', phone: '', email: '', country: 0, city: '', address: '', method: 'amman', pay: 'carddel' })
  const [errors, setErrors] = useState<Field[]>([])
  const [done, setDone] = useState<Done | null>(null)
  const [replay, setReplay] = useState(0)
  const errRef = useRef<HTMLDivElement>(null)
  const thanksRef = useRef<HTMLHeadingElement>(null)

  const jordan = f.country === 0
  const fee = jordan ? (f.method === 'jordan' ? fees.jordan : fees.amman) : fees.international
  const lines = cart.map((it) => ({ it, p: products[it.id] })).filter((l): l is { it: CartItem; p: BagProduct } => Boolean(l.p))
  const subtotal = lines.reduce((s, { it, p }) => s + unitPrice(p, it) * it.qty, 0)
  const total = subtotal + fee

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((prev) => ({ ...prev, [k]: v }))

  // Fields with a problem; the messages are worded at render, so they follow the language.
  const validate = (form: Form) => {
    const bad: Field[] = []
    if (!form.name.trim()) bad.push('name')
    if (form.phone.replace(/\D/g, '').length < 8) bad.push('phone')
    if (!form.city.trim()) bad.push('city')
    if (!form.address.trim()) bad.push('address')
    return bad
  }
  const message = (id: Field) => (id === 'phone' ? c.phoneErr : c.required({ name: c.fullName, city: c.city, address: c.address, email: c.email }[id]))

  useEffect(() => {
    if (done) {
      window.scrollTo({ top: 0 })
      thanksRef.current?.focus()
    }
  }, [done])

  const methodLabel = jordan ? (f.method === 'jordan' ? c.jordanCities : c.amman) : c.intl
  const payLabel = !jordan ? c.payIntl : f.pay === 'cash' ? c.payCash : c.payCardDel

  function orderMessage(no: string) {
    const out: string[] = [c.orderHeading(no), '']
    for (const { it, p } of lines) {
      out.push(`${it.qty}× ${p.name} · ${money(unitPrice(p, it) * it.qty, locale)}`)
      for (const [k, v] of optionLines(it, p, t, ar)) out.push(`   ${k ? `${k}: ` : ''}${v}`)
      out.push(`   ${serverUrl}${paths.product(locale, p.slug)}`)
    }
    out.push('', `${t.subtotal}: ${money(subtotal, locale)}`, `${c.delivery} (${methodLabel}): ${money(fee, locale)}`, `${c.total}: ${money(total, locale)}`, '')
    out.push(`${c.fullName}: ${f.name.trim()}`, `${c.phone}: ${f.phone.trim()}`)
    if (f.email.trim()) out.push(`${c.email}: ${f.email.trim()}`)
    out.push(`${c.country}: ${c.countries[f.country]}`, `${c.city}: ${f.city.trim()}`, `${c.address}: ${f.address.trim()}`, `${c.payment}: ${payLabel}`)
    return out.join('\n')
  }

  function placeOrder(e: FormEvent) {
    e.preventDefault()
    const found = validate(f)
    setErrors(found)
    if (found.length) {
      setTimeout(() => errRef.current?.focus(), 0)
      return
    }
    const no = orderNumber()
    const wa = `https://wa.me/${whatsapp}?text=${encodeURIComponent(orderMessage(no))}`
    window.open(wa, '_blank', 'noopener')
    const first = lines[0]
    setDone({ first: f.name.trim().split(/\s+/)[0], phone: f.phone.trim(), no, item: first?.it ?? null, product: first?.p ?? null, wa })
    clear()
  }

  if (done) {
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
        <p>{c.thanksP(done.no)}</p>
        <a className="btn btn-primary" href={done.wa} target="_blank" rel="noopener">
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

  if (!ready) return null

  if (!cart.length) {
    return (
      <div className="co-empty empty">
        <Image src="/logo.png" alt="" width={96} height={96} />
        <h1>{c.title}</h1>
        <p>{c.empty}</p>
        <Link className="btn btn-primary" href={paths.shop(locale)}>
          {t.shopNow}
        </Link>
      </div>
    )
  }

  const field = (id: Field, label: string, o: { type?: string; req?: boolean; help?: string; auto?: string; area?: boolean; ph?: string } = {}) => {
    const req = o.req !== false
    const e = errors.includes(id) ? message(id) : null
    const common = {
      id,
      name: id,
      autoComplete: o.auto,
      required: req,
      'aria-required': req || undefined,
      'aria-describedby': `${id}-help ${id}-err`,
      'aria-invalid': e ? true : undefined,
      value: f[id],
    }
    return (
      <div className="field">
        <label htmlFor={id}>
          {label}
          {req ? (
            <>
              {' '}
              <span className="req" aria-hidden="true">
                *
              </span>
            </>
          ) : null}
        </label>
        {o.area ? (
          <textarea className="textarea" {...common} onChange={(ev) => set(id, ev.target.value)} />
        ) : (
          <input
            className="input"
            type={o.type ?? 'text'}
            {...common}
            placeholder={o.ph}
            inputMode={o.type === 'tel' ? 'tel' : undefined}
            dir={o.type === 'tel' ? 'ltr' : undefined}
            onChange={(ev) => set(id, ev.target.value)}
          />
        )}
        <span className="help" id={`${id}-help`}>
          {o.help}
        </span>
        <span className="err" id={`${id}-err`}>
          {e}
        </span>
      </div>
    )
  }


  return (
    <div className="co">
      <form
        noValidate
        onSubmit={placeOrder}
      >
        <h1>{c.title}</h1>
        {errors.length ? (
          <div className="err-sum" ref={errRef} tabIndex={-1} role="alert">
            <p>{c.errSum}</p>
            <ul>
              {errors.map((k) => (
                <li key={k}>
                  <a href={`#${k}`}>{message(k)}</a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <fieldset className="block">
          <h2>
            <span className="n">1</span>
            {c.s1}
          </h2>
          <div className="two">
            {field('name', c.fullName, { auto: 'name' })}
            {field('phone', c.phone, { type: 'tel', auto: 'tel', help: c.phoneHelp, ph: '+962 7X XXX XXXX' })}
          </div>
          {field('email', c.email, { type: 'email', auto: 'email', req: false })}
        </fieldset>
        <fieldset className="block">
          <h2>
            <span className="n">2</span>
            {c.s2}
          </h2>
          <div className="two">
            <div className="field">
              <label htmlFor="country">{c.country}</label>
              <select
                className="select"
                id="country"
                autoComplete="country-name"
                value={f.country}
                onChange={(e) => {
                  const country = Number(e.target.value)
                  setF((prev) => ({ ...prev, country, method: country === 0 ? 'amman' : 'intl', pay: country === 0 ? (prev.pay === 'intl' ? 'carddel' : prev.pay) : 'intl' }))
                }}
              >
                {c.countries.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            {field('city', c.city, { auto: 'address-level2' })}
          </div>
          {field('address', c.address, { area: true, help: c.addressHelp, auto: 'street-address' })}
          <div role="radiogroup" aria-label={c.method} className="rc-list">
            {jordan ? (
              <>
                <label className="rc">
                  <input type="radio" name="method" value="amman" checked={f.method === 'amman'} onChange={() => set('method', 'amman')} />
                  <span>
                    <b>{c.amman}</b>
                    <small>{c.ammanTime}</small>
                  </span>
                  <span className="fee">{money(fees.amman, locale)}</span>
                </label>
                <label className="rc">
                  <input type="radio" name="method" value="jordan" checked={f.method === 'jordan'} onChange={() => set('method', 'jordan')} />
                  <span>
                    <b>{c.jordanCities}</b>
                    <small>{c.jordanTime}</small>
                  </span>
                  <span className="fee">{money(fees.jordan, locale)}</span>
                </label>
              </>
            ) : (
              <label className="rc">
                <input type="radio" name="method" value="intl" checked readOnly />
                <span>
                  <b>{c.intl}</b>
                  <small>{c.intlTime}</small>
                </span>
                <span className="fee">{money(fees.international, locale)}</span>
              </label>
            )}
          </div>
        </fieldset>
        <fieldset className="block">
          <h2>
            <span className="n">3</span>
            {c.s3}
          </h2>
          <div role="radiogroup" aria-label={c.s3} className="rc-list">
            {jordan ? (
              <>
                <label className="rc">
                  <input type="radio" name="pay" value="carddel" checked={f.pay === 'carddel'} onChange={() => set('pay', 'carddel')} />
                  <span>
                    <b>{c.payCardDel}</b>
                    <small>{c.payCardDelNote}</small>
                  </span>
                  <Icon name="card" />
                </label>
                <label className="rc">
                  <input type="radio" name="pay" value="cash" checked={f.pay === 'cash'} onChange={() => set('pay', 'cash')} />
                  <span>
                    <b>{c.payCash}</b>
                    <small>{c.payCashNote}</small>
                  </span>
                  <Icon name="truck" />
                </label>
              </>
            ) : (
              <label className="rc">
                <input type="radio" name="pay" value="intl" checked readOnly />
                <span>
                  <b>{c.payIntl}</b>
                  <small>{c.payIntlNote}</small>
                </span>
                <Icon name="whatsapp" />
              </label>
            )}
          </div>
        </fieldset>
        <button className="btn btn-primary btn-block place" type="submit">
          <Icon name="whatsapp" />
          <span>
            {c.place} · <span className="price">{money(total, locale)}</span>
          </span>
        </button>
        <p className="help place-help">{c.placeHelp}</p>
      </form>

      <aside className="summary" aria-labelledby="sum-h">
        <h2 id="sum-h">{c.summary}</h2>
        {lines.map(({ it, p }, i) => (
          <div className="line-item" key={i}>
            {p.image ? <Image src={p.image} alt="" width={76} height={76} sizes="76px" /> : <span />}
            <div>
              <div className="li-name">
                {p.name}
                {it.qty > 1 ? ` × ${it.qty}` : ''}
              </div>
              <div className="li-meta">
                {optionLines(it, p, t, ar).map(([k, v], j) => (
                  <div key={j}>
                    {k ? <b>{k}:</b> : null} <bdi>{v}</bdi>
                  </div>
                ))}
              </div>
              <div className="li-row">
                <span />
                <span className="price">{money(unitPrice(p, it) * it.qty, locale)}</span>
              </div>
            </div>
          </div>
        ))}
        <div className="sum-lines">
          <div>
            <span>{t.subtotal}</span>
            <span className="price">{money(subtotal, locale)}</span>
          </div>
          <div>
            <span>{c.delivery}</span>
            <span className="price">{money(fee, locale)}</span>
          </div>
          <div className="total">
            <span>{c.total}</span>
            <span className="price">{money(total, locale)}</span>
          </div>
        </div>
      </aside>
    </div>
  )
}

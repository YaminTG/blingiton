'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { rememberPaying, Thanks, type Done } from '@/components/checkout/Thanks'
import { Icon } from '@/components/Icon'
import { useMoney } from '@/components/store/Money'
import { useStore } from '@/components/store/StoreProvider'
import { itemImage, optionLines, unitPrice, type BagProduct, type CartItem } from '@/lib/cart'
import { dictionary } from '@/lib/dictionary'
import { FINDER_KEY } from '@/lib/finder'
import { reportHealth } from '@/lib/healthReport'
import type { Locale } from '@/lib/locales'
import { ORIGIN_KEY } from '@/lib/origin'
import { COUNTRIES, countryByCode, deliveryFee, type Fees, type Method } from '@/lib/shipping'
import { track } from '@/lib/track'
import { money, paths } from '@/lib/urls'

type Pay = 'carddel' | 'cash' | 'intl'
type Form = {
  name: string
  phone: string
  email: string
  country: string
  city: string
  address: string
  method: Method
  pay: Pay
  gift: boolean
  giftMessage: string
  remember: boolean
}
type Field = 'name' | 'phone' | 'email' | 'city' | 'address' | 'giftMessage'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Clicked a gift-finder pick on this visit (components/finder/FinderTrack.tsx). */
const usedFinder = () => {
  try {
    return sessionStorage.getItem(FINDER_KEY) === '1'
  } catch {
    return false
  }
}

const readOrigin = () => {
  try {
    return JSON.parse(sessionStorage.getItem(ORIGIN_KEY) ?? 'null')
  } catch {
    return null
  }
}

/**
 * Checkout. The order is saved on the server (/place-order), which works out the prices itself;
 * the customer gets an email and the shop sees it under Orders in the admin. Abroad, with
 * `payOnline` (HyperPay set up), the order waits for payment and the customer goes on to the card
 * page (/pay/…); the bag is kept until the payment goes through.
 */
export function Checkout({ locale, fees, whatsapp, payOnline }: { locale: Locale; fees: Fees; whatsapp: string; payOnline: boolean }) {
  const t = dictionary(locale)
  const c = t.co
  const ar = locale === 'ar'
  const { cart, products, clear, ready, currency } = useStore()
  const { fmt, total: sum } = useMoney()
  const [f, setF] = useState<Form>({ name: '', phone: '', email: '', country: 'JO', city: '', address: '', method: 'amman', pay: 'carddel', gift: false, giftMessage: '', remember: false })
  const [errors, setErrors] = useState<Field[]>([])
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const errRef = useRef<HTMLDivElement>(null)

  // Shop funnel: checkout opened with these pieces in the bag (each counted once per visit).
  const bagIds = [...new Set(cart.map((i) => i.id))].join(',')
  useEffect(() => {
    if (ready && !done) for (const id of bagIds.split(',').filter(Boolean)) track('checkout', Number(id))
  }, [ready, done, bagIds])

  const zone = countryByCode(f.country)?.zone ?? 'jordan'
  const jordan = zone === 'jordan'
  const byCard = !jordan && payOnline
  const fee = deliveryFee(fees, zone, f.method)
  const giftFee = f.gift ? fees.giftCard : 0
  const lines = cart.map((it) => ({ it, p: products[it.id] })).filter((l): l is { it: CartItem; p: BagProduct } => Boolean(l.p))
  const lineTotals = lines.map(({ it, p }) => unitPrice(p, it) * it.qty)
  const total = lineTotals.reduce((s, n) => s + n, 0) + fee + giftFee
  // The order ships together, so one custom piece means waiting for it to be made.
  const made = lines.some(({ p }) => p.made)
  const shipTime = (time: string) => (made ? c.madeFirst(time) : time)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((prev) => ({ ...prev, [k]: v }))

  // Fields with a problem; the messages are worded at render, so they follow the language.
  const validate = (form: Form) => {
    const bad: Field[] = []
    if (!form.name.trim()) bad.push('name')
    if (form.phone.replace(/\D/g, '').length < 8) bad.push('phone')
    if (!EMAIL.test(form.email.trim())) bad.push('email')
    if (!form.city.trim()) bad.push('city')
    if (!form.address.trim()) bad.push('address')
    if (form.gift && !form.giftMessage.trim()) bad.push('giftMessage')
    return bad
  }
  const message = (id: Field) =>
    id === 'phone' ? c.phoneErr : id === 'email' ? c.emailErr : id === 'giftMessage' ? c.giftMsgErr : c.required({ name: c.fullName, city: c.city, address: c.address }[id])

  async function placeOrder(e: FormEvent) {
    e.preventDefault()
    if (sending) return
    const found = validate(f)
    setErrors(found)
    setFailure(null)
    if (found.length) {
      setTimeout(() => errRef.current?.focus(), 0)
      return
    }
    setSending(true)
    let leaving = false
    try {
      const res = await fetch('/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale,
          items: lines.map(({ it }) => it),
          customer: { name: f.name, phone: f.phone, email: f.email },
          shipping: { country: f.country, city: f.city, address: f.address, method: f.method },
          payment: f.pay === 'cash' ? 'cash' : 'card_on_delivery',
          giftCard: f.gift ? { message: f.giftMessage } : null,
          origin: readOrigin(),
          finder: usedFinder(),
          remember: f.remember,
        }),
      })
      const result = (await res.json().catch(() => ({}))) as { number?: number; payment?: string; track?: string; pay?: string | null; error?: string }
      if (!res.ok || !result.number) {
        // No answer of ours: the host or proxy failed before the shop could record it.
        if (!result.error) reportHealth({ type: 'checkout', detail: `status ${res.status}` })
        setFailure(result.error === 'gone' ? c.goneErr : c.placeErr)
        setTimeout(() => errRef.current?.focus(), 0)
        return
      }
      // To the card page. The bag stays until the payment goes through.
      if (typeof result.pay === 'string' && result.pay.startsWith('/')) {
        leaving = true
        rememberPaying({ order: Number(result.pay.split('/')[3]), item: lines[0]?.it ?? null, product: lines[0]?.p ?? null })
        window.location.assign(result.pay)
        return
      }
      const no = `#${result.number}`
      const first = lines[0]
      setDone({
        first: f.name.trim().split(/\s+/)[0],
        no,
        email: f.email.trim(),
        abroad: result.payment === 'whatsapp',
        item: first?.it ?? null,
        product: first?.p ?? null,
        wa: `https://wa.me/${whatsapp}?text=${encodeURIComponent(c.waAbout(no))}`,
        track: typeof result.track === 'string' && result.track.startsWith('/') ? result.track : null,
      })
      clear()
    } catch {
      if (navigator.onLine) reportHealth({ type: 'checkout', detail: 'network' })
      setFailure(c.placeErr)
      setTimeout(() => errRef.current?.focus(), 0)
    } finally {
      if (!leaving) setSending(false)
    }
  }

  if (done) return <Thanks locale={locale} done={done} />

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

  const field = (id: Field, label: string, o: { type?: string; req?: boolean; help?: string; auto?: string; area?: boolean; ph?: string; max?: number } = {}) => {
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
          <textarea className="textarea" {...common} placeholder={o.ph} maxLength={o.max} onChange={(ev) => set(id, ev.target.value)} />
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
        ) : failure ? (
          <div className="err-sum" ref={errRef} tabIndex={-1} role="alert">
            <p>{failure}</p>
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
          {field('email', c.email, { type: 'email', auto: 'email', help: c.emailHelp })}
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
                  const country = e.target.value
                  const home = countryByCode(country)?.zone === 'jordan'
                  setF((prev) => ({
                    ...prev,
                    country,
                    method: home ? (prev.method === 'jordan' ? 'jordan' : 'amman') : prev.method === 'intl_standard' ? 'intl_standard' : 'intl',
                    pay: home ? (prev.pay === 'intl' ? 'carddel' : prev.pay) : 'intl',
                  }))
                }}
              >
                {COUNTRIES.filter((x) => x.zone === 'jordan').map((x) => (
                  <option key={x.code} value={x.code}>
                    {x[locale]}
                  </option>
                ))}
                {(['me', 'europe', 'us'] as const).map((z) => (
                  <optgroup key={z} label={c.zones[z]}>
                    {COUNTRIES.filter((x) => x.zone === z).map((x) => (
                      <option key={x.code} value={x.code}>
                        {x[locale]}
                      </option>
                    ))}
                  </optgroup>
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
                  <span className="fee">{fmt(fees.amman)}</span>
                </label>
                <label className="rc">
                  <input type="radio" name="method" value="jordan" checked={f.method === 'jordan'} onChange={() => set('method', 'jordan')} />
                  <span>
                    <b>{c.jordanCities}</b>
                    <small>{c.jordanTime}</small>
                  </span>
                  <span className="fee">{fmt(fees.jordan)}</span>
                </label>
              </>
            ) : (
              <>
                <label className="rc">
                  <input type="radio" name="method" value="intl" checked={f.method === 'intl'} onChange={() => set('method', 'intl')} />
                  <span>
                    <b>{c.intl}</b>
                    <small>{shipTime(c.intlTime)}</small>
                  </span>
                  <span className="fee">{fmt(deliveryFee(fees, zone, 'intl'))}</span>
                </label>
                <label className="rc">
                  <input type="radio" name="method" value="intl_standard" checked={f.method === 'intl_standard'} onChange={() => set('method', 'intl_standard')} />
                  <span>
                    <b>{c.intlStd}</b>
                    <small>{shipTime(c.intlStdTime)}</small>
                  </span>
                  <span className="fee">{fmt(deliveryFee(fees, zone, 'intl_standard'))}</span>
                </label>
              </>
            )}
          </div>
          {!jordan ? (
            <p className="help ship-note">
              {made ? `${c.madeNote} ` : null}
              {c.surcharge}
            </p>
          ) : null}
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
            ) : byCard ? (
              <label className="rc">
                <input type="radio" name="pay" value="intl" checked readOnly />
                <span>
                  <b>{c.payCard}</b>
                  <small>{c.payCardNote}</small>
                </span>
                <Icon name="card" />
              </label>
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
        <div className="gift-box co-gift">
          <label className="check">
            <input type="checkbox" checked={f.gift} onChange={(e) => set('gift', e.target.checked)} />
            <span>
              {c.giftCard} · <span className="price">{fmt(fees.giftCard)}</span>
              <small>{c.giftCardHelp}</small>
            </span>
          </label>
          {f.gift ? <div className="gift-note">{field('giftMessage', c.giftMsg, { area: true, ph: c.giftMsgPh, max: 300 })}</div> : null}
        </div>
        {/* Opt-in, unticked by default: browsing insights for returning customers (lib/activity.ts). */}
        <label className="check co-remember">
          <input type="checkbox" checked={f.remember} onChange={(e) => set('remember', e.target.checked)} />
          <span>
            {c.remember}
            <small>
              {c.rememberHelp}{' '}
              <Link href={paths.yourData(locale)} target="_blank">
                {c.rememberLink}
              </Link>
            </small>
          </span>
        </label>
        <button className="btn btn-primary btn-block place" type="submit" disabled={sending} aria-busy={sending || undefined}>
          <Icon name="bag" />
          <span>
            {sending ? (
              c.placing
            ) : (
              <>
                {byCard ? c.toPay : c.place} · <span className="price">{sum([...lineTotals, fee, giftFee])}</span>
              </>
            )}
          </span>
        </button>
        <p className="help place-help">{byCard ? c.toPayHelp : c.placeHelp}</p>
      </form>

      <aside className="summary" aria-labelledby="sum-h">
        <h2 id="sum-h">{c.summary}</h2>
        {lines.map(({ it, p }, i) => (
          <div className="line-item" key={i}>
            {itemImage(p, it) ? <Image src={itemImage(p, it)!} alt="" width={76} height={76} sizes="76px" /> : <span />}
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
                <span className="price">{fmt(unitPrice(p, it) * it.qty)}</span>
              </div>
            </div>
          </div>
        ))}
        <div className="sum-lines">
          <div>
            <span>{t.subtotal}</span>
            <span className="price">{sum(lineTotals)}</span>
          </div>
          <div>
            <span>{c.delivery}</span>
            <span className="price">{fmt(fee)}</span>
          </div>
          {f.gift ? (
            <div>
              <span>{c.giftLine}</span>
              <span className="price">{fmt(giftFee)}</span>
            </div>
          ) : null}
          <div className="total">
            <span>{c.total}</span>
            <span className="price">{sum([...lineTotals, fee, giftFee])}</span>
          </div>
          {currency !== 'JOD' ? <p className="in-jod">{c.inJod(money(total, locale))}</p> : null}
        </div>
      </aside>
    </div>
  )
}

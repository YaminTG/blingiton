'use client'

import { useState } from 'react'

import { Icon } from '@/components/Icon'
import type { EngraveShape } from '@/components/preview/draw'
import { NamePreview } from '@/components/preview/NamePreview'
import { MetalSwitch } from '@/components/store/Chrome'
import { useStore } from '@/components/store/StoreProvider'
import { unitPrice, type BagProduct, type CartItem, type LetterStyle } from '@/lib/cart'
import { dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/locales'
import { stoneLabel, stones } from '@/lib/stones'
import { money } from '@/lib/urls'

export type FormProduct = BagProduct & {
  shape: 'plate' | EngraveShape | null
  defaultStyle: LetterStyle
  sample: string
  goldPlated: boolean
  chains: number[]
  madeToOrder: boolean
}

const STYLES: LetterStyle[] = ['script', 'classic', 'modern', 'kufi']

/** Personalisation, gift options and Add to bag, as on the preview's product page. */
export function ProductForm({ locale, product: p, askHref, initial }: { locale: Locale; product: FormProduct; askHref: string | null; initial: { name?: string; style?: string } }) {
  const t = dictionary(locale)
  const ar = locale === 'ar'
  const { add, metal } = useStore()

  const personal = p.type !== 'none'
  const letters = p.type === 'letters'
  const preview = letters || !p.shape ? null : p.shape
  const engraved = preview !== null && preview !== 'plate'
  const chains = p.type === 'engrave' ? [] : p.chains

  // "Design yours" on the home page passes the name and lettering along (?name=…&style=…).
  const [name, setName] = useState(personal ? (initial.name ?? '') : '')
  const [style, setStyle] = useState<LetterStyle>(STYLES.includes(initial.style as LetterStyle) ? (initial.style as LetterStyle) : p.defaultStyle)
  const [chain, setChain] = useState<number | null>(chains[Math.floor((chains.length - 1) / 2)] ?? null)
  const [stone, setStone] = useState<number | null>(null)
  const [choices, setChoices] = useState<Record<string, string>>(() => Object.fromEntries(p.options.map((o) => [o.id, o.choices[0]?.id ?? ''])))
  const [gift, setGift] = useState(false)
  const [note, setNote] = useState('')
  const [tsize, setTsize] = useState(100)
  const [tried, setTried] = useState(false)

  const finish = p.goldPlated ? metal : undefined
  const item: Omit<CartItem, 'qty'> = { id: p.id }
  if (personal) Object.assign(item, { name: name.trim(), style })
  if (finish) item.finish = finish
  if (chain) item.chain = chain
  if (personal && p.stones !== 'none') item.stone = stone
  if (engraved && tsize !== 100) item.tsize = tsize
  if (p.options.length) item.choices = choices
  if (gift) {
    item.gift = true
    if (note.trim()) item.note = note.trim()
  }
  const price = unitPrice(p, { ...item, qty: 1 })
  const nameMissing = personal && !name.trim()
  const kind = p.stones === 'birthstone' ? 'birthstone' : 'gem'
  const stoneList = stones.map((s, i) => ({ ...s, i })).filter((s) => kind === 'gem' || s.en)
  const setSize = (v: number) => setTsize(Math.max(50, Math.min(130, v)))

  return (
    <form
      className="opts-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (nameMissing) {
          setTried(true)
          document.getElementById('name-in')?.focus()
          return
        }
        add(item, { open: true })
      }}
    >
      {personal ? (
        <>
          {preview ? (
            <div>
              <NamePreview className="engr" shape={preview} text={name} sample={p.sample || t.sampleName} style={style} stone={p.stones !== 'none' ? stone : null} scale={tsize / 100} />
              {engraved ? (
                <div className="size-ctl">
                  <label className="legend" htmlFor="size-in">
                    {t.fSize}
                  </label>
                  <div className="size-row">
                    <button className="size-btn" type="button" aria-label={t.smaller} onClick={() => setSize(tsize - 10)}>
                      −
                    </button>
                    <input type="range" id="size-in" min={50} max={130} step={5} value={tsize} aria-valuetext={`${tsize}%`} onChange={(e) => setSize(Number(e.target.value))} />
                    <button className="size-btn" type="button" aria-label={t.bigger} onClick={() => setSize(tsize + 10)}>
                      +
                    </button>
                    <output htmlFor="size-in">{tsize}%</output>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="field">
            <div className="opt-head">
              <label className="legend" htmlFor="name-in">
                {p.type === 'engrave' ? t.fEngrave : letters ? t.fLetters : t.fName}
              </label>
            </div>
            <input
              className="input name-input"
              id="name-in"
              type="text"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-describedby="name-help name-err"
              aria-invalid={tried && nameMissing ? true : undefined}
            />
            <span className="help" id="name-help">
              {preview ? t.engraveHelp : letters ? t.lettersHelp : t.nameHelp}
            </span>
            <span className="err" id="name-err" role="alert">
              {tried && nameMissing ? t.nameErr : ''}
            </span>
          </div>
          <fieldset>
            <div className="opt-head">
              <span className="legend" id="style-l">
                {t.fStyle}
              </span>
              <span className="val">{t.styles[style]}</span>
            </div>
            <div className="opts" role="radiogroup" aria-labelledby="style-l">
              {STYLES.map((s) => (
                <button key={s} className="chip" type="button" role="radio" aria-checked={style === s} onClick={() => setStyle(s)}>
                  {t.styles[s]}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}

      {p.goldPlated ? (
        <fieldset>
          <div className="opt-head">
            <span className="legend">{t.fFinish}</span>
            {p.goldExtra ? <span className="val">{t.gold} +{money(p.goldExtra, locale)}</span> : null}
          </div>
          <MetalSwitch />
        </fieldset>
      ) : null}

      {chains.length ? (
        <fieldset>
          <div className="opt-head">
            <span className="legend" id="chain-l">
              {t.fChain}
            </span>
          </div>
          <div className="opts" role="radiogroup" aria-labelledby="chain-l">
            {chains.map((n) => (
              <button key={n} className="chip" type="button" role="radio" aria-checked={chain === n} onClick={() => setChain(n)}>
                {n} {t.cm}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {personal && p.stones !== 'none' ? (
        <fieldset>
          <div className="opt-head">
            <span className="legend" id="stone-l">
              {kind === 'birthstone' ? t.fStone : t.fGem}
            </span>
            <span className="val">{stone === null ? t.none : stoneLabel(stone, kind, ar)}</span>
          </div>
          <div className="stones" role="radiogroup" aria-labelledby="stone-l">
            <button className="swatch none" type="button" role="radio" aria-checked={stone === null} aria-label={t.none} onClick={() => setStone(null)}>
              <Icon name="x" />
            </button>
            {stoneList.map((s) => (
              <button
                key={s.i}
                className="swatch"
                type="button"
                role="radio"
                aria-checked={stone === s.i}
                style={{ background: s.c }}
                aria-label={stoneLabel(s.i, kind, ar)}
                title={stoneLabel(s.i, kind, ar)}
                onClick={() => setStone(s.i)}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      {p.options.map((o) => (
        <fieldset key={o.id}>
          <div className="opt-head">
            <span className="legend" id={`opt-${o.id}`}>
              {o.name}
            </span>
          </div>
          <div className="opts" role="radiogroup" aria-labelledby={`opt-${o.id}`}>
            {o.choices.map((c) => (
              <button key={c.id} className="chip" type="button" role="radio" aria-checked={choices[o.id] === c.id} onClick={() => setChoices((prev) => ({ ...prev, [o.id]: c.id }))}>
                {c.label}
                {c.extra ? ` +${money(c.extra, locale)}` : ''}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      {!p.soldOut ? (
        <div className="gift-box">
          <label className="check">
            <input type="checkbox" checked={gift} onChange={(e) => setGift(e.target.checked)} />
            <span>
              {t.giftToggle}
              <small>{t.giftHelp}</small>
            </span>
          </label>
          {gift ? (
            <div className="field gift-note">
              <label htmlFor="note-in">{t.note}</label>
              <textarea className="textarea" id="note-in" maxLength={140} placeholder={t.notePh} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="buy">
        {p.soldOut ? (
          <>
            <button className="btn btn-primary btn-block" type="button" disabled>
              {t.soldOut}
            </button>
            <p className="help">{t.soldOutLine}</p>
            {askHref ? (
              <a className="btn btn-outline btn-block" href={askHref} target="_blank" rel="noopener">
                <Icon name="whatsapp" />
                <span>{t.askWhatsApp}</span>
              </a>
            ) : null}
          </>
        ) : (
          <>
            <button className="btn btn-primary btn-block" type="submit">
              <Icon name="bag" />
              <span>
                {t.add} · {money(price, locale)}
              </span>
            </button>
            <div className="assure">
              <span>
                <Icon name="card" />
                {t.payLine}
              </span>
              <span>
                <Icon name={p.madeToOrder ? 'clock' : 'truck'} />
                {p.madeToOrder ? t.madeLine : t.readyLine}
              </span>
            </div>
          </>
        )}
      </div>
    </form>
  )
}

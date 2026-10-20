'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { Icon } from '@/components/Icon'
import type { EngraveShape } from '@/components/preview/draw'
import { NamePreview } from '@/components/preview/NamePreview'
import { useMoney } from '@/components/store/Money'
import { useStore } from '@/components/store/StoreProvider'
import { unitPrice, type BagProduct, type CartItem, type LetterStyle } from '@/lib/cart'
import { choiceSoldOut, resolve, sizeCm, stepRank, withSingles, type Answers, type Choice, type Step } from '@/lib/choices'
import { dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/locales'
import { stoneLabel, stones } from '@/lib/stones'
import { choiceDetail } from '@/lib/activity'
import { noteActivity, watchActiveTime } from '@/lib/customerTrack'
import { track } from '@/lib/track'

import { announcePick } from './live'
import { NotifyMe } from './NotifyMe'

export type FormProduct = BagProduct & {
  shape: 'plate' | EngraveShape | null
  defaultStyle: LetterStyle
  sample: string
  goldPlated: boolean
  chains: number[]
  madeToOrder: boolean
  /** Gone for good once sold, so there's no "email me when it's back". */
  oneOff: boolean
}

const STYLES: LetterStyle[] = ['script', 'classic', 'modern', 'kufi']
const ARABIC = /[؀-ۿ]/
const FONT_VAR: Record<LetterStyle, [string, string]> = {
  script: ['--font-script-en', '--font-script-ar'],
  classic: ['--font-classic-en', '--font-classic-ar'],
  modern: ['--font-latin', '--font-modern-ar'],
  kufi: ['--font-kufi', '--font-kufi'],
}
const PAPERCLIP = /paper|clip|مشبك/i

type Kind = 'q' | 'length' | 'stone' | 'text' | 'font' | 'metal'
type Flow = { key: string; kind: Kind; rank: number; q?: Step; eyebrow: string; ask: string }

/** How long a picked choice glints before the next question opens. */
const SETTLE_MS = 420

/**
 * The product page's piece builder: one question at a time, in the shop's order (design → size →
 * chain → sparkle/stone → name → lettering → finish → other), ending in a tag that sums up the
 * piece with its price and the Add to bag button.
 */
export function ProductForm({ locale, product: p, askHref, initial }: { locale: Locale; product: FormProduct; askHref: string | null; initial: { name?: string; style?: string } }) {
  const t = dictionary(locale)
  const ar = locale === 'ar'
  const { add, metal, setMetal } = useStore()
  const { fmt } = useMoney()

  const personal = p.type !== 'none'
  const letters = p.type === 'letters'
  const preview = letters || !p.shape ? null : p.shape
  const engraved = preview !== null && preview !== 'plate'
  const chains = p.type === 'engrave' ? [] : p.chains
  const stoneKind = p.stones === 'birthstone' ? 'birthstone' : 'gem'
  const hasStone = personal && p.stones !== 'none'
  const fromHome = personal && Boolean(initial.name)
  const initialStyle = STYLES.includes(initial.style as LetterStyle) ? (initial.style as LetterStyle) : null

  // "Design yours" on the home page passes the name and lettering along (?name=…&style=…).
  const [raw, setRaw] = useState<Answers>({})
  const [name, setName] = useState(fromHome ? (initial.name ?? '') : '')
  const [style, setStyle] = useState<LetterStyle>(initialStyle ?? p.defaultStyle)
  const [chain, setChain] = useState<number | null>(chains.length === 1 ? chains[0] : null)
  const [stone, setStone] = useState<number | null>(null)
  const [tsize, setTsize] = useState(100)
  const [tried, setTried] = useState(false)
  const [done, setDone] = useState<Set<string>>(() => {
    const s = new Set<string>()
    if (chains.length === 1) s.add('length')
    if (fromHome) s.add('text')
    if (fromHome && initialStyle) s.add('font')
    return s
  })
  const [editing, setEditing] = useState<string | null>(null)
  const [settling, setSettling] = useState<string | null>(null)

  const answers = useMemo(() => withSingles(p.questions, raw), [p.questions, raw])
  const r = useMemo(() => resolve(p.price, p.questions, p.variants, answers), [p.price, p.questions, p.variants, answers])

  const flow: Flow[] = useMemo(() => {
    const list: Flow[] = r.steps.map((s) => ({
      key: s.id,
      kind: 'q',
      rank: stepRank[s.look],
      q: s,
      eyebrow: s.look === 'other' ? t.b.eyebrows.other : s.name,
      ask: s.look === 'other' ? s.name : t.b.asks[s.look],
    }))
    if (chains.length) list.push({ key: 'length', kind: 'length', rank: stepRank.length, eyebrow: t.b.eyebrows.length, ask: t.b.asks.length })
    if (hasStone) list.push({ key: 'stone', kind: 'stone', rank: stepRank.stone, eyebrow: t.b.eyebrows.stone, ask: t.b.asks[stoneKind] })
    if (personal) {
      list.push({ key: 'text', kind: 'text', rank: stepRank.text, eyebrow: t.b.eyebrows.text, ask: t.b.asks[p.type as 'name' | 'letters' | 'engrave'] })
      list.push({ key: 'font', kind: 'font', rank: stepRank.font, eyebrow: t.b.eyebrows.font, ask: t.b.asks.font })
    }
    if (p.goldPlated) list.push({ key: 'metal', kind: 'metal', rank: stepRank.finish, eyebrow: t.b.eyebrows.finish, ask: t.b.asks.finish })
    // Stable: the shop's questions come before a built-in step of the same rank.
    return list.map((f, i) => ({ f, i })).sort((a, b) => a.f.rank - b.f.rank || a.i - b.i).map(({ f }) => f)
  }, [r.steps, chains.length, hasStone, personal, p.goldPlated, p.type, stoneKind, t])

  const answered = (f: Flow) => (f.kind === 'q' ? Boolean(answers[f.key]) : done.has(f.key))
  const firstOpen = flow.find((f) => !answered(f))?.key ?? null
  const current = settling ?? editing ?? firstOpen
  const complete = flow.every(answered)
  const left = flow.filter((f) => !answered(f)).length

  const finish = p.goldPlated && done.has('metal') ? metal : undefined
  const item: Omit<CartItem, 'qty'> = { id: p.id }
  if (Object.keys(r.answers).length) item.choices = r.answers
  if (personal) {
    if (name.trim()) item.name = name.trim()
    item.style = style
  }
  if (finish) item.finish = finish
  if (chain) item.chain = chain
  if (hasStone) item.stone = stone
  if (engraved && tsize !== 100) item.tsize = tsize
  const price = unitPrice(p, { ...item, qty: 1 })
  const comboGone = r.complete && r.stock !== null && r.stock <= 0
  const soldOut = p.soldOut || comboGone
  const nameMissing = personal && !p.textOptional && !name.trim()

  // The gallery and headline price follow the picks once there are any.
  const started = Object.keys(raw).length > 0 || done.size > (fromHome ? 1 : 0)
  useEffect(() => {
    if (started) announcePick({ price, photo: r.photo })
  }, [started, price, r.photo])

  // Shop funnel: the product was seen, and (for name pieces) someone started typing a name.
  // Customer insights, for a recognised returning customer only (lib/customerTrack.ts): the view,
  // the time spent on it, and each option they pick.
  useEffect(() => {
    track('view', p.id)
    noteActivity({ type: 'view', product: p.id })
    return watchActiveTime(p.id)
  }, [p.id])
  const notePick = (key: string, value: string | number) => noteActivity({ type: 'choice', product: p.id, detail: choiceDetail(key, value) })
  useEffect(() => {
    if (personal && name.trim()) track('personalize', p.id)
  }, [personal, name, p.id])

  // Bring the next question into view (and focus, for keyboard users) as the flow moves on.
  const formRef = useRef<HTMLFormElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) {
      moved.current = true
      return
    }
    const form = formRef.current
    if (!form) return
    const target = form.querySelector<HTMLElement>(current ? `[data-step="${current}"] .b-ask` : '.tag')
    if (!target) return
    target.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    if (form.contains(document.activeElement) && document.activeElement !== document.body) target.focus({ preventScroll: true })
  }, [current])

  const settle = (key: string) => {
    setSettling(key)
    window.setTimeout(() => {
      setSettling(null)
      setEditing(null)
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : SETTLE_MS)
  }
  const markDone = (key: string) => {
    setDone((prev) => new Set(prev).add(key))
    settle(key)
  }
  const pickChoice = (s: Step, c: Choice) => {
    setRaw((prev) => ({ ...prev, [s.id]: c.id }))
    notePick(`q:${s.id}`, c.id)
    // A finish choice also turns the live previews silver or gold.
    if (s.look === 'finish' && (c.picture === 'gold' || c.picture === 'silver')) setMetal(c.picture)
    settle(s.id)
  }
  const finishText = () => {
    if (nameMissing) {
      setTried(true)
      document.getElementById('name-in')?.focus()
      return
    }
    markDone('text')
  }

  const answerText = (f: Flow): string => {
    if (f.kind === 'q') return f.q!.choices.find((c) => c.id === answers[f.key])?.label ?? ''
    if (f.kind === 'length') return chain ? `${chain} ${t.cm}` : ''
    if (f.kind === 'stone') return stone === null ? t.none : stoneLabel(stone, stoneKind, ar)
    if (f.kind === 'text') return name.trim() || t.none
    if (f.kind === 'font') return t.styles[style]
    return t[metal]
  }
  const sampleText = name.trim() || p.sample || t.sampleName
  const fontOf = (s: LetterStyle) => `var(${FONT_VAR[s][ARABIC.test(sampleText) ? 1 : 0]})`
  const extra = (n: number) =>
    n ? (
      <small className="b-extra">
        {t.b.extra('')}
        <span data-price="">{fmt(n)}</span>
      </small>
    ) : null

  const radio = (key: string, checked: boolean, onPick: () => void, children: ReactNode, opts: { className: string; disabled?: boolean; label?: string; style?: CSSProperties }) => (
    <button
      key={key}
      type="button"
      role="radio"
      className={opts.className}
      aria-checked={checked}
      aria-label={opts.label}
      disabled={opts.disabled}
      data-settling={checked && settling !== null ? '' : undefined}
      style={opts.style}
      onClick={onPick}
    >
      {children}
    </button>
  )

  /** The choices of one of the shop's questions, drawn to suit what the question is about. */
  const choicesOf = (s: Step, labelId: string) => {
    const gone = (c: Choice) => choiceSoldOut(p.questions, p.variants, answers, s.id, c.id)
    const label = (c: Choice) => (
      <span className="b-label">
        {c.label}
        {gone(c) ? <small className="b-gone">{t.b.soldOut}</small> : extra(c.extra)}
      </span>
    )
    // Sizes are always drawn to scale; their photos still show in the gallery when picked.
    const photos = s.look !== 'size' && s.choices.some((c) => c.photo)
    if (photos) {
      return (
        <div className="b-cards" role="radiogroup" aria-labelledby={labelId}>
          {s.choices.map((c) =>
            radio(
              c.id,
              answers[s.id] === c.id,
              () => pickChoice(s, c),
              <>
                <span className="b-card-img">
                  {c.photo ? <Image src={c.photo.thumb} alt="" width={240} height={240} sizes="160px" /> : <span className={`b-pic pic-${c.picture ?? 'silver'}`} />}
                </span>
                {label(c)}
              </>,
              { className: 'b-card', disabled: gone(c) },
            ),
          )}
        </div>
      )
    }
    if (s.look === 'size') {
      const cms = s.choices.map((c) => sizeCm(c.label))
      const scaled = cms.every((n) => n !== null)
      const max = scaled ? Math.max(...(cms as number[])) : s.choices.length
      return (
        <>
          <div className="b-sizes" role="radiogroup" aria-labelledby={labelId}>
            {s.choices.map((c, i) => {
              const d = Math.round(18 + ((scaled ? cms[i]! : i + 1) / max) * 56)
              return radio(
                c.id,
                answers[s.id] === c.id,
                () => pickChoice(s, c),
                <>
                  <span className="b-disc-box">
                    <span className="b-disc" style={{ width: d, height: d }} />
                  </span>
                  {label(c)}
                </>,
                { className: 'b-size', disabled: gone(c) },
              )
            })}
          </div>
          {scaled ? <p className="help b-note">{t.b.toScale}</p> : null}
        </>
      )
    }
    if (s.look === 'chain') {
      return (
        <div className="b-chains" role="radiogroup" aria-labelledby={labelId}>
          {s.choices.map((c) =>
            radio(
              c.id,
              answers[s.id] === c.id,
              () => pickChoice(s, c),
              <>
                <ChainDrawing paperclip={c.picture === 'paperclip' || (c.picture !== 'cable' && PAPERCLIP.test(c.label))} />
                {label(c)}
              </>,
              { className: 'b-chain', disabled: gone(c) },
            ),
          )}
        </div>
      )
    }
    if (s.choices.some((c) => c.picture) || s.look === 'finish') {
      return (
        <div className="b-swatches" role="radiogroup" aria-labelledby={labelId}>
          {s.choices.map((c) =>
            radio(
              c.id,
              answers[s.id] === c.id,
              () => pickChoice(s, c),
              <>
                <span className={`b-pic pic-${c.picture ?? (/gold|ذهب/i.test(c.label) ? 'gold' : 'silver')}`} />
                {label(c)}
              </>,
              { className: 'b-swatch', disabled: gone(c) },
            ),
          )}
        </div>
      )
    }
    return (
      <div className="b-pills" role="radiogroup" aria-labelledby={labelId}>
        {s.choices.map((c) => radio(c.id, answers[s.id] === c.id, () => pickChoice(s, c), label(c), { className: 'b-pill', disabled: gone(c) }))}
      </div>
    )
  }

  const body = (f: Flow, labelId: string): ReactNode => {
    switch (f.kind) {
      case 'q':
        return choicesOf(f.q!, labelId)
      case 'length':
        return (
          <div className="b-pills" role="radiogroup" aria-labelledby={labelId}>
            {chains.map((n) =>
              radio(
                String(n),
                chain === n,
                () => {
                  setChain(n)
                  notePick('chain', n)
                  markDone('length')
                },
                <span className="b-label">
                  {n} {t.cm}
                  {n >= 35 ? <small>{t.b.lengthHint(n)}</small> : null}
                </span>,
                { className: 'b-pill' },
              ),
            )}
          </div>
        )
      case 'stone': {
        const list = stones.map((s, i) => ({ ...s, i })).filter((s) => stoneKind === 'gem' || s.en)
        return (
          <div className="stones" role="radiogroup" aria-labelledby={labelId}>
            {radio(
              'none',
              done.has('stone') && stone === null,
              () => {
                setStone(null)
                notePick('stone', 'none')
                markDone('stone')
              },
              <Icon name="x" />,
              { className: 'swatch none', label: t.none },
            )}
            {list.map((s) =>
              radio(
                String(s.i),
                stone === s.i,
                () => {
                  setStone(s.i)
                  notePick('stone', s.i)
                  markDone('stone')
                },
                null,
                { className: 'swatch', label: stoneLabel(s.i, stoneKind, ar), style: { background: s.c } },
              ),
            )}
          </div>
        )
      }
      case 'text':
        return (
          <div className="b-text">
            <div className="field">
              <label className="sr-only" htmlFor="name-in">
                {p.type === 'engrave' ? t.fEngrave : letters ? t.fLetters : t.fName}
              </label>
              <input
                className="input name-input"
                id="name-in"
                type="text"
                autoComplete="off"
                maxLength={60}
                value={name}
                placeholder={p.sample || t.sampleName}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    finishText()
                  }
                }}
                aria-describedby="name-help name-err"
                aria-invalid={tried && nameMissing ? true : undefined}
              />
              <span className="help" id="name-help">
                {p.textOptional ? `${t.b.optional} · ` : ''}
                {preview ? t.engraveHelp : letters ? t.lettersHelp : t.nameHelp}
              </span>
              <span className="err" id="name-err" role="alert">
                {tried && nameMissing ? t.nameErr : ''}
              </span>
            </div>
            {engraved ? (
              <div className="size-ctl">
                <label className="legend" htmlFor="size-in">
                  {t.fSize}
                </label>
                <div className="size-row">
                  <button className="size-btn" type="button" aria-label={t.smaller} onClick={() => setTsize(Math.max(50, tsize - 10))}>
                    −
                  </button>
                  <input type="range" id="size-in" min={50} max={130} step={5} value={tsize} aria-valuetext={`${tsize}%`} onChange={(e) => setTsize(Number(e.target.value))} />
                  <button className="size-btn" type="button" aria-label={t.bigger} onClick={() => setTsize(Math.min(130, tsize + 10))}>
                    +
                  </button>
                  <output htmlFor="size-in">{tsize}%</output>
                </div>
              </div>
            ) : null}
            <button className="btn btn-outline b-next" type="button" onClick={finishText}>
              {p.textOptional && !name.trim() ? t.b.skip : t.b.next}
              <Icon name="arrow" className="flip" />
            </button>
          </div>
        )
      case 'font':
        return (
          <div className="b-fonts" role="radiogroup" aria-labelledby={labelId}>
            {STYLES.map((s) =>
              radio(
                s,
                done.has('font') && style === s,
                () => {
                  setStyle(s)
                  notePick('font', s)
                  markDone('font')
                },
                <>
                  <span className={`b-font-sample f-${s}`} style={{ fontFamily: fontOf(s) }} dir="auto">
                    {sampleText}
                  </span>
                  <span className="b-label">{t.styles[s]}</span>
                </>,
                { className: 'b-font' },
              ),
            )}
          </div>
        )
      case 'metal':
        return (
          <div className="b-swatches" role="radiogroup" aria-labelledby={labelId}>
            {(['silver', 'gold'] as const).map((m) =>
              radio(
                m,
                done.has('metal') && metal === m,
                () => {
                  setMetal(m)
                  notePick('finish', m)
                  markDone('metal')
                },
                <>
                  <span className={`b-pic pic-${m}`} />
                  <span className="b-label">
                    {t[m]}
                    {m === 'gold' ? extra(p.goldExtra) : null}
                  </span>
                </>,
                { className: 'b-swatch' },
              ),
            )}
          </div>
        )
    }
  }

  // The tag lists every answer in the order asked; each line reopens its question.
  const tagRows = flow.map((f) => ({
    key: f.key,
    label: f.kind === 'q' ? f.q!.name : f.eyebrow,
    value: answerText(f),
    edit: !(f.kind === 'q' && f.q!.choices.length === 1),
  }))
  if (engraved && tsize !== 100) tagRows.push({ key: 'tsize', label: t.lines.size, value: `${tsize}%`, edit: true })

  return (
    <form
      ref={formRef}
      data-product-id={p.id}
      className="opts-form builder"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!complete || soldOut) return
        add(item, { open: true })
      }}
    >
      {preview ? (
        <NamePreview className="engr" shape={preview} text={name} sample={p.sample || t.sampleName} style={style} stone={hasStone ? stone : null} scale={tsize / 100} />
      ) : null}

      {flow.length ? (
        <>
          <div className="trail-row">
            <ol className="trail" aria-label={t.b.progress}>
              {flow.map((f, i) => {
                const state = f.key === current ? 'current' : answered(f) ? 'done' : 'next'
                return (
                  <li key={f.key} data-state={state}>
                    <button
                      type="button"
                      className="link"
                      aria-label={`${t.b.stepOf(i + 1, flow.length)}: ${f.eyebrow}${answered(f) ? ` · ${answerText(f)}` : ''}`}
                      aria-current={state === 'current' ? 'step' : undefined}
                      disabled={state === 'next'}
                      onClick={() => setEditing(f.key)}
                    />
                  </li>
                )
              })}
            </ol>
            <span className="trail-count" aria-hidden="true">
              {complete ? <Icon name="check" /> : `${Math.min(flow.length, flow.length - left + 1)}/${flow.length}`}
            </span>
          </div>

          {/* Once everything is picked the steps fold into the tag below, until one is changed. */}
          <div className="b-steps" hidden={complete && !editing && !settling}>
            {flow.map((f, i) => {
              const state = f.key === current ? 'current' : answered(f) ? 'done' : 'next'
              const labelId = `ask-${f.key}`
              const only = f.kind === 'q' && f.q!.choices.length === 1
              return (
                <section key={f.key} className="b-step" data-step={f.key} data-state={state}>
                  <div className="b-head">
                    <span className="b-no" aria-hidden="true">
                      {state === 'done' ? <Icon name="check" /> : String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="b-titles">
                      <span className="b-eyebrow caps">{f.eyebrow}</span>
                      {state === 'current' ? (
                        <h2 className="b-ask" id={labelId} tabIndex={-1}>
                          {f.ask}
                        </h2>
                      ) : state === 'done' ? (
                        <span className="b-answer" id={labelId}>
                          {answerText(f)}
                        </span>
                      ) : null}
                    </div>
                    {state === 'done' && !only ? (
                      <button type="button" className="b-change" onClick={() => setEditing(f.key)}>
                        {t.b.change}
                        <span className="sr-only"> {f.eyebrow}</span>
                      </button>
                    ) : null}
                  </div>
                  {state === 'current' ? <div className="b-body">{body(f, labelId)}</div> : null}
                </section>
              )
            })}
          </div>
        </>
      ) : null}

      {complete ? (
        <>
          {tagRows.length ? (
            <div className="tag" tabIndex={-1} aria-labelledby="tag-h">
              <span className="tag-hole" aria-hidden="true" />
              <p className="caps tag-eyebrow" id="tag-h">
                {t.b.yours}
              </p>
              <ul className="tag-lines">
                {tagRows.map((row) => (
                  <li key={row.key}>
                    <span>{row.label}</span>
                    <b dir="auto">{row.value}</b>
                    {row.edit ? (
                      <button type="button" className="tag-edit" aria-label={`${t.b.change}: ${row.label}`} onClick={() => setEditing(row.key === 'tsize' ? 'text' : row.key)}>
                        <Icon name="pen" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="tag-price">
                <span data-price="">{fmt(price)}</span>
              </p>
              <p className="tag-line">{t.b.yoursLine}</p>
            </div>
          ) : null}
        </>
      ) : (
        <p className="b-left">
          <Icon name="sparkle" />
          {t.b.left(left)}
        </p>
      )}

      <div className="buy">
        {soldOut ? (
          <>
            <button className="btn btn-primary btn-block" type="button" disabled>
              {t.soldOut}
            </button>
            {p.oneOff ? <p className="help">{t.notify.oneOff}</p> : <NotifyMe key={JSON.stringify(r.answers)} locale={locale} productId={p.id} choices={r.answers} />}
            {askHref ? (
              <a className="btn btn-outline btn-block" href={askHref} target="_blank" rel="noopener">
                <Icon name="whatsapp" />
                <span>{t.askWhatsApp}</span>
              </a>
            ) : null}
          </>
        ) : complete ? (
          <>
            <button className="btn btn-primary btn-block b-add" type="submit">
              <Icon name="bag" />
              <span>
                {t.add} · <span data-price="">{fmt(price)}</span>
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
        ) : null}
      </div>
    </form>
  )
}

/** A short run of chain: round links, or long "paper clip" links. */
function ChainDrawing({ paperclip }: { paperclip: boolean }) {
  const links = paperclip ? 3 : 6
  const w = paperclip ? 34 : 18
  const step = paperclip ? 28 : 14
  return (
    <svg className="b-chain-art" viewBox="0 0 96 28" aria-hidden="true">
      {Array.from({ length: links }, (_, i) => {
        const x = 4 + i * step
        return i % 2 === 0 || paperclip ? (
          <rect key={i} x={x} y={paperclip ? 8 : 7} width={w} height={paperclip ? 12 : 14} rx={paperclip ? 6 : 7} />
        ) : (
          <rect key={i} x={x + 2} y={11} width={w - 4} height={6} rx={3} />
        )
      })}
    </svg>
  )
}

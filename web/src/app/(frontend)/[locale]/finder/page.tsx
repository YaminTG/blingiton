import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { FinderPicks, FinderTrack } from '@/components/finder/FinderTrack'
import { Icon } from '@/components/Icon'
import { ProductCard } from '@/components/ProductCard'
import { Price } from '@/components/store/Money'
import { getSettings } from '@/lib/data'
import { dictionary, type Dictionary } from '@/lib/dictionary'
import {
  answersQuery,
  budgetBands,
  budgetKey,
  FINISHES,
  nextQuestion,
  OCCASIONS,
  parseAnswers,
  QUESTIONS,
  RECIPIENTS,
  recommend,
  STYLES,
  type Answers,
  type Budget,
  type Question,
  type Reason,
} from '@/lib/finder'
import { getFinderCatalog, getProductsByIds } from '@/lib/finderData'
import { isLocale } from '@/lib/locales'
import { absolute, alternates, paths } from '@/lib/urls'
import type { Product } from '@/payload-types'

type Search = Record<string, string | string[] | undefined>
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Search> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const f = dictionary(locale).finder
  // The bare page can rank ("gift ideas"); each set of answers is the same page, so it isn't indexed.
  const answered = Object.keys(await searchParams).length > 0
  return {
    title: { absolute: f.metaTitle },
    description: f.metaDescription,
    alternates: alternates(locale, paths.finder),
    openGraph: { title: f.metaTitle, description: f.metaDescription, url: absolute(paths.finder(locale)) },
    ...(answered ? { robots: { index: false, follow: true } } : {}),
  }
}

type F = Dictionary['finder']

function BudgetLabel({ b, f }: { b: Budget; f: F }) {
  if (b.min === 0 && b.max === null) return <>{f.budgetAny}</>
  if (b.min === 0)
    return (
      <>
        {f.budgetUnder} <Price jod={b.max!} />
      </>
    )
  if (b.max === null)
    return (
      <>
        <Price jod={b.min} /> {f.budgetAnd}
      </>
    )
  return (
    <>
      <Price jod={b.min} /> – <Price jod={b.max} />
    </>
  )
}

/** The choices for one question, each with where it leads. */
function choices(q: Question, a: Answers, f: F, bands: Budget[]): { value: string; label: ReactNode; hint?: string }[] {
  const opt = (list: readonly string[]) => list.map((v) => ({ value: v, label: f.options[q][v], hint: q === 'style' ? f.styleHints[v] : undefined }))
  if (q === 'for') return opt(RECIPIENTS)
  if (q === 'occasion') return opt(OCCASIONS)
  if (q === 'style') return opt(STYLES)
  if (q === 'finish') return opt(FINISHES)
  const all: Budget = { min: 0, max: null }
  return [...bands.filter((b) => b.min || b.max !== null), all].map((b) => ({ value: budgetKey(b), label: <BudgetLabel b={b} f={f} /> }))
}

function answerLabel(q: Question, a: Answers, f: F): ReactNode {
  if (q === 'budget') return a.budget ? <BudgetLabel b={a.budget} f={f} /> : null
  const v = a[q]
  return v ? f.options[q][v] : null
}

function reasonText(r: Reason, a: Answers, f: F): string {
  const who = f.pronoun[a.for ?? 'me']
  if (r === 'style') return f.reasons.style[a.style ?? ''] ?? ''
  if (r === 'name') return f.reasons.name(who)
  if (r === 'letters') return f.reasons.letters(who)
  if (r === 'occasion') return f.reasons.occasion[a.occasion ?? ''] ?? ''
  return f.reasons[r]
}

/** The ways a piece can be made: finish, chain lengths, design choices, stones. */
function variations(p: Product, f: F) {
  const pz = p.personalization
  const out: string[] = []
  if (pz?.goldPlated) out.push(f.variants.gold)
  if ((pz?.chainLengths?.length ?? 0) > 1) out.push(f.variants.chains(pz!.chainLengths!.length))
  for (const o of pz?.options ?? []) if ((o.choices?.length ?? 0) > 1) out.push(f.variants.choices(o.name, o.choices!.length))
  if (pz?.stones && pz.stones !== 'none') out.push(f.variants.stones)
  return out.slice(0, 3)
}

/** /[locale]/finder: the jewelry & gift finder (src/lib/finder.ts). Each answer is a link, so it works before scripts load. */
export default async function FinderPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = dictionary(locale)
  const f = t.finder
  const a = parseAnswers(await searchParams)
  const base = paths.finder(locale)
  const [catalog, settings] = await Promise.all([getFinderCatalog(), getSettings(locale)])
  const bands = budgetBands(catalog.filter((p) => p.buyable).map((p) => p.price))
  const q = nextQuestion(a)

  // --- One question at a time
  if (q) {
    const i = QUESTIONS.indexOf(q)
    const prev = QUESTIONS.slice(0, i).reverse().find((x) => a[x] !== undefined)
    const started = QUESTIONS.some((x) => a[x] !== undefined)
    return (
      <section className="finder">
        {!started ? <FinderTrack step="finder" /> : null}
        <div className="wrap finder-wrap">
          <span className="caps eyebrow">{f.eyebrow}</span>
          <h1 className="finder-title">{f.title}</h1>
          {!started ? <p className="lead finder-intro">{f.intro}</p> : null}
          <div className="finder-progress">
            <ol aria-hidden="true">
              {QUESTIONS.map((x, n) => (
                <li key={x} className={n < i ? 'is-done' : n === i ? 'is-now' : undefined} />
              ))}
            </ol>
            <span>{f.step(i + 1, QUESTIONS.length)}</span>
          </div>
          <h2 className="finder-q">{f.questions[q]}</h2>
          {f.hints[q] ? <p className="finder-hint">{f.hints[q]}</p> : null}
          <ul className={`finder-options finder-options--${q}`}>
            {choices(q, a, f, bands).map((c) => {
              const chosen = q === 'budget' ? (a.budget ? budgetKey(a.budget) : undefined) : a[q]
              return (
                <li key={c.value}>
                  <Link className="finder-option" href={`${base}${answersQuery(a, { set: { [q]: c.value } })}`} aria-current={chosen === c.value ? 'true' : undefined}>
                    <span className="finder-option__label">{c.label}</span>
                    {c.hint ? <span className="finder-option__hint">{c.hint}</span> : null}
                    <Icon name="arrow" className="flip finder-option__go" />
                  </Link>
                </li>
              )
            })}
          </ul>
          <nav className="finder-nav">
            {prev ? (
              <Link className="finder-back" href={`${base}${answersQuery(a, { drop: prev })}`}>
                <Icon name="arrow" className="finder-back__ico" />
                {f.back}
              </Link>
            ) : null}
            {started ? (
              <Link className="finder-restart" href={base}>
                {f.startOver}
              </Link>
            ) : null}
          </nav>
        </div>
      </section>
    )
  }

  // --- The picks
  const result = recommend(catalog, a)
  const products = await getProductsByIds(
    locale,
    result.picks.map((p) => p.product.id),
  )
  const pickOf = new Map(result.picks.map((p) => [p.product.id, p]))
  const wa = settings.whatsapp ? `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(t.customMessage)}` : null
  const notes = [result.fewExact && f.notes.fewExact, result.stretched && f.notes.stretched, result.fewGold && f.notes.fewGold].filter(Boolean) as string[]

  return (
    <section className="finder finder--results">
      <FinderTrack step="finder-done" />
      <div className="wrap">
        <div className="finder-head">
          <span className="caps eyebrow">{f.resultsEyebrow}</span>
          <h1 className="finder-title">{f.resultsTitle}</h1>
          {products.length ? <p className="lead">{f.resultsLead(products.length)}</p> : null}
        </div>

        <div className="finder-answers" aria-label={f.yourAnswers}>
          {QUESTIONS.map((x) => (
            <Link key={x} className="chip finder-answer" href={`${base}${answersQuery(a, { drop: x })}`} title={f.change(f.questions[x])}>
              {answerLabel(x, a, f)}
              <Icon name="pen" className="finder-answer__ico" />
            </Link>
          ))}
          <Link className="finder-restart" href={base}>
            {f.startOver}
          </Link>
        </div>

        {notes.length ? (
          <ul className="finder-notes">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}

        {products.length ? (
          <FinderPicks>
            <div className="grid finder-grid">
              {products.map((p) => {
                const pick = pickOf.get(p.id)!
                const more = variations(p, f)
                return (
                  <div key={p.id} className="finder-pick" data-finder-pick={p.id}>
                    <ProductCard product={p} locale={locale} t={t} />
                    <div className="finder-why">
                      <h2 className="caps">{f.why}</h2>
                      <ul>
                        {pick.reasons.map((r) => (
                          <li key={r} className={r === 'over' ? 'is-over' : undefined}>
                            <Icon name="check" />
                            {reasonText(r, a, f)}
                          </li>
                        ))}
                      </ul>
                      {more.length ? <p className="finder-variants">{more.join(' · ')}</p> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </FinderPicks>
        ) : (
          <p className="finder-empty">{f.empty}</p>
        )}

        <div className="finder-custom">
          <div>
            <h2 className="finder-custom__h">{f.customH}</h2>
            <p>{f.customLead}</p>
          </div>
          {wa ? (
            <a className="btn btn-outline" href={wa} target="_blank" rel="noopener">
              <Icon name="whatsapp" />
              <span>{f.customCta}</span>
            </a>
          ) : null}
        </div>
      </div>
    </section>
  )
}

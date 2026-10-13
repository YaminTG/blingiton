'use client'

import Image from 'next/image'
import { useRef, useState, type FormEvent } from 'react'

import { dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/locales'
import type { Reviewable } from '@/lib/reviews'

// Same limits as src/lib/reviewCheck.ts (not imported: it uses Node's crypto).
const MAX_BODY = 2000
const MAX_AUTHOR = 60

type Entry = { rating: number; body: string }

export function ReviewForm({ locale, order, token }: { locale: Locale; order: Reviewable; token: string }) {
  const t = dictionary(locale).rv
  const open = order.items.filter((i) => !i.reviewed)
  const [entries, setEntries] = useState<Record<number, Entry>>({})
  const [author, setAuthor] = useState(order.firstName)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const errRef = useRef<HTMLDivElement>(null)

  const set = (id: number, patch: Partial<Entry>) => setEntries((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { rating: 0, body: '' }), ...patch } }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const reviews = open.filter((i) => entries[i.id]?.rating).map((i) => ({ product: i.id, rating: entries[i.id].rating, body: entries[i.id].body }))
    const problem = !reviews.length ? t.needOne : !author.trim() ? t.needName : null
    if (problem) {
      setError(problem)
      requestAnimationFrame(() => errRef.current?.focus())
      return
    }
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/submit-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.orderId, token, locale, author, reviews }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setSent(true)
      window.scrollTo({ top: 0 })
    } catch {
      setError(t.failed)
      requestAnimationFrame(() => errRef.current?.focus())
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="co-empty empty" role="status">
        <Image src="/logo.png" alt="" width={96} height={96} />
        <h1>{t.thanksTitle}</h1>
        <p>{t.thanksBody}</p>
      </div>
    )
  }

  return (
    <form className="rv" noValidate onSubmit={submit}>
      <h1>{t.title}</h1>
      <p className="lead">{t.lead(`#${order.number}`)}</p>
      {error ? (
        <div className="err-sum" ref={errRef} tabIndex={-1} role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {order.items.map((item) => {
        const entry = entries[item.id] ?? { rating: 0, body: '' }
        return (
          <fieldset key={item.id} className="block rv-item">
            <legend className="sr-only">{item.name}</legend>
            <div className="rv-head">
              {item.image ? <Image src={item.image} alt="" width={72} height={72} sizes="72px" /> : <span className="rv-blank" />}
              <h2>{item.name}</h2>
            </div>
            {item.reviewed ? (
              <p className="help">{t.done}</p>
            ) : (
              <>
                <div className="rate" role="radiogroup" aria-label={`${t.stars}: ${item.name}`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className={n <= entry.rating ? 'on' : undefined}>
                      <input className="sr-only" type="radio" name={`rate-${item.id}`} value={n} checked={entry.rating === n} onChange={() => set(item.id, { rating: n })} />
                      <span aria-hidden="true">★</span>
                      <span className="sr-only">{t.star(n)}</span>
                    </label>
                  ))}
                </div>
                <div className="field">
                  <label htmlFor={`body-${item.id}`}>{t.body}</label>
                  <textarea
                    className="textarea"
                    id={`body-${item.id}`}
                    dir="auto"
                    maxLength={MAX_BODY}
                    placeholder={t.bodyPh}
                    value={entry.body}
                    onChange={(e) => set(item.id, { body: e.target.value })}
                  />
                </div>
              </>
            )}
          </fieldset>
        )
      })}

      <div className="block">
        <div className="field">
          <label htmlFor="rv-author">{t.author}</label>
          <input className="input" id="rv-author" autoComplete="given-name" maxLength={MAX_AUTHOR} value={author} onChange={(e) => setAuthor(e.target.value)} aria-describedby="rv-author-help" />
          <span className="help" id="rv-author-help">
            {t.authorHelp}
          </span>
        </div>
        <button className="btn btn-primary" type="submit" disabled={sending}>
          {sending ? t.sending : t.submit}
        </button>
      </div>
    </form>
  )
}

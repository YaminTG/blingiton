'use client'

import { useRef, useState } from 'react'

import { Icon } from '@/components/Icon'
import type { Answers } from '@/lib/choices'
import { dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/locales'

type Status = 'idle' | 'sending' | 'saved' | 'already' | 'available' | 'error'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * "Email me when it's back", on a sold-out piece or combination. Sends the piece and the shopper's
 * answers; the server works out which stock they're waiting for (src/lib/restock.ts). Render it with
 * a `key` per combination, so picking another one starts a fresh request.
 */
export function NotifyMe({ locale, productId, choices }: { locale: Locale; productId: number; choices: Answers }) {
  const t = dictionary(locale).notify
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [bad, setBad] = useState(false)
  const trap = useRef<HTMLInputElement>(null)

  async function send() {
    if (status === 'sending') return
    if (!EMAIL.test(email.trim())) {
      setBad(true)
      return
    }
    setBad(false)
    setStatus('sending')
    try {
      const website = trap.current?.value ?? ''
      const res = await fetch('/restock-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: productId, email: email.trim(), choices, locale, website }),
      })
      const result = ((await res.json().catch(() => ({}))) as { status?: string }).status
      setStatus(result === 'saved' || result === 'already' || result === 'available' ? result : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'saved' || status === 'already' || status === 'available') {
    return (
      <p className="notify-done" role="status">
        <Icon name="check" />
        {t[status]}
      </p>
    )
  }

  // Not a <form>: it sits inside the product builder's form, and forms can't nest.
  return (
    <div className="notify" role="group" aria-labelledby="notify-title">
      <p className="notify-title" id="notify-title">
        {t.title}
      </p>
      <p className="help">{t.lead}</p>
      <div className="notify-row">
        <label className="sr-only" htmlFor="notify-email">
          {t.label}
        </label>
        <input
          id="notify-email"
          className="input"
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          placeholder={t.placeholder}
          value={email}
          aria-invalid={bad || undefined}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends this, not the product form around it.
            if (e.key === 'Enter') {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button className="btn btn-primary" type="button" disabled={status === 'sending'} onClick={() => void send()}>
          {status === 'sending' ? t.sending : t.button}
        </button>
      </div>
      {/* Left empty by people; bots fill it in. */}
      <input ref={trap} className="notify-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {status === 'error' || bad ? (
        <p className="notify-error" role="alert">
          {t.error}
        </p>
      ) : null}
      <p className="help notify-privacy">{t.privacy}</p>
    </div>
  )
}

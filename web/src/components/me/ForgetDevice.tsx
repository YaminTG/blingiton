'use client'

import { useState } from 'react'

import type { TrackingState } from '@/lib/customers'
import { dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/locales'

/** This device's status on /your-data, with the button that withdraws and erases (/activity/forget). */
export function ForgetDevice({ locale, state }: { locale: Locale; state: TrackingState }) {
  const t = dictionary(locale).me
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')

  async function stop() {
    setPhase('busy')
    try {
      const res = await fetch('/activity/forget', { method: 'POST' })
      setPhase(res.ok ? 'done' : 'failed')
    } catch {
      setPhase('failed')
    }
  }

  if (phase === 'done') return <p className="me-status" role="status">{t.stopped}</p>
  return (
    <div className="me-status">
      <p>{t[state]}</p>
      {state !== 'off' ? (
        <button className="btn btn-primary" type="button" onClick={stop} disabled={phase === 'busy'} aria-busy={phase === 'busy' || undefined}>
          {phase === 'busy' ? t.stopping : t.stop}
        </button>
      ) : null}
      {phase === 'failed' ? <p role="alert">{t.failed}</p> : null}
    </div>
  )
}

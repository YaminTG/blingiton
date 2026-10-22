'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/locales'
import { paths } from '@/lib/urls'

type Checkout = { checkoutId: string; integrity: string | null; script: string }

declare global {
  interface Window {
    wpwlOptions?: Record<string, unknown>
    wpwl?: { unload?: () => void }
  }
}

/**
 * HyperPay's card form (COPYandPAY widget). Asks /payment/start for a checkout, then loads
 * HyperPay's script, which turns the `paymentWidgets` form into the card fields. The card details go
 * from the browser to HyperPay; after 3-D Secure, HyperPay sends the whole page (`_top`) back to
 * this order's /pay address with the checkout id, and that page asks HyperPay how it went.
 */
export function PayCard({ locale, order, token }: { locale: Locale; order: number; token: string }) {
  const t = dictionary(locale).pay
  const router = useRouter()
  const [checkout, setCheckout] = useState<Checkout | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const started = useRef(false)

  useEffect(() => {
    // Once per page: each call opens a new checkout at HyperPay.
    if (started.current) return
    started.current = true
    fetch('/payment/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ o: order, t: token }) })
      .then((r) => r.json())
      .then((r: ({ kind: 'form' } & Checkout) | { kind: 'paid' | 'closed' }) => {
        // Paid or closed meanwhile (another tab): the page shows which.
        if (r.kind !== 'form') return router.refresh()
        setCheckout(r)
      })
      .catch(() => setState('error'))
  }, [order, token, router])

  useEffect(() => {
    if (!checkout) return
    window.wpwlOptions = {
      paymentTarget: '_top',
      locale: locale === 'ar' ? 'ar' : 'en',
      style: 'card',
      brandDetection: true,
      onReady: () => setState('ready'),
    }
    const script = document.createElement('script')
    script.src = checkout.script
    if (checkout.integrity) script.integrity = checkout.integrity
    script.crossOrigin = 'anonymous'
    script.async = true
    script.onerror = () => setState('error')
    document.body.appendChild(script)
    return () => {
      // Leaving the page inside the site: HyperPay's way to take the widget down.
      window.wpwl?.unload?.()
      script.remove()
    }
  }, [checkout, locale])

  return (
    <div className="pay-card" aria-busy={state === 'loading' || undefined}>
      {state === 'loading' ? <p className="help">{t.loading}</p> : null}
      {state === 'error' ? (
        <p className="err" role="alert">
          {t.loadErr}
        </p>
      ) : null}
      {checkout ? <form action={`${window.location.origin}${paths.pay(locale, order, token)}`} className="paymentWidgets" data-brands="VISA MASTER" /> : null}
    </div>
  )
}

/** While HyperPay is still confirming a payment: looks again every 15 seconds, for two minutes. */
export function PayChecking({ locale }: { locale: Locale }) {
  const t = dictionary(locale).pay
  const router = useRouter()
  const [tries, setTries] = useState(0)
  const slow = tries >= 8

  useEffect(() => {
    if (slow) return
    const timer = setTimeout(() => {
      setTries((n) => n + 1)
      router.refresh()
    }, 15_000)
    return () => clearTimeout(timer)
  }, [tries, slow, router])

  return (
    <p className="pay-checking" role="status">
      {slow ? t.slow : t.checking}
    </p>
  )
}

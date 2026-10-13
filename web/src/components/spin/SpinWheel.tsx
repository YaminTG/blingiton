'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'

import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/locales'
import type { Prize } from '@/lib/spinPrizes'

type Props = { locale: Locale; t: Dictionary['spin']; prizes: Prize[]; shopHref: string }
type Win = { id: string; at: number }

// One spin per phone: the win is kept here and shown again on reload. `?reset` clears it (for testing).
const STORE = 'bl-spin-v1'
const MUTE = 'bl-spin-mute'
const TURNS = 6
const DURATION = 5200

// Slice fills, in turn: glitter, white, deep pink, blush. Text colour to match.
const FILLS = ['url(#sp-glitter)', '#FFFFFF', '#C8336F', '#F8D3DA']
const INKS = ['#FFFFFF', '#C8336F', '#FFFFFF', '#4E0F2A']
// Background twinkles: x %, y %, size px.
const SPARKLES: [number, number, number][] = [
  [5, 14, 22], [88, 8, 16], [12, 46, 14], [93, 38, 24], [3, 72, 18],
  [90, 66, 14], [20, 90, 12], [80, 88, 20], [30, 4, 12], [68, 24, 10],
]

const rad = (deg: number) => (deg * Math.PI) / 180
// Angle clockwise from 12 o'clock → SVG point.
const at = (r: number, deg: number) => `${(r * Math.sin(rad(deg))).toFixed(3)} ${(-r * Math.cos(rad(deg))).toFixed(3)}`
const sizeFor = (text: string, sizes: [number, number, number]) => (text.length <= 4 ? sizes[0] : text.length <= 6 ? sizes[1] : sizes[2])

function pick(prizes: Prize[]) {
  let r = Math.random() * prizes.reduce((sum, p) => sum + p.weight, 0)
  for (let i = 0; i < prizes.length; i++) if ((r -= prizes[i].weight) < 0) return i
  return prizes.length - 1
}


// localStorage as an external store. The in-memory copy covers browsers that block it (some
// private modes): the win then lasts until reload.
const memory: Record<string, string | null> = {}
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
const read = (key: string) => {
  try {
    return localStorage.getItem(key) ?? memory[key] ?? null
  } catch {
    return memory[key] ?? null
  }
}
const write = (key: string, value: string | null) => {
  memory[key] = value
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {}
  listeners.forEach((fn) => fn())
}
const resetAsked = () => new URLSearchParams(window.location.search).has('reset')
const readWin = () => (resetAsked() ? null : read(STORE))
const readMuted = () => read(MUTE) === '1'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** A burst of pink, white and silver confetti over the whole screen. */
function confetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.scale(dpr, dpr)
  const colors = ['#D23E78', '#C8336F', '#F8D3DA', '#FFFFFF', '#C9C8D0', '#F3B9C5', '#E9E9EE']
  const bits = Array.from({ length: 170 }, (_, i) => {
    const fromSide = i % 3 === 0 ? (i % 2 ? -1 : 1) : 0
    return {
      x: fromSide ? (fromSide < 0 ? 0 : w) : w / 2,
      y: fromSide ? h * 0.75 : h * 0.42,
      vx: fromSide ? -fromSide * (4 + Math.random() * 9) : (Math.random() - 0.5) * 16,
      vy: -(fromSide ? 10 + Math.random() * 10 : 5 + Math.random() * 12),
      s: 5 + Math.random() * 7,
      r: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      c: colors[i % colors.length],
      star: Math.random() < 0.25,
    }
  })
  const start = performance.now()
  let id = 0
  const frame = (now: number) => {
    const t = now - start
    ctx.clearRect(0, 0, w, h)
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 2000) / 1400)
    for (const b of bits) {
      b.vy += 0.3
      b.vx *= 0.985
      b.x += b.vx
      b.y += b.vy
      b.r += b.vr
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(b.r)
      ctx.fillStyle = b.c
      if (b.star) {
        // Four-point sparkle, like the glints in the logo.
        const s = b.s
        ctx.beginPath()
        ctx.moveTo(0, -s)
        ctx.quadraticCurveTo(0, 0, s, 0)
        ctx.quadraticCurveTo(0, 0, 0, s)
        ctx.quadraticCurveTo(0, 0, -s, 0)
        ctx.quadraticCurveTo(0, 0, 0, -s)
        ctx.fill()
      } else {
        ctx.scale(1, Math.cos(b.r * 3))
        ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2)
      }
      ctx.restore()
    }
    if (t < 3400) id = requestAnimationFrame(frame)
    else ctx.clearRect(0, 0, w, h)
  }
  id = requestAnimationFrame(frame)
  return () => {
    cancelAnimationFrame(id)
    ctx.clearRect(0, 0, w, h)
  }
}

export function SpinWheel({ locale, t, prizes, shopHref }: Props) {
  const n = prizes.length
  const slice = 360 / n
  const [spinning, setSpinning] = useState(false)
  const [extra, setExtra] = useState(false)
  const [justWon, setJustWon] = useState(false)
  // null until the visitor opens or closes the card, so a saved win shows its card on arrival.
  const [open, setOpen] = useState<boolean | null>(null)
  const savedWin = useSyncExternalStore(subscribe, readWin, () => null)
  const muted = useSyncExternalStore(subscribe, readMuted, () => false)
  const win = useMemo(() => {
    try {
      const saved = JSON.parse(savedWin ?? 'null') as Win | null
      return saved && prizes.some((p) => p.id === saved.id) ? saved : null
    } catch {
      return null
    }
  }, [savedWin, prizes])
  const already = Boolean(win) && !justWon
  const state = spinning ? 'spinning' : win || extra ? 'done' : 'idle'
  const showCard = open ?? Boolean(win)

  const rotor = useRef<HTMLDivElement>(null)
  const pointer = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const angle = useRef(-slice / 2)
  const frame = useRef(0)
  const stopConfetti = useRef<() => void>(() => {})
  const audio = useRef<AudioContext | null>(null)

  const setAngle = (deg: number) => {
    angle.current = deg
    if (rotor.current) rotor.current.style.transform = `rotate(${deg}deg)`
  }

  // ?reset clears this phone's win, then drops out of the address so it isn't bookmarked.
  useEffect(() => {
    if (!resetAsked()) return
    write(STORE, null)
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  // Coming back to the page: point the wheel at the prize already won.
  useEffect(() => {
    if (!already || !win) return
    const i = prizes.findIndex((p) => p.id === win.id)
    angle.current = -(i * slice + slice / 2)
    if (rotor.current) rotor.current.style.transform = `rotate(${angle.current}deg)`
  }, [already, win, prizes, slice])

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      stopConfetti.current()
      void audio.current?.close()
    },
    [],
  )

  useEffect(() => {
    if (showCard) card.current?.querySelector<HTMLElement>('.sp-actions .btn')?.focus()
  }, [showCard])

  // Sound: made on the fly with Web Audio, so there are no files to load. The context has to be
  // created inside the tap (iOS), which is why it's made lazily here.
  const tone = useCallback(
    (freq: number, start: number, length: number, volume = 0.12, type: OscillatorType = 'triangle') => {
      const ctx = audio.current
      if (!ctx || muted) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const when = ctx.currentTime + start
      osc.type = type
      osc.frequency.setValueAtTime(freq, when)
      gain.gain.setValueAtTime(volume, when)
      gain.gain.exponentialRampToValueAtTime(0.0001, when + length)
      osc.connect(gain).connect(ctx.destination)
      osc.start(when)
      osc.stop(when + length + 0.02)
    },
    [muted],
  )

  const unlockAudio = () => {
    if (!audio.current) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctx) audio.current = new Ctx()
    }
    void audio.current?.resume()
  }

  const spin = () => {
    if (spinning) return
    if (win && !extra) {
      setOpen(true)
      return
    }
    unlockAudio()
    setOpen(false)
    setExtra(false)
    setSpinning(true)

    const index = pick(prizes)
    const prize = prizes[index]
    // Land somewhere inside the slice, not always dead centre, and never on a divider.
    const jitter = (Math.random() - 0.5) * (slice - 8)
    const target = -(index * slice + slice / 2) + jitter
    const from = angle.current
    const to = from + TURNS * 360 + ((((target - from) % 360) + 360) % 360)
    const duration = reducedMotion() ? 1200 : DURATION
    const start = performance.now()
    let lastSlice = Math.floor(from / slice)

    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 4)
      const deg = from + (to - from) * eased
      setAngle(deg)

      // A click and a flick of the pointer each time a peg passes it.
      const current = Math.floor(deg / slice)
      if (current !== lastSlice) {
        lastSlice = current
        tone(1500 + Math.random() * 300, 0, 0.035, 0.08, 'square')
        pointer.current?.animate([{ transform: 'rotate(-22deg)' }, { transform: 'rotate(0deg)' }], { duration: 140, easing: 'ease-out' })
      }

      if (p < 1) {
        frame.current = requestAnimationFrame(step)
        return
      }
      setAngle(((to % 360) + 360) % 360)
      setSpinning(false)
      if (prize.again) {
        setExtra(true)
        ;[660, 880].forEach((f, i) => tone(f, i * 0.12, 0.25))
      } else {
        const result: Win = { id: prize.id, at: Date.now() }
        setJustWon(true)
        write(STORE, JSON.stringify(result))
        ;[784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.1, 0.45, 0.14))
        navigator.vibrate?.([60, 40, 120])
        if (canvas.current && !reducedMotion()) {
          stopConfetti.current()
          stopConfetti.current = confetti(canvas.current)
        }
      }
      setOpen(true)
    }
    frame.current = requestAnimationFrame(step)
  }

  const toggleSound = () => write(MUTE, muted ? '0' : '1')

  const won = win ? prizes.find((p) => p.id === win.id) : undefined
  const showing = extra ? prizes.find((p) => p.again) : won
  const time = win
    ? new Date(win.at).toLocaleString(locale === 'ar' ? 'ar-JO-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : ''
  const label = state === 'spinning' ? t.spinning : win && !extra ? t.seePrize : extra ? t.again : t.spin

  return (
    <section className="sp" data-state={state}>
      <span className="sp-sparkles" aria-hidden="true">
        {SPARKLES.map(([x, y, size], i) => (
          <i key={i} style={{ insetInlineStart: `${x}%`, top: `${y}%`, fontSize: size, animationDelay: `${i * -0.37}s` } as CSSProperties}>
            ✦
          </i>
        ))}
      </span>

      <button type="button" className="sp-sound" onClick={toggleSound} aria-label={muted ? t.soundOn : t.soundOff} aria-pressed={!muted}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
          {muted ? (
            <path d="M16.5 9.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          )}
        </svg>
      </button>

      <div className="wrap">
        <h1 className="glitter-text">{t.heading}</h1>
        <p className="sp-lead">{t.lead}</p>

        <div className="sp-stage">
          <div className="sp-pointer" ref={pointer} aria-hidden="true">
            <svg viewBox="0 0 40 52">
              <defs>
                <linearGradient id="sp-pin" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#7C7B86" />
                  <stop offset=".35" stopColor="#F4F4F7" />
                  <stop offset=".6" stopColor="#A9A8B1" />
                  <stop offset="1" stopColor="#5E5D68" />
                </linearGradient>
              </defs>
              <path d="M20 50 L4 18 A16 16 0 1 1 36 18 Z" fill="url(#sp-pin)" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="20" cy="16" r="7" fill="#D23E78" stroke="#fff" strokeWidth="2" />
              <circle cx="17.5" cy="13.5" r="2" fill="#fff" opacity=".85" />
            </svg>
          </div>

          <div className="sp-rotor" ref={rotor} style={{ transform: `rotate(${-slice / 2}deg)` }}>
            <svg viewBox="-100 -100 200 200" role="img" aria-label={t.wheel}>
              <defs>
                <pattern id="sp-glitter" patternUnits="userSpaceOnUse" width="88" height="21">
                  <rect width="88" height="21" fill="#D23E78" />
                  <image href="/glitter.webp" width="88" height="21" preserveAspectRatio="none" />
                </pattern>
                <linearGradient id="sp-rim" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#E9E9EE" />
                  <stop offset=".34" stopColor="#A9A8B1" />
                  <stop offset=".52" stopColor="#5E5D68" />
                  <stop offset=".68" stopColor="#BEBDC6" />
                  <stop offset="1" stopColor="#7C7B86" />
                </linearGradient>
              </defs>

              {prizes.map((p, i) => {
                const words = p[locale]
                const mid = i * slice + slice / 2
                return (
                  <g key={p.id}>
                    <path d={`M0 0 L${at(92, i * slice)} A92 92 0 0 1 ${at(92, (i + 1) * slice)} Z`} fill={FILLS[i % 4]} />
                    <g transform={`rotate(${mid})`} fill={INKS[i % 4]} textAnchor="middle" fontWeight="800" className={i % 4 === 0 ? 'sp-on-glitter' : undefined}>
                      <text y="-63" fontSize={sizeFor(words.big, [17, 12.5, 9.5])}>
                        {words.big}
                      </text>
                      <text y="-49" fontSize={sizeFor(words.small, [8, 7, 5.8])} letterSpacing=".4">
                        {words.small}
                      </text>
                    </g>
                  </g>
                )
              })}
              {prizes.map((p, i) => (
                <line key={p.id} x1="0" y1="0" x2={(92 * Math.sin(rad(i * slice))).toFixed(3)} y2={(-92 * Math.cos(rad(i * slice))).toFixed(3)} stroke="#fff" strokeWidth="1.4" />
              ))}
              <circle r="96" fill="none" stroke="url(#sp-rim)" strokeWidth="8.5" />
              <circle r="91.6" fill="none" stroke="#fff" strokeWidth="1.2" />
              {[...Array(n * 2)].map((_, i) => {
                const deg = (i * 360) / (n * 2)
                return <circle key={i} className={`sp-bulb${i % 2 ? ' b2' : ''}`} cx={96 * Math.sin(rad(deg))} cy={-96 * Math.cos(rad(deg))} r="2.3" />
              })}
            </svg>
          </div>

          <button type="button" className="sp-hub" onClick={spin} disabled={state === 'spinning'} aria-label={label}>
            <Image src="/logo.png" alt="Blingiton" width={180} height={180} priority />
          </button>
        </div>

        <button type="button" className="btn btn-primary sp-btn" onClick={spin} disabled={state === 'spinning'}>
          {label}
        </button>
      </div>

      <canvas className="sp-confetti" ref={canvas} aria-hidden="true" />

      <p className="sr-only" aria-live="polite">
        {state === 'done' && showing ? `${extra ? t.lucky : t.youWon}: ${showing[locale].title}` : ''}
      </p>

      {showCard && showing ? (
        <div className="sp-result" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sp-card" ref={card} role="dialog" aria-modal="true" aria-labelledby="sp-prize">
            <button type="button" className="sp-close" onClick={() => setOpen(false)} aria-label={t.close}>
              ×
            </button>
            <Image className="sp-card-logo" src="/logo.png" alt="Blingiton" width={96} height={96} />
            {already ? <p className="sp-note">{t.already}</p> : null}
            <p className="sp-eyebrow">{extra ? t.lucky : t.youWon}</p>
            <h2 id="sp-prize" className="sp-prize glitter-text">
              {showing[locale].title}
            </h2>
            {extra ? (
              <div className="sp-actions">
                <button type="button" className="btn btn-primary btn-block" onClick={spin}>
                  {t.again}
                </button>
              </div>
            ) : win ? (
              <>
                <p className="sp-claim">{t.claim}</p>
                <p className="sp-time">{time}</p>
                <div className="sp-actions">
                  <Link className="btn btn-primary btn-block" href={shopHref}>
                    {t.shop}
                  </Link>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

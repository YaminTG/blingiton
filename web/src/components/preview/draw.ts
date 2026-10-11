/**
 * The live name and engraving previews, drawn on canvas. Ported from the clickable preview
 * (preview/assets/site.js). The finish follows `document.body.dataset.metal` and redraws on the
 * `bl:metal` event; fonts come from the CSS variables next/font sets on <html>.
 */
import { stones } from '@/lib/stones'

export type LetterStyle = 'script' | 'classic' | 'modern' | 'kufi'
export type Metal = 'silver' | 'gold'
export type EngraveShape = 'band' | 'bandcut' | 'square' | 'disc' | 'enamel' | 'cut'

const METALS = {
  silver: { stops: ['#FFFFFF', '#E4E3E8', '#A2A1AA', '#F1F1F4', '#C3C2CA'], edge: '#6E6D77', link: '#9D9CA5', shine: '#FAFAFC', ring: '#8C8B94' },
  gold: { stops: ['#FFF8DF', '#F2D27F', '#B4862F', '#F7E2A4', '#D1A24A'], edge: '#8B6420', link: '#C49A45', shine: '#FFF3CC', ring: '#B38631' },
}
type MetalPalette = (typeof METALS)['silver']

// [font-style, weight, CSS variable holding the family, fallback family]
type FontSpec = [string, number, string, string]
const FONTS: Record<LetterStyle, { en: FontSpec; ar: FontSpec }> = {
  script: { en: ['', 400, '--font-script-en', 'cursive'], ar: ['', 700, '--font-script-ar', 'serif'] },
  classic: { en: ['italic', 600, '--font-classic-en', 'serif'], ar: ['', 700, '--font-classic-ar', 'serif'] },
  modern: { en: ['', 800, '--font-latin', 'sans-serif'], ar: ['', 700, '--font-modern-ar', 'sans-serif'] },
  kufi: { en: ['', 300, '--font-kufi', 'sans-serif'], ar: ['', 300, '--font-kufi', 'sans-serif'] },
}
const family = (f: FontSpec) => getComputedStyle(document.documentElement).getPropertyValue(f[2]).trim() || f[3]
const fontStr = (f: FontSpec, px: number) => `${f[0]} ${f[1]} ${px}px ${family(f)}`.trim()
const fontFor = (style: string | undefined, ar: boolean) => FONTS[(style as LetterStyle) in FONTS ? (style as LetterStyle) : 'script'][ar ? 'ar' : 'en']

// Harakat sit above and below the letters; sizes and spacing are worked out from the letters alone
// so adding them doesn't shrink the name. They're still drawn.
const bare = (t: string) => t.replace(/[ً-ٰٟۖ-ۭ]/g, '')
const isArabic = (t: string) => /[؀-ۿ]/.test(t)
const currentMetal = (): MetalPalette => METALS[document.body.dataset.metal === 'gold' ? 'gold' : 'silver']

type Pt = [number, number]
type Placed = { x: number; y: number; px: number; mt: TextMetrics }

export type PreviewApi = {
  set(o: { text?: string; style?: LetterStyle; sample?: string; scale?: number; stone?: number | null }): void
  destroy(): void
}

/** Shared setup: the canvas, the hidden text, resize/metal/font listeners. */
function base(el: HTMLElement, draw: () => void) {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  el.prepend(canvas)
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const nameEl = el.querySelector('.name') as HTMLElement
  let alive = true
  const safeDraw = () => {
    if (alive) draw()
  }
  const ro = new ResizeObserver(safeDraw)
  ro.observe(el)
  document.addEventListener('bl:metal', safeDraw)
  document.fonts?.ready.then(safeDraw)

  const redraw = () => {
    safeDraw()
    const f = fontFor(nameEl.dataset.style, nameEl.dataset.script === 'ar')
    document.fonts?.load(fontStr(f, 64), nameEl.textContent ?? '').then(safeDraw, () => {})
  }
  const setText = (text: string | undefined, sample: string | undefined) => {
    if (sample !== undefined) nameEl.dataset.sample = sample
    if (text !== undefined || sample !== undefined) {
      const v = (text !== undefined ? text : (nameEl.textContent ?? '')).trim() || nameEl.dataset.sample || ''
      nameEl.textContent = v
      nameEl.dataset.script = isArabic(v) ? 'ar' : 'en'
    }
  }
  const destroy = () => {
    alive = false
    ro.disconnect()
    document.removeEventListener('bl:metal', safeDraw)
    canvas.remove()
  }
  const size = () => {
    const W = el.clientWidth,
      H = el.clientHeight
    if (!W || !H) return null
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    return { W, H }
  }
  return { ctx, nameEl, redraw, setText, destroy, size }
}

/* ---------- name necklace: a nameplate on a cable chain ---------- */
// opts.metal forces a finish (used by the order unboxing); otherwise the site-wide choice is used.
export function plate(el: HTMLElement, opts: { metal?: Metal } = {}): PreviewApi {
  let stoneIdx: number | null = null
  const b = base(el, () => draw())
  const { ctx, nameEl } = b

  // points along a quadratic curve, evenly spaced by arc length, with their direction
  function curvePoints(p0: Pt, p1: Pt, p2: Pt, gap: number) {
    const N = 240,
      pts: [number, number, number][] = []
    let prev = p0,
      len = 0,
      next = 0
    for (let i = 0; i <= N; i++) {
      const t = i / N,
        u = 1 - t
      const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
      const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
      len += Math.hypot(x - prev[0], y - prev[1])
      if (len >= next) {
        const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0])
        const dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
        pts.push([x, y, Math.atan2(dy, dx)])
        next += gap
      }
      prev = [x, y]
    }
    return pts
  }

  // cable chain: alternating flat and edge-on oval links
  function drawChain(p0: Pt, p1: Pt, p2: Pt, m: MetalPalette) {
    const pts = curvePoints(p0, p1, p2, 5.2)
    ctx.save()
    ctx.shadowColor = 'rgba(78,15,42,.25)'
    ctx.shadowBlur = 2
    ctx.shadowOffsetY = 1
    pts.forEach(([x, y, a], i) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(a)
      ctx.beginPath()
      ctx.ellipse(0, 0, 3.4, i % 2 ? 1.05 : 2.2, 0, 0, Math.PI * 2)
      ctx.lineWidth = 1.35
      ctx.strokeStyle = m.link
      ctx.stroke()
      ctx.restore()
    })
    ctx.restore()
    pts.forEach(([x, y, a], i) => {
      if (i % 2) return
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(a)
      ctx.beginPath()
      ctx.ellipse(0, 0, 3.4, 2.2, 0, Math.PI * 1.1, Math.PI * 1.6)
      ctx.lineWidth = 0.8
      ctx.strokeStyle = m.shine
      ctx.stroke()
      ctx.restore()
    })
  }

  function ring(x: number, y: number, m: MetalPalette) {
    ctx.beginPath()
    ctx.arc(x, y, 4.2, 0, Math.PI * 2)
    ctx.lineWidth = 2
    ctx.strokeStyle = m.ring
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, 4.2, Math.PI * 1.05, Math.PI * 1.55)
    ctx.lineWidth = 0.9
    ctx.strokeStyle = m.shine
    ctx.stroke()
  }

  // draw the name invisibly and scan it to find where the first and last letters really are,
  // so the rings attach to metal instead of to the edge of the text box
  const probe = document.createElement('canvas')
  const pctx = probe.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  function findEnds(text: string, font: string, dir: CanvasDirection, cx: number, baseY: number, top: number, h: number, left: number, right: number, W: number, H: number) {
    probe.width = W
    probe.height = H
    pctx.font = font
    pctx.direction = dir
    pctx.textAlign = 'center'
    pctx.textBaseline = 'alphabetic'
    pctx.fillStyle = '#000'
    pctx.fillText(text, cx, baseY)
    const d = pctx.getImageData(0, 0, W, H).data
    const y0 = Math.max(0, Math.round(top + h * 0.12)),
      y1 = Math.min(H - 1, Math.round(top + h * 0.72))
    const hit = (x: number) => {
      const ys: number[] = []
      for (let y = y0; y <= y1; y++) if (d[(y * W + x) * 4 + 3] > 110) ys.push(y)
      return ys.length ? ys[Math.floor(ys.length / 2)] : null
    }
    let l: Pt | null = null,
      r: Pt | null = null
    for (let x = Math.max(0, Math.floor(left) - 2); x < W && x <= cx; x++) {
      const y = hit(x)
      if (y !== null) {
        l = [x, y]
        break
      }
    }
    for (let x = Math.min(W - 1, Math.ceil(right) + 2); x >= 0 && x >= cx; x--) {
      const y = hit(x)
      if (y !== null) {
        r = [x, y]
        break
      }
    }
    const fy = top + h * 0.34
    return { l: l || [left, fy], r: r || [right, fy] }
  }

  function draw() {
    const s = b.size()
    if (!s) return
    const { W, H } = s
    const text = nameEl.textContent ?? ''
    const ar = nameEl.dataset.script === 'ar'
    const f = fontFor(nameEl.dataset.style, ar)
    const m = opts.metal ? METALS[opts.metal] : currentMetal()
    ctx.direction = ar ? 'rtl' : 'ltr'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'

    // largest size that fits the available width
    const maxW = W * 0.76
    let px = Math.min(H * 0.34, 120)
    ctx.font = fontStr(f, px)
    let mt = ctx.measureText(bare(text))
    const inkW = mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight
    if (inkW > maxW) {
      px *= maxW / inkW
      ctx.font = fontStr(f, px)
      mt = ctx.measureText(bare(text))
    }

    // centre the actual ink of the letters where the pendant should hang
    const asc = mt.actualBoundingBoxAscent,
      desc = mt.actualBoundingBoxDescent
    const cx = W / 2 + (mt.actualBoundingBoxLeft - mt.actualBoundingBoxRight) / 2
    const baseY = H * 0.56 + (asc - desc) / 2
    const left = cx - mt.actualBoundingBoxLeft,
      right = cx + mt.actualBoundingBoxRight
    const top = baseY - asc

    // jump rings sit on the real first and last strokes of the name, then the chain runs up from them
    const ends = findEnds(bare(text), ctx.font, ctx.direction, cx, baseY, top, asc + desc, left, right, W, H)
    const off = 3
    const lx = ends.l[0] - off,
      ly = ends.l[1],
      rx = ends.r[0] + off,
      ry = ends.r[1]
    const spread = Math.max(W * 0.18, 40)
    const sl = Math.max(8, lx - spread),
      sr = Math.min(W - 8, rx + spread)
    drawChain([sl, -6], [sl + spread * 0.25, ly * 0.78], [lx - off, ly], m)
    drawChain([sr, -6], [sr - spread * 0.25, ry * 0.78], [rx + off, ry], m)

    // the name: soft drop shadow, a darker edge for thickness, then the polished face
    const edge = Math.max(1, px * 0.018)
    const grad = ctx.createLinearGradient(0, top, 0, top + asc + desc)
    ;[0, 0.32, 0.5, 0.66, 1].forEach((o, i) => grad.addColorStop(o, m.stops[i]))
    ctx.save()
    ctx.shadowColor = 'rgba(78,15,42,.25)'
    ctx.shadowBlur = 16
    ctx.shadowOffsetY = 8
    ctx.fillStyle = m.edge
    ctx.fillText(text, cx, baseY + edge)
    ctx.restore()
    ctx.fillStyle = m.edge
    ctx.fillText(text, cx, baseY + edge)
    ctx.fillStyle = grad
    ctx.fillText(text, cx, baseY)

    ring(lx, ly, m)
    ring(rx, ry, m)

    // birthstone set beside the end of the name
    if (stoneIdx !== null) {
      const c = stones[stoneIdx].c
      const r = 6.5
      const gx = ar ? lx : rx,
        gy = (ar ? ly : ry) + 17
      ctx.beginPath()
      ctx.arc(gx, gy, r + 2, 0, Math.PI * 2)
      ctx.fillStyle = m.ring
      ctx.fill()
      const g = ctx.createRadialGradient(gx - 2, gy - 2, 1, gx, gy, r)
      g.addColorStop(0, '#FFFFFF')
      g.addColorStop(0.35, c)
      g.addColorStop(1, c)
      ctx.beginPath()
      ctx.arc(gx, gy, r, 0, Math.PI * 2)
      ctx.fillStyle = g
      ctx.fill()
    }
  }

  nameEl.dataset.sample = nameEl.textContent ?? ''
  b.redraw()
  return {
    set({ text, style, sample, stone }) {
      b.setText(text, sample)
      if (style) nameEl.dataset.style = style
      if (stone !== undefined) stoneIdx = stone
      b.redraw()
    },
    destroy: b.destroy,
  }
}

/* ---------- engraving preview for rings and cufflinks ---------- */
// shapes: 'band' (engraved thin ring), 'bandcut' (a ring made of the name's letters), 'square' (square ring face),
// 'disc' (engraved round cufflinks), 'enamel' (raised name on black enamel cufflinks), 'cut' (cut-out name cufflinks)
export function engrave(el: HTMLElement, opts: { shape?: EngraveShape } = {}): PreviewApi {
  const shape = opts.shape || 'disc'
  let userScale = 1 // the customer's text-size choice (1 = largest size that fits)
  let stoneIdx: number | null = null // the customer's gem, set into ring previews
  const b = base(el, () => draw())
  const { ctx, nameEl } = b
  const strip = document.createElement('canvas')
  const sctx = strip.getContext('2d') as CanvasRenderingContext2D

  const grad = (c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, m: MetalPalette) => {
    const g = c.createLinearGradient(x0, y0, x1, y1)
    ;[0, 0.32, 0.5, 0.66, 1].forEach((o, i) => g.addColorStop(o, m.stops[i]))
    return g
  }

  // a faceted stone in a metal bezel
  function gem(c: CanvasRenderingContext2D, x: number, y: number, r: number, m: MetalPalette) {
    const col = stones[stoneIdx ?? 0].c
    c.save()
    c.shadowColor = 'rgba(78,15,42,.3)'
    c.shadowBlur = r * 0.6
    c.shadowOffsetY = r * 0.2
    c.beginPath()
    c.arc(x, y, r * 1.3, 0, Math.PI * 2)
    c.fillStyle = grad(c, x - r, y - r, x + r, y + r, m)
    c.fill()
    c.restore()
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r)
    g.addColorStop(0, '#FFFFFF')
    g.addColorStop(0.32, col)
    g.addColorStop(1, col)
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.fillStyle = g
    c.fill()
    c.lineWidth = Math.max(0.6, r * 0.12)
    c.strokeStyle = 'rgba(0,0,0,.25)'
    c.stroke()
    c.beginPath()
    c.moveTo(x - r * 0.55, y)
    c.lineTo(x, y - r * 0.55)
    c.lineTo(x + r * 0.55, y)
    c.lineTo(x, y + r * 0.55)
    c.closePath()
    c.lineWidth = Math.max(0.5, r * 0.06)
    c.strokeStyle = 'rgba(255,255,255,.35)'
    c.stroke()
    c.beginPath()
    c.arc(x - r * 0.32, y - r * 0.36, r * 0.18, 0, Math.PI * 2)
    c.fillStyle = 'rgba(255,255,255,.9)'
    c.fill()
  }
  // where the gem goes on a ring strip: just after the end of the name (on the left for Arabic, which reads right to left)
  const gemAfter = (p: Placed, ar: boolean, v: number, r: number) => ({
    u: ar ? p.x - p.mt.actualBoundingBoxLeft - r * 1.9 : p.x + p.mt.actualBoundingBoxRight + r * 1.9,
    v,
    r,
  })

  // set the font so the text's ink fits a box, and return where to draw it so the ink is centred on (x, y)
  function fitText(c: CanvasRenderingContext2D, text: string, f: FontSpec, maxW: number, maxH: number, x: number, y: number): Placed {
    let px = Math.max(8, maxH * 1.4)
    c.font = fontStr(f, px)
    let mt = c.measureText(bare(text))
    const w = mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight || 1,
      h = mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent || 1
    const k = Math.min(maxW / w, maxH / h)
    px *= k * userScale
    c.font = fontStr(f, px)
    mt = c.measureText(bare(text))
    return { x: x + (mt.actualBoundingBoxLeft - mt.actualBoundingBoxRight) / 2, y: y + (mt.actualBoundingBoxAscent - mt.actualBoundingBoxDescent) / 2, px, mt }
  }
  // engraved: a dark cut with a light lip under it
  function cutText(c: CanvasRenderingContext2D, text: string, p: Placed, m: MetalPalette) {
    c.fillStyle = 'rgba(255,255,255,.75)'
    c.fillText(text, p.x + 0.5, p.y + Math.max(1, p.px * 0.025))
    c.fillStyle = m.edge
    c.fillText(text, p.x, p.y)
  }
  // raised polished metal, like the name necklaces
  function raisedText(c: CanvasRenderingContext2D, text: string, p: Placed, m: MetalPalette, shadow = true) {
    const top = p.y - p.mt.actualBoundingBoxAscent,
      h = p.mt.actualBoundingBoxAscent + p.mt.actualBoundingBoxDescent
    if (shadow) {
      c.save()
      c.shadowColor = 'rgba(78,15,42,.28)'
      c.shadowBlur = 10
      c.shadowOffsetY = 5
      c.fillStyle = m.edge
      c.fillText(text, p.x, p.y + 1.5)
      c.restore()
    }
    c.fillStyle = m.edge
    c.fillText(text, p.x, p.y + Math.max(1, p.px * 0.02))
    c.fillStyle = grad(c, 0, top, 0, top + h, m)
    c.fillText(text, p.x, p.y)
  }
  // cufflinks: every space starts a new line, the lines sit right on top of each other (slightly
  // interlocking, like the real calligraphy), and the name is made as big as the face allows.
  // circleR: on a round face the words may reach the rim but not spill over it.
  function stackText(c: CanvasRenderingContext2D, text: string, f: FontSpec, boxW: number, boxH: number, cx: number, cy: number, paint: (ln: string, p: Placed) => void, circleR?: number) {
    const lines = text.split(/\s+/).filter(Boolean)
    if (!lines.length) lines.push(text)
    const n = lines.length
    const arabic = isArabic(text)
    const layout = (px: number) => {
      c.font = fontStr(f, px)
      const mts = lines.map((ln) => c.measureText(bare(ln)))
      const hs = mts.map((mt) => mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent)
      const ws = mts.map((mt) => mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight)
      const step = Math.max(...hs) * (arabic ? 0.88 : 1.14) // Arabic calligraphy interlocks; English lines sit close with a small gap
      const ys = lines.map((_, i) => (i - (n - 1) / 2) * step)
      return { px, mts, hs, ws, ys }
    }
    const fits = (L: ReturnType<typeof layout>) => {
      if (L.ys[n - 1] + L.hs[n - 1] / 2 - (L.ys[0] - L.hs[0] / 2) > boxH) return false
      for (let i = 0; i < n; i++) {
        if (L.ws[i] > boxW) return false
        if (circleR) {
          // the corners of a word's box are mostly empty, so only part of its height counts against the rim
          const yEdge = Math.max(Math.abs(L.ys[i] - L.hs[i] / 2), Math.abs(L.ys[i] + L.hs[i] / 2)) * 0.9
          const half = L.ws[i] / 2,
            rr = circleR * 0.96
          if (half * half + yEdge * yEdge > rr * rr) return false
        }
      }
      return true
    }
    let lo = 4,
      hi = boxH * 1.6
    for (let k = 0; k < 18; k++) {
      const mid = (lo + hi) / 2
      if (fits(layout(mid))) lo = mid
      else hi = mid
    }
    const L = layout(lo * userScale)
    lines.forEach((ln, i) => {
      const mt = L.mts[i]
      paint(ln, { x: cx + (mt.actualBoundingBoxLeft - mt.actualBoundingBoxRight) / 2, y: cy + L.ys[i] + (mt.actualBoundingBoxAscent - mt.actualBoundingBoxDescent) / 2, px: L.px, mt })
    })
  }
  function disc(cx: number, cy: number, r: number, m: MetalPalette, inner: number) {
    ctx.save()
    ctx.shadowColor = 'rgba(78,15,42,.25)'
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 8
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = grad(ctx, cx - r, cy - r, cx + r, cy + r, m)
    ctx.fill()
    ctx.restore()
    ctx.beginPath()
    ctx.arc(cx, cy, r * inner, 0, Math.PI * 2)
    const face = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r)
    face.addColorStop(0, m.stops[0])
    face.addColorStop(0.55, m.stops[1])
    face.addColorStop(1, m.stops[2])
    ctx.fillStyle = face
    ctx.fill()
    ctx.lineWidth = 1.2
    ctx.strokeStyle = 'rgba(255,255,255,.6)'
    ctx.stroke()
  }
  // wrap a flat strip around a ring seen from the front and slightly above.
  // open = true for name rings, where the letters themselves are the ring and there is no solid band
  function wrapRing(W: number, H: number, bandH: number, m: MetalPalette, paint: (c: CanvasRenderingContext2D, Wf: number, Hf: number) => { u: number; v: number; r: number } | null, open: boolean, radius?: number) {
    const R = radius || Math.min(W * 0.38, H * 0.95),
      tilt = open ? 0.3 : 0.2,
      cx = W / 2,
      cy = open ? H * 0.5 - bandH / 2 - tilt * R * 0.35 : H * 0.36
    const Wf = Math.round(Math.PI * R),
      Hf = Math.round(bandH)
    strip.width = Wf
    strip.height = Hf
    const stone = paint(sctx, Wf, Hf)
    // darken the sides as the ring turns away, only where there is metal
    sctx.save()
    sctx.globalCompositeOperation = 'source-atop'
    for (let u = 0; u < Wf; u += 2) {
      const th = (u / Wf - 0.5) * Math.PI
      sctx.fillStyle = `rgba(60,20,40,${(0.5 * (1 - Math.cos(th))).toFixed(3)})`
      sctx.fillRect(u, 0, 2, Hf)
    }
    sctx.restore()
    const col = (u: number, back: boolean) => {
      const th = (u / Wf - 0.5) * Math.PI
      return { th, x: cx + R * Math.sin(th), w: (R * Math.cos(th) * Math.PI) / Wf + 0.8, y: cy + (back ? -1 : 1) * tilt * R * Math.cos(th) }
    }
    // the ring's round footprint on the surface (for name rings it's the only hint of the far side)
    if (open) {
      ctx.save()
      ctx.filter = 'blur(5px)'
      ctx.beginPath()
      ctx.ellipse(cx, cy + Hf * 0.95, R * 0.98, tilt * R * 0.98, 0, 0, Math.PI * 2)
      ctx.lineWidth = Math.max(4, Hf * 0.12)
      ctx.strokeStyle = 'rgba(78,15,42,.16)'
      ctx.stroke()
      ctx.restore()
    }
    // one soft shadow on the surface under the ring
    const sh = ctx.createRadialGradient(cx, cy + tilt * R + Hf, 4, cx, cy + tilt * R + Hf, R)
    sh.addColorStop(0, 'rgba(78,15,42,.22)')
    sh.addColorStop(1, 'rgba(78,15,42,0)')
    ctx.save()
    ctx.translate(0, cy + tilt * R + Hf)
    ctx.scale(1, 0.18)
    ctx.fillStyle = sh
    ctx.fillRect(cx - R * 1.1, -R, R * 2.2, R * 2)
    ctx.restore()
    if (!open) {
      // inside surface of a solid band
      for (let u = 0; u < Wf; u++) {
        const c = col(u, true)
        ctx.fillStyle = m.ring
        ctx.globalAlpha = 0.35 + 0.35 * Math.cos(c.th)
        ctx.fillRect(c.x, c.y, c.w, Hf * 0.9)
      }
      ctx.globalAlpha = 1
    }
    // the front of the ring
    for (let u = 0; u < Wf; u++) {
      const c = col(u, false)
      ctx.drawImage(strip, u, 0, 1, Hf, c.x, c.y, c.w, Hf)
    }
    // the gem is set on top as a round stone rather than warped with the strip, so it stays readable as it turns away
    if (stone) {
      const c = col(stone.u, false)
      gem(ctx, c.x, c.y + stone.v, stone.r * (0.6 + 0.4 * Math.cos(c.th)), m)
    }
  }

  function draw() {
    const s = b.size()
    if (!s) return
    const { W, H } = s
    const text = nameEl.textContent ?? ''
    const ar = nameEl.dataset.script === 'ar'
    const f = fontFor(nameEl.dataset.style, ar)
    const m = currentMetal()
    ;[ctx, sctx].forEach((c) => {
      c.direction = ar ? 'rtl' : 'ltr'
      c.textAlign = 'center'
      c.textBaseline = 'alphabetic'
    })

    if (shape === 'disc' || shape === 'enamel') {
      const r = Math.min(W * 0.22, H * 0.42)
      ;[W / 2 - r * 1.25, W / 2 + r * 1.25].forEach((cx) => {
        const cy = H * 0.5
        if (shape === 'disc') {
          disc(cx, cy, r, m, 0.9)
          ctx.save()
          ctx.beginPath()
          ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2)
          ctx.clip()
          stackText(ctx, text, f, r * 1.7, r * 1.7, cx, cy, (ln, p) => cutText(ctx, ln, p, m), r * 0.86)
          ctx.restore()
        } else {
          disc(cx, cy, r, m, 0.86)
          ctx.beginPath()
          ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2)
          const en = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.3, r * 0.05, cx, cy, r * 0.8)
          en.addColorStop(0, '#2D2733')
          en.addColorStop(1, '#0C0A0F')
          ctx.fillStyle = en
          ctx.fill()
          ctx.save()
          ctx.beginPath()
          ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2)
          ctx.clip()
          stackText(ctx, text, f, r * 1.6, r * 1.6, cx, cy, (ln, p) => raisedText(ctx, ln, p, m, false), r * 0.8)
          ctx.restore()
          ctx.beginPath()
          ctx.ellipse(cx - r * 0.12, cy - r * 0.42, r * 0.5, r * 0.16, -0.35, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,.07)'
          ctx.fill()
        }
      })
    } else if (shape === 'cut') {
      ;[W * 0.27, W * 0.73].forEach((cx) => stackText(ctx, text, f, W * 0.4, H * 0.88, cx, H * 0.5, (ln, p) => raisedText(ctx, ln, p, m)))
    } else if (shape === 'square') {
      const sz = Math.min(W * 0.4, H * 0.64),
        x0 = W / 2 - sz / 2,
        y0 = H * 0.5 - sz / 2
      const bh = sz * 0.2
      ctx.save()
      ctx.shadowColor = 'rgba(78,15,42,.22)'
      ctx.shadowBlur = 14
      ctx.shadowOffsetY = 6
      ;[
        [W * 0.1, x0 + 4],
        [x0 + sz - 4, W * 0.9],
      ].forEach(([a, c]) => {
        ctx.fillStyle = grad(ctx, 0, H / 2 - bh / 2, 0, H / 2 + bh / 2, m)
        ctx.fillRect(a, H / 2 - bh / 2, c - a, bh)
      })
      ctx.restore()
      ctx.save()
      ctx.shadowColor = 'rgba(78,15,42,.28)'
      ctx.shadowBlur = 20
      ctx.shadowOffsetY = 10
      ctx.beginPath()
      ctx.roundRect(x0, y0, sz, sz, sz * 0.08)
      ctx.fillStyle = grad(ctx, x0, y0, x0 + sz, y0 + sz, m)
      ctx.fill()
      ctx.restore()
      ctx.beginPath()
      ctx.roundRect(x0 + sz * 0.06, y0 + sz * 0.06, sz * 0.88, sz * 0.88, sz * 0.05)
      const face = ctx.createLinearGradient(x0, y0, x0 + sz, y0 + sz)
      face.addColorStop(0, m.stops[0])
      face.addColorStop(0.6, m.stops[1])
      face.addColorStop(1, m.stops[4])
      ctx.fillStyle = face
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255,255,255,.55)'
      ctx.stroke()
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(x0 + sz * 0.06, y0 + sz * 0.06, sz * 0.88, sz * 0.88, sz * 0.05)
      ctx.clip()
      cutText(ctx, text, fitText(ctx, text, f, sz * 0.74, sz * 0.5, W / 2, H / 2), m)
      ctx.restore()
      if (stoneIdx !== null) gem(ctx, ar ? x0 + sz * 0.15 : x0 + sz * 0.85, y0 + sz * 0.85, sz * 0.055, m)
    } else if (shape === 'band' || shape === 'bandcut') {
      if (shape === 'bandcut') {
        // the name is the ring: size the ring so the letters wrap around its front
        const hT = H * 0.3
        const probe = fitText(ctx, text, f, 1e6, hT, 0, 0)
        const w0 = probe.mt.actualBoundingBoxLeft + probe.mt.actualBoundingBoxRight
        const R = Math.max(W * 0.2, Math.min(W * 0.4, w0 / (0.72 * Math.PI)))
        wrapRing(
          W,
          H,
          hT * 1.3,
          m,
          (c, Wf, Hf) => {
            c.clearRect(0, 0, Wf, Hf)
            c.direction = ar ? 'rtl' : 'ltr'
            c.textAlign = 'center'
            c.textBaseline = 'alphabetic'
            const r = Hf * 0.14,
              withGem = stoneIdx !== null
            const p = fitText(c, text, f, Wf * (withGem ? 0.72 : 0.86), hT, Wf / 2, Hf / 2)
            // centre the name and the gem together, so the gem stays near the front of the ring
            if (withGem) p.x += (ar ? 1 : -1) * r * 1.6
            raisedText(c, text, p, m, false)
            return withGem ? gemAfter(p, ar, Hf / 2, r) : null
          },
          true,
          R,
        )
      } else {
        wrapRing(
          W,
          H,
          H * 0.14,
          m,
          (c, Wf, Hf) => {
            c.clearRect(0, 0, Wf, Hf)
            c.direction = ar ? 'rtl' : 'ltr'
            c.textAlign = 'center'
            c.textBaseline = 'alphabetic'
            c.fillStyle = grad(c, 0, 0, 0, Hf, m)
            c.fillRect(0, 0, Wf, Hf)
            const p = fitText(c, text, f, Wf * 0.55, Hf * 0.62, Wf / 2, Hf / 2)
            cutText(c, text, p, m)
            return stoneIdx !== null ? gemAfter(p, ar, Hf / 2, Hf * 0.26) : null
          },
          false,
        )
      }
    }
  }

  nameEl.dataset.sample = nameEl.textContent ?? ''
  return {
    set({ text, style, sample, scale, stone }) {
      if (scale) userScale = scale
      if (stone !== undefined) stoneIdx = stone
      b.setText(text, sample)
      if (style) nameEl.dataset.style = style
      b.redraw()
    },
    destroy: b.destroy,
  }
}

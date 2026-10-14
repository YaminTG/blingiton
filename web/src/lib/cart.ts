import { resolve, stepRank, type Question, type Variant } from './choices'
import type { Dictionary } from './dictionary'
import { stoneLabel } from './stones'

export type LetterStyle = 'script' | 'classic' | 'modern' | 'kufi'

/** One line in the bag, as kept in the browser (localStorage `bl-cart`). */
export type CartItem = {
  id: number
  qty: number
  name?: string
  style?: LetterStyle
  finish?: 'silver' | 'gold'
  chain?: number
  stone?: number | null
  tsize?: number
  /** Answers to the product's questions: question id → choice id. */
  choices?: Record<string, string>
  gift?: boolean
  note?: string
}

/** What the bag and checkout need to know about a product, in one language. */
export type BagProduct = {
  id: number
  slug: string
  name: string
  price: number
  image: string | null
  type: 'none' | 'name' | 'letters' | 'engrave'
  textOptional: boolean
  stones: 'none' | 'birthstone' | 'gem'
  goldExtra: number
  questions: Question[]
  variants: Variant[]
  soldOut: boolean
}

export const sameItem = (a: CartItem, b: CartItem) => JSON.stringify({ ...a, qty: 0 }) === JSON.stringify({ ...b, qty: 0 })

export const resolveItem = (p: BagProduct, it: CartItem) => resolve(p.price, p.questions, p.variants, it.choices ?? {})

export function unitPrice(p: BagProduct, it: CartItem) {
  let price = resolveItem(p, it).price
  if (it.finish === 'gold') price += p.goldExtra
  return price
}

/** The photo for this line: the one for the chosen design/colour if there is one, else the main photo. */
export const itemImage = (p: BagProduct, it: CartItem) => resolveItem(p, it).photo?.thumb ?? p.image

/** The customer's choices as label/value pairs, in the order they were asked, for the bag, checkout and the order. */
export function optionLines(it: CartItem, p: BagProduct | undefined, t: Dictionary, ar: boolean): [string, string][] {
  const L: [number, string, string][] = []
  if (p) {
    const { steps, answers } = resolveItem(p, it)
    for (const s of steps) {
      const choice = s.choices.find((c) => c.id === answers[s.id])
      if (choice) L.push([stepRank[s.look], s.name, choice.label])
    }
  }
  if (it.chain) L.push([stepRank.length, t.lines.chain, `${it.chain} ${t.cm}`])
  if (it.stone !== undefined && it.stone !== null) {
    const kind = p?.stones === 'birthstone' ? 'birthstone' : 'gem'
    L.push([stepRank.stone, kind === 'birthstone' ? t.lines.stone : t.lines.gem, stoneLabel(it.stone, kind, ar)])
  }
  if (it.name) L.push([stepRank.text, p?.type === 'engrave' ? t.lines.engrave : t.lines.name, it.name])
  if (it.style) L.push([stepRank.font, t.lines.style, t.styles[it.style]])
  if (it.finish) L.push([stepRank.finish, t.lines.finish, t[it.finish]])
  if (it.tsize && it.tsize !== 100) L.push([stepRank.font, t.lines.size, `${it.tsize}%`])
  // Stable sort keeps the order within a rank.
  const lines: [string, string][] = L.sort((a, b) => a[0] - b[0]).map(([, k, v]) => [k, v])
  if (it.gift) lines.push(['', t.lines.gift])
  if (it.note) lines.push([t.lines.note, `“${it.note}”`])
  return lines
}

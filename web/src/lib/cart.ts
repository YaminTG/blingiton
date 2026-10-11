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
  /** Price-changing options: option id → choice id. */
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
  stones: 'none' | 'birthstone' | 'gem'
  goldExtra: number
  options: { id: string; name: string; choices: { id: string; label: string; extra: number }[] }[]
  soldOut: boolean
}

export const sameItem = (a: CartItem, b: CartItem) => JSON.stringify({ ...a, qty: 0 }) === JSON.stringify({ ...b, qty: 0 })

export function unitPrice(p: BagProduct, it: CartItem) {
  let price = p.price
  if (it.finish === 'gold') price += p.goldExtra
  for (const o of p.options) {
    const choice = o.choices.find((c) => c.id === it.choices?.[o.id])
    if (choice) price += choice.extra
  }
  return price
}

/** The customer's choices as label/value pairs, for the bag, checkout and the WhatsApp order. */
export function optionLines(it: CartItem, p: BagProduct | undefined, t: Dictionary, ar: boolean): [string, string][] {
  const L: [string, string][] = []
  if (it.name) L.push([p?.type === 'engrave' ? t.lines.engrave : t.lines.name, it.name])
  if (it.style) L.push([t.lines.style, t.styles[it.style]])
  if (it.finish) L.push([t.lines.finish, t[it.finish]])
  if (it.chain) L.push([t.lines.chain, `${it.chain} ${t.cm}`])
  if (it.stone !== undefined && it.stone !== null) {
    const kind = p?.stones === 'birthstone' ? 'birthstone' : 'gem'
    L.push([kind === 'birthstone' ? t.lines.stone : t.lines.gem, stoneLabel(it.stone, kind, ar)])
  }
  for (const o of p?.options ?? []) {
    const choice = o.choices.find((c) => c.id === it.choices?.[o.id])
    if (choice) L.push([o.name, choice.label])
  }
  if (it.tsize && it.tsize !== 100) L.push([t.lines.size, `${it.tsize}%`])
  if (it.gift) L.push(['', t.lines.gift])
  if (it.note) L.push([t.lines.note, `“${it.note}”`])
  return L
}

// The gift finder (/[locale]/finder): five questions, then the 3–5 pieces that fit best, each with
// the reasons it fits. Rule-based on purpose: every reason comes from the product's own data
// (categories, type, personalisation, gold, stones, price, stock, sales, and words in its name and
// search phrases), so nothing is invented. Pure: no database or server imports (unit-tested in
// tests/unit/finder.spec.ts; the browser uses the constants).
//
// Products carry their own "for whom / occasions / style" tags (Products → Gift finder; filled in by
// scripts/finder-tags-apply.ts and checked by the shop). A product without tags (e.g. a new one) is
// matched on what can be guessed from its categories and name instead.

export const QUESTIONS = ['for', 'occasion', 'budget', 'style', 'finish'] as const
export type Question = (typeof QUESTIONS)[number]

export const RECIPIENTS = ['her', 'mom', 'friend', 'him', 'child', 'me'] as const
export const OCCASIONS = ['birthday', 'love', 'graduation', 'eid', 'mothers-day', 'baby', 'just-because'] as const
export const STYLES = ['name', 'heritage', 'faith', 'sparkle', 'pearls', 'everyday', 'hearts', 'any'] as const
export const FINISHES = ['silver', 'gold', 'any'] as const

/** What a product can be tagged with (Products → Gift finder). "Myself" and "Surprise me" are shopper answers, not tags. */
export const TAG_RECIPIENTS = ['her', 'mom', 'friend', 'him', 'child'] as const
export const TAG_STYLES = ['name', 'heritage', 'faith', 'sparkle', 'pearls', 'everyday', 'hearts'] as const

export type Recipient = (typeof RECIPIENTS)[number]
export type Occasion = (typeof OCCASIONS)[number]
export type Style = (typeof STYLES)[number]
export type Finish = (typeof FINISHES)[number]
export type Budget = { min: number; max: number | null }

export type Answers = { for?: Recipient; occasion?: Occasion; budget?: Budget; style?: Style; finish?: Finish }

/** Marks a visit whose shopper clicked a finder pick, so the order can say it came through the finder. */
export const FINDER_KEY = 'bl-finder'

// --- Answers in the address (?for=mom&occasion=eid&budget=40-55&style=faith&finish=any) -----------

const pick = <T extends string>(list: readonly T[], v: unknown) => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined)

export const budgetKey = (b: Budget) => `${b.min}-${b.max ?? ''}`

export function parseBudget(v: unknown): Budget | undefined {
  const m = typeof v === 'string' ? v.match(/^(\d{1,4})-(\d{1,4})?$/) : null
  if (!m) return undefined
  const min = Number(m[1])
  const max = m[2] ? Number(m[2]) : null
  return max !== null && max <= min ? undefined : { min, max }
}

export function parseAnswers(params: Record<string, string | string[] | undefined>): Answers {
  const one = (k: string) => [params[k]].flat()[0]
  return {
    for: pick(RECIPIENTS, one('for')),
    occasion: pick(OCCASIONS, one('occasion')),
    budget: parseBudget(one('budget')),
    style: pick(STYLES, one('style')),
    finish: pick(FINISHES, one('finish')),
  }
}

/** The first question still unanswered, or null when it's time for the picks. */
export const nextQuestion = (a: Answers): Question | null => QUESTIONS.find((q) => a[q] === undefined) ?? null

/** The query string for these answers, with one changed (`set`) or taken away (`drop`, to ask it again). */
export function answersQuery(a: Answers, change: { set?: Partial<Record<Question, string>>; drop?: Question } = {}) {
  const out = new URLSearchParams()
  for (const q of QUESTIONS) {
    if (q === change.drop) continue
    const v = change.set?.[q] ?? (q === 'budget' ? (a.budget ? budgetKey(a.budget) : undefined) : a[q])
    if (v) out.set(q, v)
  }
  const s = out.toString()
  return s ? `?${s}` : ''
}

/** Four budgets from the live prices (quarters of the range, rounded to 5 JOD), so they follow the catalogue. */
export function budgetBands(prices: number[]): Budget[] {
  const sorted = prices.filter((p) => p > 0).sort((a, b) => a - b)
  if (sorted.length < 8) return [{ min: 0, max: null }]
  const at = (q: number) => Math.max(5, Math.round(sorted[Math.floor(q * (sorted.length - 1))] / 5) * 5)
  const cuts = [...new Set([at(0.25), at(0.5), at(0.75)])]
  return [0, ...cuts].map((min, i) => ({ min, max: cuts[i] ?? null }))
}

// --- What a product is ---------------------------------------------------------------------------

export type FinderProduct = {
  id: number
  name: string
  price: number
  kind: string
  /** Category slugs. */
  categories: string[]
  personal: 'none' | 'name' | 'letters' | 'engrave'
  gold: boolean
  stones: string
  availability: 'in_stock' | 'made_to_order' | 'sold_out'
  /** In stock with pieces left (or made to order). */
  buyable: boolean
  featured: boolean
  /** Pieces sold in the last 180 days. */
  sold: number
  /** Name, short description and search phrases, for spotting themes. */
  text: string
  /** The product's own gift-finder tags (Products → Gift finder). When set, they replace the guesses. */
  tags?: { for: string[]; occasions: string[]; styles: string[] } | null
}

/** Tagged products are matched on their tags; the rest on what can be guessed. */
const tagged = (p: FinderProduct) => Boolean(p.tags && (p.tags.for.length || p.tags.occasions.length || p.tags.styles.length))

export type Theme = 'name' | 'heritage' | 'faith' | 'sparkle' | 'pearls' | 'everyday' | 'hearts' | 'kids' | 'men' | 'feminine' | 'birthstone' | 'mom' | 'friend'

// Words in English and Arabic that put a piece in a theme. Kept broad: a near miss only nudges the order.
const WORDS: Partial<Record<Theme, RegExp>> = {
  heritage: /palestin|jordan|\bmap\b|keffiyeh|kufiya|handala|zaytona|olive|watermelon|darwish|hometown|فلسطين|الأردن|اردن|خريطة|كوفية|حنظلة|زيتون/i,
  faith: /ayat|ayet|kursi|allah|hamsa|quran|qur'an|bismillah|evil eye|protect|mashallah|dua\b|prayer|الكرسي|الله|قرآن|خمسة|حمسة|ما شاء|عين/i,
  sparkle: /tennis|zircon|stone|\bgems?\b|gemstone|sparkl|shin(e|ing|y)|crystal|sapphire|ruby|emerald|topaz|amethyst|jade|twinkl|glow|diamond|glitter|حجر|أحجار|زركون|لامع/i,
  pearls: /pearl|لؤلؤ/i,
  everyday: /paperclip|dainty|minimal|simple|everyday|daily|\bstuds?\b|hoop|tiny|small/i,
  hearts: /heart|love|\bhugs?\b|valentine|قلب|حب/i,
  kids: /\bkids?\b|baby|child|little|\bgirls?\b|toddler|أطفال|طفل|بيبي|بنت/i,
  men: /\bmen\b|\bmens\b|men's|\bman\b|\bhis\b|\bhim\b|رجالي|رجال/i,
  feminine: /\bwomen\b|\bher\b|lady|ladies|\bgirls?\b|princess|نسائي|بنات/i,
  birthstone: /birthstone|birth stone|حجر الميلاد/i,
  mom: /\bmom\b|\bmum\b|mama|mother|ماما|أمي|الأم/i,
  friend: /friend|\bbff\b|bestie|sister|صديق|صاحب|أخت/i,
}

/** Every theme a product belongs to, from its categories, type, options and words. */
export function themesOf(p: FinderProduct): Set<Theme> {
  const out = new Set<Theme>()
  const cat = (...slugs: string[]) => slugs.some((s) => p.categories.includes(s))
  for (const [theme, re] of Object.entries(WORDS)) if (re!.test(p.text)) out.add(theme as Theme)
  if (p.personal !== 'none' || cat('name-necklace', 'letters-necklace', 'personalized-necklaces', 'custom-made-rings')) out.add('name')
  if (cat('palestine-jewelry')) out.add('heritage')
  if (cat('gemstone-necklaces', 'tennis-necklace') || (p.stones && p.stones !== 'none')) out.add('sparkle')
  if (p.stones === 'birthstone') out.add('birthstone')
  if (cat('pearl-necklaces')) out.add('pearls')
  if (cat('daily-wear')) out.add('everyday')
  if (cat('kids')) out.add('kids')
  if (cat('men', 'cufflinks', 'watch-accessory') || p.kind === 'cufflinks') out.add('men')
  // A tagged product's styles and recipients are what the shop said, not a guess.
  if (tagged(p)) {
    const t = p.tags!
    if (t.styles.length) {
      for (const s of TAG_STYLES) {
        if (t.styles.includes(s)) out.add(s)
        else out.delete(s)
      }
    }
    if (t.for.length) {
      const set = (theme: Theme, on: boolean) => (on ? out.add(theme) : out.delete(theme))
      set('kids', t.for.includes('child'))
      set('men', t.for.includes('him') && !t.for.some((r) => r === 'her' || r === 'mom' || r === 'friend'))
      set('mom', t.for.includes('mom'))
      set('friend', t.for.includes('friend'))
    }
  }
  return out
}

// --- Scoring -------------------------------------------------------------------------------------

/** Which themes suit each occasion, and how strongly. */
const OCCASION_THEMES: Record<Occasion, Partial<Record<Theme, number>>> = {
  birthday: { name: 2, birthstone: 3, sparkle: 1 },
  love: { hearts: 3, sparkle: 2, pearls: 1, name: 1 },
  graduation: { name: 2, everyday: 1, heritage: 1 },
  eid: { faith: 3, heritage: 1, sparkle: 1 },
  'mothers-day': { name: 2, hearts: 2, mom: 3, pearls: 1 },
  baby: { kids: 3, faith: 2, name: 1 },
  'just-because': { everyday: 2, hearts: 1, friend: 1 },
}

const FOR_MEN_KINDS = ['bracelet', 'ring', 'cufflinks', 'other', 'necklace']

/** Why a piece fits, as codes the page words in the shopper's language. */
export type Reason =
  | 'style'
  | 'name'
  | 'letters'
  | 'engrave'
  | 'men'
  | 'kids'
  | 'occasion'
  | 'gold'
  | 'budget'
  | 'under'
  | 'over'
  | 'loved'
  | 'ready'
  | 'made'

export type Pick = { product: FinderProduct; score: number; reasons: Reason[]; exact: boolean }
export type Picks = {
  picks: Pick[]
  /** Fewer than 3 pieces match the chosen style exactly, so close matches fill in. */
  fewExact: boolean
  /** Fewer than 3 pieces in the budget, so slightly dearer ones were allowed. */
  stretched: boolean
  /** Gold was asked for but fewer than 3 picks come in gold. */
  fewGold: boolean
}

const WOMEN: string[] = ['her', 'mom', 'friend']

function recipientFits(r: Recipient | undefined, t: Set<Theme>, p: FinderProduct): number | null {
  // Tagged: the shop said who it's for. "Her", "Mom" and "a friend" are close enough to share pieces.
  const forWhom = p.tags?.for ?? []
  if (forWhom.length) {
    if (!r || r === 'me') return forWhom.length === 1 && forWhom[0] === 'child' ? null : 0
    if (forWhom.includes(r)) return 6
    if (WOMEN.includes(r) && forWhom.some((x) => WOMEN.includes(x))) return 1
    return null
  }
  if (!r || r === 'me') return t.has('men') ? (r === 'me' ? 0 : -2) : 0
  if (r === 'him') {
    if (!FOR_MEN_KINDS.includes(p.kind) || t.has('pearls') || t.has('feminine') || t.has('kids')) return null
    return (t.has('men') ? 6 : 0) + (p.kind === 'necklace' && !t.has('men') && !t.has('heritage') && !t.has('faith') ? -3 : 0)
  }
  if (t.has('men') && !t.has('kids')) return null
  if (r === 'child') return p.kind === 'anklet' ? null : (t.has('kids') ? 6 : 0) + (t.has('name') ? 1 : 0)
  // A piece made for little ones isn't the gift for a grown-up (a new baby is handled by the occasion).
  const forKids = t.has('kids') ? -6 : 0
  if (r === 'mom') return forKids + (t.has('mom') ? 4 : 0) + (t.has('name') ? 1 : 0)
  if (r === 'friend') return forKids + (t.has('friend') ? 4 : 0) + (t.has('everyday') ? 1 : 0)
  return forKids + (t.has('hearts') || t.has('sparkle') ? 1 : 0)
}

/** A stable pseudo-random number for a string (FNV-1a). */
function shuffleKey(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** "charmie pink necklace" and "charmie orange necklace" are the same family: show one. */
const COLOURS = /\b(pink|orange|purple|turquoise|blue|red|green|black|white|yellow|gold|silver|rose|kitty|small|large|big|mini)\b/g
const family = (name: string) => name.toLowerCase().replace(COLOURS, ' ').replace(/[^a-z؀-ۿ ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).join(' ')

/** The 3–5 best pieces for these answers. Sold-out or unpriced pieces are never picked. */
export function recommend(products: FinderProduct[], a: Answers, max = 5): Picks {
  const budget = a.budget ?? { min: 0, max: null }
  const scored: Pick[] = []

  for (const p of products) {
    // Gift vouchers and the gift card sit in no category: they aren't pieces to recommend.
    if (!p.buyable || !(p.price > 0) || !p.categories.length) continue
    const t = themesOf(p)
    const fit = recipientFits(a.for, t, p)
    if (fit === null) continue

    const reasons: Reason[] = []
    let score = fit
    const exact = !a.style || a.style === 'any' || t.has(a.style)
    if (exact && a.style && a.style !== 'any') {
      score += 8
      // For "their name on it", the name / initials / engraving line says it better.
      if (!(a.style === 'name' && p.personal !== 'none')) reasons.push('style')
    }
    if (p.personal !== 'none') reasons.push(p.personal)
    if (a.for === 'him' && t.has('men')) reasons.push('men')
    if ((a.for === 'child' || a.occasion === 'baby') && t.has('kids')) reasons.push('kids')

    if (a.occasion) {
      // Tagged occasions are the shop's word for it; otherwise guess from the piece's themes.
      const boost = p.tags?.occasions.length
        ? p.tags.occasions.includes(a.occasion)
          ? 5
          : 0
        : Object.entries(OCCASION_THEMES[a.occasion]).reduce((s, [theme, w]) => s + (t.has(theme as Theme) ? w! : 0), 0)
      score += boost
      if (boost >= 2) reasons.push('occasion')
    }
    if (a.finish === 'gold' && p.gold) {
      score += 5
      reasons.push('gold')
    }

    // The budget: inside is best; cheaper is fine; a little over only if there's too little inside.
    const over = budget.max !== null && p.price > budget.max
    if (over) score -= 10
    else if (p.price < budget.min) score -= 3
    reasons.push(over ? 'over' : p.price < budget.min ? 'under' : 'budget')

    const loved = p.featured || p.sold >= 3
    score += Math.min(3, Math.log2(1 + p.sold)) + (p.featured ? 1.5 : 0)
    if (loved) reasons.push('loved')
    if (p.availability === 'in_stock') score += 0.5
    reasons.push(p.availability === 'made_to_order' ? 'made' : 'ready')

    scored.push({ product: p, score, reasons, exact })
  }

  const inBudget = (x: Pick) => budget.max === null || x.product.price <= budget.max
  const nearBudget = (x: Pick) => budget.max === null || x.product.price <= budget.max * 1.25
  const enoughInBudget = scored.filter(inBudget).length >= 3
  const pool = scored.filter(enoughInBudget ? inBudget : nearBudget)
  const enoughExact = pool.filter((x) => x.exact).length >= 3
  // Equal scores are common; break ties by a shuffle seeded with the answers, so different answers
  // show different pieces while the same answers always show the same ones.
  const seed = JSON.stringify(a)
  const tie = (id: number) => shuffleKey(`${seed}|${id}`)
  const ranked = pool
    .filter((x) => (enoughExact ? x.exact : true))
    .sort((x, y) => Number(y.exact) - Number(x.exact) || y.score - x.score || tie(x.product.id) - tie(y.product.id))

  // Variety: one piece per family, at most 3 of the same kind.
  const picks: Pick[] = []
  const families = new Set<string>()
  const kinds = new Map<string, number>()
  for (const x of ranked) {
    if (picks.length >= max) break
    const f = family(x.product.name)
    if (families.has(f) || (kinds.get(x.product.kind) ?? 0) >= 3) continue
    families.add(f)
    kinds.set(x.product.kind, (kinds.get(x.product.kind) ?? 0) + 1)
    picks.push({ ...x, reasons: order(x.reasons) })
  }
  // Without enough exact matches, show at most 4 so the close ones don't crowd the list.
  const list = enoughExact ? picks : picks.slice(0, Math.max(3, picks.filter((x) => x.exact).length + 1))

  return {
    picks: list,
    fewExact: Boolean(a.style && a.style !== 'any' && !enoughExact),
    stretched: !enoughInBudget && list.some((x) => x.reasons.includes('over')),
    fewGold: a.finish === 'gold' && list.filter((x) => x.product.gold).length < 3,
  }
}

const REASON_ORDER: Reason[] = ['style', 'name', 'letters', 'engrave', 'men', 'kids', 'occasion', 'gold', 'budget', 'under', 'over', 'loved', 'made', 'ready']

/** The strongest reasons first, three at most (plus the budget line, which is always useful). */
function order(reasons: Reason[]): Reason[] {
  const sorted = [...new Set(reasons)].sort((a, b) => REASON_ORDER.indexOf(a) - REASON_ORDER.indexOf(b))
  const isMoney = (r: Reason) => r === 'budget' || r === 'under' || r === 'over'
  const money = sorted.filter(isMoney)
  const rest = sorted.filter((r) => !isMoney(r))
  return [...rest.slice(0, 3), ...money]
}

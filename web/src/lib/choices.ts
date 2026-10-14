// The questions a customer answers on a product page, in the shop's order, and what the answers
// mean for price, stock and photo. Used by the product page, the bag and the server's re-pricing,
// so all three always agree. No server imports: the browser uses it too.

/** What a question is about. Sets where it is asked and how its choices look. */
export const looks = ['design', 'size', 'chain', 'sparkle', 'finish', 'colour', 'other'] as const
export type Look = (typeof looks)[number]

/** The little picture drawn on a choice: a metal or colour swatch, or a chain pattern. */
export const pictures = ['silver', 'gold', 'rose', 'black', 'navy', 'white', 'pink', 'turquoise', 'orange', 'purple', 'red', 'green', 'blue', 'cable', 'paperclip'] as const
export type Picture = (typeof pictures)[number]

export type Photo = { large: string; thumb: string }

export type Choice = {
  id: string
  label: string
  extra: number
  picture: Picture | null
  photo: Photo | null
  /** Choice ids: offered only when the customer's answers include them (see `allowed`). */
  when: string[]
}
export type Question = { id: string; name: string; look: Look; when: string[]; choices: Choice[] }
/** A price, stock count or photo for one combination of choices. Empty values fall back to the product's. */
export type Variant = { id: string; when: string[]; price: number | null; stock: number | null; photo: Photo | null }

export type Answers = Record<string, string>

/**
 * Where each step comes in the flow: design first, then size and chain, sparkle, the name and its
 * lettering, the finish, then anything else. Built-in steps (chain length, stone, name, lettering,
 * silver/gold) slot in by the same ranks.
 */
export const stepRank = {
  design: 0,
  size: 1,
  chain: 2,
  length: 2,
  sparkle: 3,
  stone: 3,
  text: 4,
  font: 5,
  finish: 6,
  colour: 6,
  other: 7,
} as const

/** Questions in the order they're asked. Ties keep the order they have in the admin. */
export const ordered = (questions: Question[]) =>
  questions
    .map((q, i) => ({ q, i }))
    .sort((a, b) => stepRank[a.q.look] - stepRank[b.q.look] || a.i - b.i)
    .map(({ q }) => q)

const owners = (questions: Question[]) => {
  const map = new Map<string, string>()
  for (const q of questions) for (const c of q.choices) map.set(c.id, q.id)
  return map
}

/**
 * A condition is a list of choice ids. Choices of the same question are alternatives ("1.5 cm or
 * 3 cm"); different questions must all hold ("Big and Gold"). A question that isn't answered
 * fails the condition. Ids that no longer exist (a deleted choice) are ignored.
 */
export function allowed(when: string[], answers: Answers, owner: Map<string, string>) {
  const groups = new Map<string, Set<string>>()
  for (const id of when) {
    const q = owner.get(id)
    if (!q) continue
    if (!groups.has(q)) groups.set(q, new Set())
    groups.get(q)!.add(id)
  }
  for (const [q, ids] of groups) if (!ids.has(answers[q])) return false
  return true
}

export type Step = Question & { choices: Choice[] }

/**
 * The questions to ask for these answers, each with only the choices on offer, plus the answers
 * that still make sense. Answers to hidden questions or to choices no longer offered are dropped.
 * Conditions should point at earlier questions; ones that point later are worked out on a second pass.
 */
export function stepsFor(questions: Question[], answers: Answers): { steps: Step[]; answers: Answers } {
  const owner = owners(questions)
  const list = ordered(questions)
  let current: Answers = { ...answers }
  let steps: Step[] = []
  for (let pass = 0; pass < 3; pass++) {
    const next: Answers = {}
    steps = []
    for (const q of list) {
      if (!allowed(q.when, current, owner)) continue
      const choices = q.choices.filter((c) => allowed(c.when, current, owner))
      if (!choices.length) continue
      steps.push({ ...q, choices })
      const a = current[q.id]
      if (a && choices.some((c) => c.id === a)) next[q.id] = a
    }
    const stable = JSON.stringify(next) === JSON.stringify(current)
    current = next
    if (stable) break
  }
  return { steps, answers: current }
}

/** Answers with every question that has a single choice on offer filled in, since there's nothing to ask. */
export function withSingles(questions: Question[], answers: Answers): Answers {
  let current = answers
  for (let pass = 0; pass < 5; pass++) {
    const { steps, answers: clean } = stepsFor(questions, current)
    const next = { ...clean }
    for (const s of steps) if (!next[s.id] && s.choices.length === 1) next[s.id] = s.choices[0].id
    if (JSON.stringify(next) === JSON.stringify(current)) return next
    current = next
  }
  return current
}

/** How many different questions a variant's condition names: the more, the more specific. */
const specificity = (v: Variant, owner: Map<string, string>) => new Set(v.when.map((id) => owner.get(id)).filter(Boolean)).size

/**
 * The variants that apply to these answers, most specific first. A variant with no condition
 * (or only deleted choices) never applies.
 */
export function matchingVariants(questions: Question[], variants: Variant[], answers: Answers) {
  const owner = owners(questions)
  return variants
    .map((v, i) => ({ v, i, s: specificity(v, owner) }))
    .filter(({ v, s }) => s > 0 && allowed(v.when, answers, owner))
    .sort((a, b) => b.s - a.s || b.i - a.i)
    .map(({ v }) => v)
}

export type Resolved = {
  steps: Step[]
  answers: Answers
  /** Every step has an answer. */
  complete: boolean
  /** Price before built-in extras (gold plating): a variant's price, or the base price plus choice extras. */
  price: number
  /** Pieces left for this combination; null when nothing limits it. */
  stock: number | null
  /** The variant that holds the stock count, so an order can take pieces from it. */
  stockVariant: Variant | null
  photo: Photo | null
}

export function resolve(base: number, questions: Question[], variants: Variant[], raw: Answers): Resolved {
  const { steps, answers } = stepsFor(questions, raw)
  const complete = steps.every((s) => answers[s.id])
  const matches = matchingVariants(questions, variants, answers)
  const priced = matches.find((v) => v.price !== null)
  const stockVariant = matches.find((v) => v.stock !== null) ?? null

  let price = base
  if (priced) price = priced.price!
  else for (const s of steps) price += s.choices.find((c) => c.id === answers[s.id])?.extra ?? 0

  // Photo: a variant's first, then the latest-asked choice that has one.
  let photo = matches.find((v) => v.photo)?.photo ?? null
  if (!photo) for (const s of steps) photo = s.choices.find((c) => c.id === answers[s.id])?.photo ?? photo

  return { steps, answers, complete, price, stock: stockVariant?.stock ?? null, stockVariant, photo }
}

/** Whether picking `choice` for `question` lands on a combination with nothing left. */
export function choiceSoldOut(questions: Question[], variants: Variant[], answers: Answers, question: string, choice: string) {
  const v = matchingVariants(questions, variants, { ...answers, [question]: choice }).find((x) => x.stock !== null)
  return v ? (v.stock ?? 0) <= 0 : false
}

/** Number shown for a size choice, in cm ("1.5 cm", "٢٫٥ سم", "Small" → null). */
export function sizeCm(label: string): number | null {
  const western = label.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace('٫', '.')
  const m = western.match(/(\d+(?:[.,]\d+)?)\s*(mm|cm|سم|مم)?/i)
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  return /mm|مم/i.test(m[2] ?? '') ? n / 10 : n
}

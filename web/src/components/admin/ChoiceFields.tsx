'use client'

import type { JSONFieldClientComponent } from 'payload'

import { useField, useFormFields, useRowLabel, useTranslation } from '@payloadcms/ui'

const copy = {
  en: {
    always: 'Always',
    help: 'Tick what it depends on. Ticks in the same question mean “or”, ticks in different questions mean “and”.',
    none: 'Add other questions first; their choices appear here.',
    untitled: 'Untitled',
    question: 'Question',
    choice: 'Choice',
    combination: 'Combination',
    price: 'JOD',
    stock: 'in stock',
    clear: 'Clear',
  },
  ar: {
    always: 'دائماً',
    help: 'اختر ما يعتمد عليه. الاختيارات في نفس السؤال تعني «أو»، وفي أسئلة مختلفة تعني «و».',
    none: 'أضف أسئلة أخرى أولاً؛ تظهر اختياراتها هنا.',
    untitled: 'بدون اسم',
    question: 'سؤال',
    choice: 'اختيار',
    combination: 'تركيبة',
    price: 'د.أ',
    stock: 'متوفرة',
    clear: 'مسح',
  },
}

const useCopy = () => {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  return { lang, t: copy[lang] } as const
}

type Q = { index: number; id: string; name: string; choices: { id: string; label: string }[] }

/** The product's questions and choices as they are in the form right now, including unsaved rows. */
function useQuestions(): Q[] {
  return useFormFields(([fields]) => {
    const questions: Q[] = []
    for (const path of Object.keys(fields)) {
      const m = path.match(/^personalization\.options\.(\d+)\.id$/)
      if (!m) continue
      const i = Number(m[1])
      const base = `personalization.options.${i}`
      const choices: Q['choices'] = []
      for (let j = 0; fields[`${base}.choices.${j}.id`]; j++) {
        choices.push({ id: String(fields[`${base}.choices.${j}.id`]?.value ?? ''), label: String(fields[`${base}.choices.${j}.label`]?.value ?? '') })
      }
      questions.push({ index: i, id: String(fields[path]?.value ?? ''), name: String(fields[`${base}.name`]?.value ?? ''), choices })
    }
    return questions.sort((a, b) => a.index - b.index)
  })
}

const asIds = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** "Only ask when…" / "When the customer picks": tick choices of the product's other questions. */
export const ChoiceConditionField: JSONFieldClientComponent = ({ path, field }) => {
  const { lang, t } = useCopy()
  const { value, setValue } = useField<string[] | null>({ path })
  const questions = useQuestions()
  const picked = asIds(value)

  // A question's own choices can't be its condition.
  const own = path.match(/^personalization\.options\.(\d+)\./)
  const others = questions.filter((q) => !own || q.index !== Number(own[1])).filter((q) => q.choices.length)
  const label = typeof field.label === 'object' && field.label ? (field.label as Record<string, string>)[lang] : String(field.label ?? '')

  const toggle = (id: string) => setValue(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  return (
    <div className="field-type bl-when">
      <div className="bl-when__head">
        <span className="field-label">{label}</span>
        <span className="bl-when__state">{picked.length ? null : t.always}</span>
        {picked.length ? (
          <button type="button" className="bl-when__clear" onClick={() => setValue(null)}>
            {t.clear}
          </button>
        ) : null}
      </div>
      {others.length ? (
        <>
          <div className="bl-when__groups">
            {others.map((q) => (
              <div key={q.id} className="bl-when__group">
                <span className="bl-when__q">{q.name || t.untitled}</span>
                <div className="bl-when__chips">
                  {q.choices.map((c) => (
                    <button key={c.id} type="button" className="bl-when__chip" aria-pressed={picked.includes(c.id)} onClick={() => toggle(c.id)}>
                      {c.label || t.untitled}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="bl-when__help">{t.help}</p>
        </>
      ) : (
        <p className="bl-when__help">{t.none}</p>
      )}
    </div>
  )
}

export function QuestionRowLabel() {
  const { t } = useCopy()
  const { data, rowNumber } = useRowLabel<{ name?: string; choices?: unknown[] }>()
  return (
    <span>
      {t.question} {(rowNumber ?? 0) + 1}: {data?.name || t.untitled}
    </span>
  )
}

export function ChoiceRowLabel() {
  const { t } = useCopy()
  const { data } = useRowLabel<{ label?: string; extraPrice?: number }>()
  return (
    <span>
      {data?.label || t.choice}
      {data?.extraPrice ? ` (+${data.extraPrice} ${t.price})` : ''}
    </span>
  )
}

export function VariantRowLabel() {
  const { t } = useCopy()
  const { data, rowNumber } = useRowLabel<{ when?: unknown; price?: number | null; stock?: number | null }>()
  const questions = useQuestions()
  const ids = asIds(data?.when)
  const names = questions.flatMap((q) => q.choices.filter((c) => ids.includes(c.id)).map((c) => c.label)).filter(Boolean)
  const extras = [typeof data?.price === 'number' ? `${data.price} ${t.price}` : '', typeof data?.stock === 'number' ? `${data.stock} ${t.stock}` : ''].filter(Boolean)
  return (
    <span>
      {names.length ? names.join(' + ') : `${t.combination} ${(rowNumber ?? 0) + 1}`}
      {extras.length ? ` · ${extras.join(' · ')}` : ''}
    </span>
  )
}

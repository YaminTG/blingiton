/**
 * Prizes on the bazaar wheel (/[locale]/spin).
 *
 * - `weight`: how likely the prize is, relative to the others (2 is twice as likely as 1).
 * - `big` / `small`: the two lines printed on the wheel slice; keep them short.
 * - `title`: shown on the "you won" card.
 * - `again`: no prize, the visitor spins once more.
 *
 * Slice colours cycle through four fills; the wheel adjusts the last slice so it never matches the first.
 */
export type Prize = {
  id: string
  weight: number
  again?: boolean
  en: { big: string; small: string; title: string }
  ar: { big: string; small: string; title: string }
}

export const prizes: Prize[] = [
  { id: 'voucher10', weight: 30, en: { big: '10 JD', small: 'VOUCHER', title: '10 JD voucher' }, ar: { big: '10 د.أ', small: 'قسيمة', title: 'قسيمة بقيمة 10 دنانير' } },
  { id: 'delivery', weight: 3, en: { big: 'FREE', small: 'DELIVERY', title: 'Free delivery' }, ar: { big: 'توصيل', small: 'مجاني', title: 'توصيل مجاني' } },
  { id: 'off10', weight: 2, en: { big: '10%', small: 'OFF', title: '10% off your order' }, ar: { big: '10%', small: 'خصم', title: 'خصم 10% على طلبك' } },
  { id: 'jd5off', weight: 3, en: { big: '5 JD', small: 'OFF', title: '5 JD off your order' }, ar: { big: '5 د.أ', small: 'خصم', title: 'خصم 5 دنانير على طلبك' } },
  { id: 'second25', weight: 2, en: { big: '25%', small: 'OFF 2ND ITEM', title: 'Buy one item, get 25% off the second' }, ar: { big: '25%', small: 'للقطعة الثانية', title: 'اشترِ قطعة واحصل على خصم 25% على الثانية' } },
]

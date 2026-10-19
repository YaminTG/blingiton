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
  // Weights add up to 100, so each one is the prize's chance in percent.
  { id: 'off15', weight: 4, en: { big: '15%', small: 'OFF', title: '15% off your order' }, ar: { big: '15%', small: 'خصم', title: 'خصم 15% على طلبك' } },
  { id: 'off10', weight: 6, en: { big: '10%', small: 'OFF', title: '10% off your order' }, ar: { big: '10%', small: 'خصم', title: 'خصم 10% على طلبك' } },
  { id: 'delivery', weight: 8, en: { big: 'FREE', small: 'DELIVERY', title: 'Free delivery' }, ar: { big: 'توصيل', small: 'مجاني', title: 'توصيل مجاني' } },
  { id: 'jd5off', weight: 75, en: { big: '5 JD', small: 'VOUCHER', title: '5 JD voucher' }, ar: { big: '5 د.أ', small: 'قسيمة', title: 'قسيمة بقيمة 5 دنانير' } },
  { id: 'next25', weight: 7, en: { big: '25%', small: 'OFF NEXT ITEM', title: 'Buy one, get 25% off your next item' }, ar: { big: '25%', small: 'للقطعة التالية', title: 'اشترِ قطعة واحصل على خصم 25% على القطعة التالية' } },
]

/**
 * Prizes on the bazaar wheel (/[locale]/spin). Placeholders for now.
 *
 * - `weight`: how likely the prize is, relative to the others (2 is twice as likely as 1).
 * - `big` / `small`: the two lines printed on the wheel slice; keep them short.
 * - `title`: shown on the "you won" card.
 * - `again`: no prize, the visitor spins once more.
 *
 * Keep an even number of prizes (a multiple of 4 is best) so neighbouring slices never share a colour.
 */
export type Prize = {
  id: string
  weight: number
  again?: boolean
  en: { big: string; small: string; title: string }
  ar: { big: string; small: string; title: string }
}

export const prizes: Prize[] = [
  { id: 'off10', weight: 2, en: { big: '10%', small: 'OFF', title: '10% off your order' }, ar: { big: '10%', small: 'خصم', title: 'خصم 10% على طلبك' } },
  { id: 'voucher5', weight: 3, en: { big: '5 JD', small: 'VOUCHER', title: '5 JD voucher' }, ar: { big: '5 د.أ', small: 'قسيمة', title: 'قسيمة بقيمة 5 دنانير' } },
  { id: 'off5', weight: 4, en: { big: '5%', small: 'OFF', title: '5% off your order' }, ar: { big: '5%', small: 'خصم', title: 'خصم 5% على طلبك' } },
  { id: 'mystery', weight: 1, en: { big: 'MYSTERY', small: 'GIFT', title: 'A mystery gift' }, ar: { big: 'هدية', small: 'مفاجأة', title: 'هدية مفاجأة' } },
  { id: 'voucher10', weight: 2, en: { big: '10 JD', small: 'VOUCHER', title: '10 JD voucher' }, ar: { big: '10 د.أ', small: 'قسيمة', title: 'قسيمة بقيمة 10 دنانير' } },
  { id: 'again', weight: 2, again: true, en: { big: 'SPIN', small: 'AGAIN', title: 'Free spin!' }, ar: { big: 'لفّة', small: 'إضافية', title: 'لفّة إضافية!' } },
  { id: 'off15', weight: 1, en: { big: '15%', small: 'OFF', title: '15% off your order' }, ar: { big: '15%', small: 'خصم', title: 'خصم 15% على طلبك' } },
  { id: 'voucher20', weight: 1, en: { big: '20 JD', small: 'VOUCHER', title: '20 JD voucher' }, ar: { big: '20 د.أ', small: 'قسيمة', title: 'قسيمة بقيمة 20 ديناراً' } },
]

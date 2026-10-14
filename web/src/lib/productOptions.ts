// Product availability and restock options, shared by the Products collection and the admin list.
// No server imports here: the admin's client components use it too.

import { l } from '@/fields/label'

import type { Picture } from './choices'

export const availabilityOptions = [
  { value: 'made_to_order', label: l('Made to order', 'يُصنع حسب الطلب') },
  { value: 'in_stock', label: l('In stock', 'متوفر') },
  { value: 'sold_out', label: l('Sold out', 'نفدت الكمية') },
] as const

/** The little pictures a choice can show (src/lib/choices.ts `pictures`). */
export const choicePictures: { value: Picture; label: ReturnType<typeof l> }[] = [
  { value: 'silver', label: l('Silver', 'فضي') },
  { value: 'gold', label: l('Gold', 'ذهبي') },
  { value: 'rose', label: l('Rose gold', 'ذهبي وردي') },
  { value: 'black', label: l('Black', 'أسود') },
  { value: 'navy', label: l('Navy', 'كحلي') },
  { value: 'white', label: l('White', 'أبيض') },
  { value: 'pink', label: l('Pink', 'وردي') },
  { value: 'turquoise', label: l('Turquoise', 'فيروزي') },
  { value: 'orange', label: l('Orange', 'برتقالي') },
  { value: 'purple', label: l('Purple', 'بنفسجي') },
  { value: 'red', label: l('Red', 'أحمر') },
  { value: 'green', label: l('Green', 'أخضر') },
  { value: 'blue', label: l('Blue', 'أزرق') },
  { value: 'cable', label: l('Chain: normal links', 'سلسلة: حلقات عادية') },
  { value: 'paperclip', label: l('Chain: paper clip', 'سلسلة: مشبك ورق') },
]

// Whether a piece is a one-off (gone once it sells) or one the shop keeps making / buying again.
export const restockOptions = [
  { value: 'restocked', label: l('Restocked', 'يُعاد توفيرها') },
  { value: 'one_off', label: l('One-off piece', 'قطعة لمرة واحدة') },
] as const

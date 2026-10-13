// Product availability and restock options, shared by the Products collection and the admin list.
// No server imports here: the admin's client components use it too.

import { l } from '@/fields/label'

export const availabilityOptions = [
  { value: 'made_to_order', label: l('Made to order', 'يُصنع حسب الطلب') },
  { value: 'in_stock', label: l('In stock', 'متوفر') },
  { value: 'sold_out', label: l('Sold out', 'نفدت الكمية') },
] as const

// Whether a piece is a one-off (gone once it sells) or one the shop keeps making / buying again.
export const restockOptions = [
  { value: 'restocked', label: l('Restocked', 'يُعاد توفيرها') },
  { value: 'one_off', label: l('One-off piece', 'قطعة لمرة واحدة') },
] as const

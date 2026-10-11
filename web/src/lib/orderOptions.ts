// Order statuses and payment methods, shared by the Orders collection, the admin list and the emails.
// No server imports here: the admin's client components use it too.

import { l } from '@/fields/label'

/** Order numbers continue well past the old WooCommerce ones (~17000), so the two never get mixed up. */
export const FIRST_ORDER_NUMBER = 20001

// Same statuses and meanings as WooCommerce.
export const orderStatuses = [
  { value: 'pending', label: l('Pending payment', 'بانتظار الدفع') },
  { value: 'processing', label: l('Processing', 'قيد التجهيز') },
  { value: 'on-hold', label: l('On hold', 'معلّق') },
  { value: 'completed', label: l('Completed', 'مكتمل') },
  { value: 'cancelled', label: l('Cancelled', 'ملغى') },
  { value: 'refunded', label: l('Refunded', 'مسترد') },
  { value: 'failed', label: l('Failed', 'فشل') },
] as const
export type OrderStatus = (typeof orderStatuses)[number]['value']

export const paymentMethods = [
  { value: 'card_online', label: l('Card online (HyperPay)', 'بطاقة أونلاين (HyperPay)') },
  { value: 'card_on_delivery', label: l('Card on delivery', 'بطاقة عند الاستلام') },
  { value: 'cash', label: l('Cash on delivery', 'نقداً عند الاستلام') },
  { value: 'whatsapp', label: l('Arranged on WhatsApp', 'يُتفق عليه عبر واتساب') },
] as const
export type PaymentMethod = (typeof paymentMethods)[number]['value']

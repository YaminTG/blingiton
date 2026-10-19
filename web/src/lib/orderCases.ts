// Cancellations, returns, exchanges and refunds (collection `order-cases`).
// No server imports here: the admin's client components use it too.

import { l } from '@/fields/label'

export const caseTypes = [
  { value: 'cancellation', label: l('Cancellation', 'إلغاء') },
  { value: 'return', label: l('Return', 'إرجاع') },
  { value: 'exchange', label: l('Exchange', 'استبدال') },
  { value: 'refund', label: l('Refund', 'استرداد') },
] as const

export const caseStatuses = [
  { value: 'open', label: l('Open', 'مفتوح') },
  { value: 'waiting', label: l('Waiting for the piece', 'بانتظار القطعة') },
  { value: 'done', label: l('Done', 'تم') },
  { value: 'declined', label: l('Declined', 'مرفوض') },
] as const

export const caseReasons = [
  { value: 'wrong-item', label: l('We sent the wrong piece or name', 'أرسلنا قطعة أو اسماً خاطئاً') },
  { value: 'damaged', label: l('Arrived damaged or faulty', 'وصلت تالفة أو معيبة') },
  { value: 'size', label: l('Size or length doesn’t fit', 'المقاس أو الطول غير مناسب') },
  { value: 'late', label: l('Took too long', 'تأخر كثيراً') },
  { value: 'not-as-pictured', label: l('Not as pictured', 'ليست كما في الصورة') },
  { value: 'changed-mind', label: l('Changed their mind', 'غيّر رأيه') },
  { value: 'unreachable', label: l('Couldn’t reach them / refused delivery', 'لم نستطع الوصول إليه / رفض الاستلام') },
  { value: 'duplicate', label: l('Duplicate or test order', 'طلب مكرر أو تجريبي') },
  { value: 'other', label: l('Other', 'غير ذلك') },
] as const

export const refundMethods = [
  { value: 'cash', label: l('Cash', 'نقداً') },
  { value: 'card', label: l('Back to the card', 'إلى البطاقة') },
  { value: 'cliq', label: 'CliQ' },
  { value: 'bank', label: l('Bank transfer', 'تحويل بنكي') },
  { value: 'credit', label: l('Store credit', 'رصيد في المتجر') },
] as const

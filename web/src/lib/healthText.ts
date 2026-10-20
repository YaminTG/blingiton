// Wording for shop-health problems (src/lib/healthRules.ts), in English and Arabic: a title that
// says what is happening in sales terms, and what to do. The admin page uses both languages; the
// alert emails go out in English like the other team emails. No server imports.

import type { Detail, Problem, ProblemKind, Tier } from './healthRules'

type Lang = 'en' | 'ar'
type Words = (d: Detail, f: Fmt) => [title: string, todo: string]
type Fmt = { jod: (n: unknown) => string; when: (iso: unknown) => string; status: (n: unknown) => string }

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const n = (v: unknown) => Number(v) || 0

export function formatter(lang: Lang): Fmt {
  const num = new Intl.NumberFormat(lang === 'ar' ? 'ar-JO' : 'en', { maximumFractionDigits: 1 })
  return {
    jod: (v) => `${num.format(n(v))} ${lang === 'ar' ? 'د.أ' : 'JOD'}`,
    when: (v) =>
      v
        ? new Date(String(v)).toLocaleString(lang === 'ar' ? 'ar-JO' : 'en-GB', { timeZone: 'Asia/Amman', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : lang === 'ar'
          ? 'لا يوجد'
          : 'never',
    status: (v) => (n(v) ? `${n(v)}` : lang === 'ar' ? 'لا رد في الوقت المحدد' : 'no answer in time'),
  }
}

const TASKS: Record<string, [string, string]> = {
  'seo-refresh': ['automatic SEO writing', 'كتابة السيو التلقائية'],
  'stuck-orders': ['stuck-order alerts', 'تنبيهات الطلبات المتأخرة'],
  'prune-activity': ['clean-up of old browsing records', 'تنظيف سجلات التصفح القديمة'],
  'shop-health': ['shop health check', 'فحص صحة المتجر'],
}

const en: Record<ProblemKind, Words> = {
  'site-down': (d, f) => [
    'The shop’s pages are not opening',
    `${n(d.pages)} of ${n(d.checked)} pages checked at ${f.when(d.at)} failed (${f.status(d.status)}). Customers can’t buy anything. Call your developer now, and post on Instagram/WhatsApp that orders are open by message meanwhile.`,
  ],
  'checkout-down': (d, f) => [
    'Checkout may be broken: people reach it but no orders come in',
    `${n(d.checkouts)} visits opened checkout since the last order (${f.when(d.lastOrder)})${n(d.errors) ? ` and ${n(d.errors)} hit an error${d.error ? ` (“${s(d.error)}”)` : ''}` : ''}. Place a test order yourself now. If it fails, call your developer and take orders on WhatsApp meanwhile.`,
  ],
  'checkout-errors': (d) => [
    `${n(d.n)} checkout ${n(d.n) === 1 ? 'attempt' : 'attempts'} failed with an error today`,
    `Orders still come through, so it’s intermittent${d.error ? ` (“${s(d.error)}”)` : ''}. Send this to your developer; those customers may have given up.`,
  ],
  'orders-stopped': (d, f) => [
    `No orders for ${n(d.hours)} hours, when you’d usually have about ${n(d.expected)}`,
    `${n(d.checkouts) ? `${n(d.checkouts)} visits reached checkout since, so try a test order.` : 'Nobody reached checkout either, so it may be traffic: check Instagram and any ads are running, and open the shop on your phone.'} Last order: ${f.when(d.lastOrder)}.`,
  ],
  'checkout-refused': (d) => [
    `${n(d.people)} people were turned away at checkout today`,
    `The site refused their order as incomplete, against ${n(d.orders)} orders that went through. That usually means a product’s options changed under someone’s bag, or a bug. Ask your developer to look, and check recently edited products.`,
  ],
  'sold-out-in-bags': (d) => [
    `${n(d.people)} people tried to buy “${s(d.product)}” but it’s sold out`,
    'People still want it. Restock it or make it made-to-order, and stop any ads or posts pointing at it.',
  ],
  'failed-orders': (d) => [
    `${n(d.n)} orders failed or were cancelled today (usually ${n(d.usual)} a day)`,
    'Open them and look for a pattern: the same payment method, product or city. Message those customers on WhatsApp.',
  ],
  'payment-pending': (d) => [
    `${n(d.n)} card ${n(d.n) === 1 ? 'payment' : 'payments'} started but never finished (${s(d.numbers)})`,
    'The customer may have been charged without the order updating, or the payment page failed. Check them in the HyperPay dashboard and message the customers.',
  ],
  'confirmations-missing': (d, f) => [
    `${n(d.n)} ${n(d.n) === 1 ? 'customer hasn’t' : 'customers haven’t'} received their order confirmation (${s(d.numbers)})`,
    `Orders worth ${f.jod(d.worth)} are waiting without a confirmation email, even after an automatic retry${d.error ? `. Error: “${s(d.error)}”` : ''}. Message them on WhatsApp to confirm, and ask your developer to check the email service.`,
  ],
  'email-failing': (d) => [
    `${n(d.n)} ${n(d.n) === 1 ? 'email' : 'emails'} failed to send today`,
    `Order confirmations still go out, but other emails (order updates, review requests) may not${d.error ? `. Error: “${s(d.error)}”` : ''}. Ask your developer to check the email service.`,
  ],
  'no-smtp': () => ['No email service is set up', 'Customers get no order confirmations or updates, and you get no alerts. Ask your developer to set SMTP_HOST.'],
  'page-down': (d) => [
    d.page === 'product' ? `The page for “${s(d.product)}” doesn’t open` : `${s(d.path)} doesn’t open`,
    `${n(d.status) ? `It answered with error ${n(d.status)}` : 'It didn’t answer in time'}${d.from ? ` (linked from ${s(d.from)})` : ''}. ${d.page === 'product' ? 'Check the product is published and its link works; if it was renamed, add a redirect.' : 'Open it yourself; if it fails, send it to your developer.'}`,
  ],
  'image-broken': (d) => [
    d.product ? `Photos of “${s(d.product)}” don’t load` : 'A photo on the site doesn’t load',
    `${n(d.n)} ${n(d.n) === 1 ? 'photo is' : 'photos are'} missing${d.page ? ` on ${s(d.page)}` : ''}. Upload the photo again on the product; people rarely buy what they can’t see.`,
  ],
  'no-price': (d) => [
    `${n(d.n)} live ${n(d.n) === 1 ? 'piece has' : 'pieces have'} no price (${s(d.names)})`,
    'They can be ordered for 0 JOD. Set a price, or switch them back to draft.',
  ],
  'no-photo': (d) => [`${n(d.n)} live ${n(d.n) === 1 ? 'piece has' : 'pieces have'} no photo (${s(d.names)})`, 'Add at least one photo, or switch them back to draft.'],
  'missing-page': (d) => [
    `${n(d.hits)} visits this week landed on a missing page: ${s(d.path)}`,
    d.inside
      ? `A link on your own site (${s(d.inside)}) points there. Fix that link, or add a redirect to the right page.`
      : `They came from ${d.outside ? s(d.outside) : 'an old link'}. Add a redirect (SEO → Redirects) to the right page so they don’t leave.`,
  ],
  backup: (d, f) => [
    {
      'backup-failed': `Last night’s backup failed (${f.when(d.at)})`,
      'backup-stale': `No backup since ${f.when(d.at)}`,
      'backup-setup': 'Backups are not set up properly',
      'restore-failed': 'The latest backup couldn’t be restored in the test',
    }[s(d.what)] ?? 'Backup problem',
    `If the shop’s data were lost today, recent orders would be gone with it${d.error ? `. Error: “${s(d.error)}”` : ''}. Details on the security page; ask your developer to fix it today.`,
  ],
  'jobs-failing': (d) => [
    `The ${TASKS[s(d.task)]?.[0] ?? s(d.task)} failed ${n(d.n)} ${n(d.n) === 1 ? 'time' : 'times'} today`,
    `${d.task === 'stuck-orders' ? 'You won’t hear about late orders until it works again. ' : ''}${d.error ? `Error: “${s(d.error)}”. ` : ''}Send this to your developer.`,
  ],
  'jobs-stopped': (d, f) => [
    'The shop’s background checks aren’t running',
    `Last run: ${f.when(d.at)}. Until they run, nobody is alerted about problems, backups don’t happen and stuck orders aren’t flagged. Ask your developer to check JOBS_AUTORUN or the scheduler.`,
  ],
  'rates-fallback': () => ['Prices abroad use fixed exchange rates', 'Today’s rates couldn’t be fetched, so the fixed backup rates are used. Prices are still charged in JOD; nothing to do unless it lasts days.'],
}

const ar: Record<ProblemKind, Words> = {
  'site-down': (d, f) => [
    'صفحات المتجر لا تفتح',
    `فشلت ${n(d.pages)} من ${n(d.checked)} صفحة فُحصت في ${f.when(d.at)} (${f.status(d.status)}). لا يستطيع العملاء الشراء. اتصل بالمطوّر الآن، وانشر على إنستغرام/واتساب أن الطلب متاح بالرسائل مؤقتاً.`,
  ],
  'checkout-down': (d, f) => [
    'قد تكون صفحة الدفع معطّلة: الناس يصلون إليها ولا تصل طلبات',
    `${n(d.checkouts)} زيارة فتحت صفحة الدفع منذ آخر طلب (${f.when(d.lastOrder)})${n(d.errors) ? ` و${n(d.errors)} واجهت خطأ${d.error ? ` («${s(d.error)}»)` : ''}` : ''}. جرّب طلباً بنفسك الآن. إن فشل فاتصل بالمطوّر واستقبل الطلبات على واتساب مؤقتاً.`,
  ],
  'checkout-errors': (d) => [
    `فشلت ${n(d.n)} محاولة دفع بخطأ اليوم`,
    `الطلبات ما زالت تصل، فالمشكلة متقطعة${d.error ? ` («${s(d.error)}»)` : ''}. أرسل هذا للمطوّر؛ ربما تراجع هؤلاء العملاء.`,
  ],
  'orders-stopped': (d, f) => [
    `لا طلبات منذ ${n(d.hours)} ساعة، والمعتاد حوالي ${n(d.expected)}`,
    `${n(d.checkouts) ? `${n(d.checkouts)} زيارة وصلت صفحة الدفع منذ ذلك، فجرّب طلباً بنفسك.` : 'لم يصل أحد لصفحة الدفع أيضاً، فقد تكون الزيارات: تأكد أن إنستغرام والإعلانات تعمل، وافتح المتجر من هاتفك.'} آخر طلب: ${f.when(d.lastOrder)}.`,
  ],
  'checkout-refused': (d) => [
    `${n(d.people)} أشخاص رُفض طلبهم عند الدفع اليوم`,
    `رفض الموقع طلباتهم لأنها ناقصة، مقابل ${n(d.orders)} طلب نجح. هذا يعني عادة أن خيارات منتج تغيّرت وهي في سلة أحدهم، أو خللاً. اطلب من المطوّر أن يراجع، وراجع المنتجات المعدّلة مؤخراً.`,
  ],
  'sold-out-in-bags': (d) => [`${n(d.people)} أشخاص حاولوا شراء «${s(d.product)}» لكنه نفد`, 'الناس ما زالوا يريدونه. أعد توفيره أو اجعله حسب الطلب، وأوقف أي إعلان أو منشور يشير إليه.'],
  'failed-orders': (d) => [`${n(d.n)} طلبات فشلت أو أُلغيت اليوم (المعتاد ${n(d.usual)} يومياً)`, 'افتحها وابحث عن نمط: نفس طريقة الدفع أو المنتج أو المدينة. راسل هؤلاء العملاء على واتساب.'],
  'payment-pending': (d) => [
    `${n(d.n)} دفعات بالبطاقة بدأت ولم تكتمل (${s(d.numbers)})`,
    'ربما خُصم المبلغ من العميل دون تحديث الطلب، أو فشلت صفحة الدفع. راجعها في لوحة HyperPay وراسل العملاء.',
  ],
  'confirmations-missing': (d, f) => [
    `${n(d.n)} عملاء لم تصلهم رسالة تأكيد الطلب (${s(d.numbers)})`,
    `طلبات بقيمة ${f.jod(d.worth)} بلا رسالة تأكيد حتى بعد إعادة المحاولة تلقائياً${d.error ? `. الخطأ: «${s(d.error)}»` : ''}. راسلهم على واتساب للتأكيد، واطلب من المطوّر فحص خدمة البريد.`,
  ],
  'email-failing': (d) => [
    `فشل إرسال ${n(d.n)} رسائل بريد اليوم`,
    `رسائل تأكيد الطلب ما زالت تصل، لكن غيرها (تحديثات الطلب، طلبات التقييم) قد لا تصل${d.error ? `. الخطأ: «${s(d.error)}»` : ''}. اطلب من المطوّر فحص خدمة البريد.`,
  ],
  'no-smtp': () => ['لا توجد خدمة بريد', 'لا تصل العملاء رسائل تأكيد أو تحديثات، ولا تصلك التنبيهات. اطلب من المطوّر ضبط SMTP_HOST.'],
  'page-down': (d) => [
    d.page === 'product' ? `صفحة «${s(d.product)}» لا تفتح` : `الصفحة ${s(d.path)} لا تفتح`,
    `${n(d.status) ? `ردّت بالخطأ ${n(d.status)}` : 'لم ترد في الوقت المحدد'}${d.from ? ` (رابطها في ${s(d.from)})` : ''}. ${d.page === 'product' ? 'تأكد أن المنتج منشور ورابطه يعمل؛ إن تغيّر اسمه فأضف تحويلاً.' : 'افتحها بنفسك؛ إن لم تعمل فأرسلها للمطوّر.'}`,
  ],
  'image-broken': (d) => [
    d.product ? `صور «${s(d.product)}» لا تظهر` : 'صورة في الموقع لا تظهر',
    `${n(d.n)} صورة مفقودة${d.page ? ` في ${s(d.page)}` : ''}. ارفع الصورة من جديد في المنتج؛ نادراً ما يشتري الناس ما لا يرونه.`,
  ],
  'no-price': (d) => [`${n(d.n)} قطع منشورة بلا سعر (${s(d.names)})`, 'يمكن طلبها بـ 0 دينار. ضع سعراً أو أعدها مسودة.'],
  'no-photo': (d) => [`${n(d.n)} قطع منشورة بلا صورة (${s(d.names)})`, 'أضف صورة واحدة على الأقل أو أعدها مسودة.'],
  'missing-page': (d) => [
    `${n(d.hits)} زيارة هذا الأسبوع وصلت لصفحة غير موجودة: ${s(d.path)}`,
    d.inside
      ? `رابط في موقعك (${s(d.inside)}) يشير إليها. أصلح الرابط أو أضف تحويلاً للصفحة الصحيحة.`
      : `جاؤوا من ${d.outside ? s(d.outside) : 'رابط قديم'}. أضف تحويلاً (السيو ← التحويلات) للصفحة الصحيحة حتى لا يغادروا.`,
  ],
  backup: (d, f) => [
    {
      'backup-failed': `فشل النسخ الاحتياطي الليلة الماضية (${f.when(d.at)})`,
      'backup-stale': `لا نسخة احتياطية منذ ${f.when(d.at)}`,
      'backup-setup': 'النسخ الاحتياطي غير مضبوط كما يجب',
      'restore-failed': 'تعذّرت استعادة آخر نسخة في الاختبار',
    }[s(d.what)] ?? 'مشكلة في النسخ الاحتياطي',
    `لو ضاعت بيانات المتجر اليوم لضاعت معها الطلبات الأخيرة${d.error ? `. الخطأ: «${s(d.error)}»` : ''}. التفاصيل في صفحة الأمان؛ اطلب من المطوّر إصلاحه اليوم.`,
  ],
  'jobs-failing': (d) => [
    `فشلت ${TASKS[s(d.task)]?.[1] ?? s(d.task)} ${n(d.n)} مرات اليوم`,
    `${d.task === 'stuck-orders' ? 'لن تعرف بالطلبات المتأخرة حتى تعمل مجدداً. ' : ''}${d.error ? `الخطأ: «${s(d.error)}». ` : ''}أرسل هذا للمطوّر.`,
  ],
  'jobs-stopped': (d, f) => [
    'فحوصات المتجر في الخلفية لا تعمل',
    `آخر تشغيل: ${f.when(d.at)}. حتى تعمل لن يُنبَّه أحد بالمشاكل، ولن تُعمل نسخ احتياطية، ولن تُكشف الطلبات المتأخرة. اطلب من المطوّر فحص JOBS_AUTORUN أو المجدول.`,
  ],
  'rates-fallback': () => ['أسعار الخارج تستخدم أسعار صرف ثابتة', 'تعذّر جلب أسعار اليوم فاستُخدمت الأسعار الاحتياطية. الدفع ما زال بالدينار؛ لا شيء مطلوب إلا إذا استمر أياماً.'],
}

/** [title, what to do] for a problem. */
export function problemText(p: Pick<Problem, 'kind' | 'detail'>, lang: Lang): [string, string] {
  return (lang === 'ar' ? ar : en)[p.kind](p.detail, formatter(lang))
}

export const TIER_LABEL: Record<Lang, Record<Tier, string>> = {
  en: { emergency: 'Emergency', urgent: 'Today', soon: 'This week', fyi: 'Good to know' },
  ar: { emergency: 'طارئ', urgent: 'اليوم', soon: 'هذا الأسبوع', fyi: 'للعلم' },
}

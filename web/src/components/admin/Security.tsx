import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps, Payload, ServerProps } from 'payload'

import { isAdmin } from '@/access'
import { ACTION_LABELS } from '@/collections/AuditLog'
import type { AuditAction } from '@/lib/audit'
import { backupSize } from '@/lib/backup'
import { needsYou, securityReport, type Check, type Level, type SecurityEvent } from '@/lib/securityCheck'

type Lang = 'en' | 'ar'
type Who = { name?: string | null; email: string }

const nameOf = (u: Who) => u.name || u.email

const copy = {
  en: {
    nav: 'Security',
    title: 'Security',
    intro: 'What needs you, in plain words, and what to do about it. The full technical record is in the audit log.',
    status: {
      critical: (n: number) => `${n} ${n === 1 ? 'thing needs' : 'things need'} you now`,
      warning: (n: number) => `All safe for now. ${n} ${n === 1 ? 'thing' : 'things'} to tidy up`,
      ok: 'All clear',
    },
    needs: 'Needs your attention',
    fine: 'Working as it should',
    whatToDo: 'What to do',
    open: 'Open',
    level: { critical: 'Urgent', warning: 'Check', ok: 'Fine' } as Record<Level, string>,
    check: {
      'no-2fa': (c: { user: Who }) => [`${nameOf(c.user)} hasn’t set up two-factor login`, 'Their account is protected by the password alone until they log in and scan the QR code. If they no longer need the account, delete it.'],
      'few-codes': (c: { user: Who; left: number }) => [`${nameOf(c.user)} has ${c.left} recovery ${c.left === 1 ? 'code' : 'codes'} left`, 'If they lose their phone they may not be able to get in. Reset their two-factor with the recovery script (RESET_2FA=1) so the next login gives ten new codes.'],
      locked: (c: { user: Who; until: string }, d: (s: string) => string) => [`${nameOf(c.user)} is locked out after wrong passwords`, `It opens again at ${d(c.until)}. If it wasn’t them typing, change their password once it opens.`],
      'code-paused': (c: { user: Who }) => [`Code entry is paused for ${nameOf(c.user)}`, 'Someone typed the right password and then many wrong codes. If it wasn’t them, the password is known to someone else: change it now.'],
      'staff-nothing': (c: { user: Who }) => [`${nameOf(c.user)} can’t work on anything yet`, 'This staff account has no areas ticked. Open it and tick what they need (orders, products, customers, settings), or delete it.'],
      'idle-account': (c: { user: Who; lastLogin: string | null }, d: (s: string) => string) => [
        `${nameOf(c.user)} hasn’t logged in ${c.lastLogin ? `since ${d(c.lastLogin)}` : 'yet'}`,
        'Unused accounts are easy targets. Delete it, or make sure the person still needs it.',
      ],
      'backup-setup': (c: { problem: string }) => [
        {
          'no-key': 'Backups are not switched on',
          'short-key': 'The backup key is too short',
          'on-server': 'Backups are stored on the same server as the shop',
          'shared-bucket': 'Backups share the photo storage',
        }[c.problem] ?? 'Backup setup problem',
        {
          'no-key': 'Ask your developer to set BACKUP_KEY (a long random secret kept somewhere safe, like a password manager) and a private backup bucket. See docs/RECOVERY.md.',
          'short-key': 'Ask your developer for a key of at least 24 random characters.',
          'on-server': 'If the server is lost, the backups go with it. Ask your developer to set BACKUP_S3_BUCKET to a separate private bucket.',
          'shared-bucket': 'Ask your developer for a separate private bucket (BACKUP_S3_BUCKET) with versioning or object lock, so nobody can delete backups with the photo keys.',
        }[c.problem] ?? '',
      ],
      'backup-failed': (c: { at: string; error: string }, d: (s: string) => string) => [`The last backup failed (${d(c.at)})`, `Reason: ${c.error}. Fix it today so there’s a fresh safe copy.`],
      'backup-stale': (c: { at: string | null }, d: (s: string) => string) => [
        c.at ? `No backup since ${d(c.at)}` : 'No backup has been made yet',
        'Backups should run every night. Check the jobs are running (JOBS_AUTORUN or the scheduler), or run scripts/backup.ts with NOW=1.',
      ],
      'restore-failed': (c: { at: string; error: string }, d: (s: string) => string) => [`The restore test failed (${d(c.at)})`, `Reason: ${c.error}. Until this is fixed, the backups may not be usable.`],
      'restore-stale': (c: { at: string | null }, d: (s: string) => string) => [
        c.at ? `Backups haven’t been test-restored since ${d(c.at)}` : 'Backups have never been test-restored',
        'A backup only counts once it has been restored. The weekly job does this; or run scripts/backup.ts with TEST=1.',
      ],
      'no-smtp': () => ['Security emails can’t be sent', 'No email service (SMTP) is set up, so alerts only go to the server log. Ask your developer to set SMTP_HOST.'],
      'no-alert-env': () => ['Alert recipients can be changed from inside the admin', 'Alerts go to the admin accounts’ emails. Setting SECURITY_ALERT_EMAILS on the server means someone who got into the admin can’t quietly redirect them.'],
      'many-admins': (c: { count: number }) => [`${c.count} accounts are admins`, 'Every admin can change everything, including the team. Make people staff with just the areas they need.'],
      'audit-broken': (c: { id: number }) => [`The audit log was changed (around entry #${c.id})`, 'An entry doesn’t match its seal, so it was edited or removed in the database, or two were written at once. Run scripts/audit-verify.ts and look closely.'],
      'all-2fa': () => ['Every account has two-factor login', ''],
      'backups-ok': () => ['Backups are running', ''],
      'restore-ok': () => ['The latest backup restored in the test', ''],
      'alerts-ok': () => ['Security emails are set up', ''],
      'audit-ok': () => ['The audit log is intact', ''],
    },
    stats: {
      failed: (days: number) => `Wrong passwords (${days} days)`,
      ips: (n: number) => `from ${n} ${n === 1 ? 'address' : 'addresses'}`,
      places: 'Logins from new places',
      exports: 'Customer exports',
      team: (a: number, s: number) => `${a} admin${a === 1 ? '' : 's'}, ${s} staff`,
      lastBackup: 'Last backup',
      lastTest: 'Last restore test',
      never: 'never',
    },
    events: (days: number) => `Security events (last ${days} days)`,
    eventsNote: (by: string | null, at: string | null) => (at ? `Marked reviewed by ${by} on ${at}. New ones since are highlighted.` : 'New events are highlighted until someone marks them reviewed.'),
    noEvents: 'Nothing happened that needs a look.',
    review: 'Mark all reviewed',
    new: 'New',
    when: 'When',
    what: 'What happened',
    where: 'Where',
    eventTodo: {
      'login.code-blocked': 'Change that account’s password now unless it was them.',
      'login.recovery-code': 'Check with the person: a lost phone is fine. If not them, reset the account with the recovery script.',
      'recovery.script': 'Someone with server access ran it. If nobody on the team did, the server may be compromised.',
      'activity.burst': 'A bulk edit is fine. If not expected, log that account out (recovery script, LOGOUT=1) and check what changed.',
      'backup.failed': 'Fix the backup today; see the error.',
      'backup.restore-test': 'Backups may not restore. Fix before relying on them.',
      'login.locked': 'If it wasn’t them, change the password once it unlocks.',
      'login.code-failed': 'The password was right. If it wasn’t them mistyping, change the password.',
      'login.new-place': 'Travel or a new network is fine. If not them, change the password and log them out.',
      '2fa.enabled': 'Expected for a new teammate or phone. If not, reset the account with the recovery script.',
      'customers.export': 'Make sure someone on the team meant to download customer data.',
      'password.reset': 'Make sure the owner reset it.',
      'password.reset-requested': 'Ignore unless nobody asked for it.',
      team: 'If nobody on the team made this change, check the audit log and the team list.',
    } as Record<string, string>,
    backups: 'Backups',
    backupsNote: 'Encrypted copies of the whole database. Photos live in their own storage.',
    ok: 'OK',
    failed: 'Failed',
    size: 'Size',
    result: 'Result',
    noBackups: 'No backups recorded yet.',
    emergency: 'If something goes wrong',
    emergencyItems: [
      ['Someone lost their phone', 'They log in with a recovery code and set up the new phone. No codes left: your developer runs the recovery script with RESET_2FA=1.'],
      ['Everyone is locked out', 'Your developer runs the recovery script on the server (UNLOCK, NEW_PASSWORD, or CREATE_ADMIN for a fresh admin). Every use is logged and emailed.'],
      ['An account may be in the wrong hands', 'Log it out and change its password (recovery script, LOGOUT=1 NEW_PASSWORD=1), then read its recent entries in the audit log.'],
      ['Data was deleted or the shop was damaged', 'Restore the latest backup into a new database, check it, then switch the shop over. Steps: docs/RECOVERY.md.'],
    ],
    auditLog: 'Open the audit log',
    summary: 'Security',
  },
  ar: {
    nav: 'الأمان',
    title: 'الأمان',
    intro: 'ما يحتاج انتباهك بكلمات بسيطة، وما يجب فعله. السجل التقني الكامل في سجل التدقيق.',
    status: {
      critical: (n: number) => `${n} ${n === 1 ? 'أمر يحتاجك' : 'أمور تحتاجك'} الآن`,
      warning: (n: number) => `كل شيء آمن حالياً. ${n} ${n === 1 ? 'أمر' : 'أمور'} للترتيب`,
      ok: 'كل شيء سليم',
    },
    needs: 'يحتاج انتباهك',
    fine: 'يعمل كما يجب',
    whatToDo: 'ما العمل',
    open: 'فتح',
    level: { critical: 'عاجل', warning: 'للمراجعة', ok: 'سليم' } as Record<Level, string>,
    check: {
      'no-2fa': (c: { user: Who }) => [`${nameOf(c.user)} لم يفعّل التحقق بخطوتين`, 'حسابه محمي بكلمة المرور فقط حتى يسجّل الدخول ويمسح رمز QR. إذا لم يعد يحتاج الحساب فاحذفه.'],
      'few-codes': (c: { user: Who; left: number }) => [`تبقّى لـ ${nameOf(c.user)} ${c.left} من رموز الاسترداد`, 'إذا فقد هاتفه قد لا يتمكن من الدخول. أعد ضبط التحقق بخطوتين بسكربت الاسترداد (RESET_2FA=1) ليحصل على عشرة رموز جديدة.'],
      locked: (c: { user: Who; until: string }, d: (s: string) => string) => [`حساب ${nameOf(c.user)} مقفل بعد كلمات مرور خاطئة`, `يُفتح مجدداً في ${d(c.until)}. إذا لم يكن هو من كتبها فغيّر كلمة المرور عند فتحه.`],
      'code-paused': (c: { user: Who }) => [`إدخال الرموز موقوف لـ ${nameOf(c.user)}`, 'أحدهم كتب كلمة المرور الصحيحة ثم رموزاً خاطئة كثيرة. إذا لم يكن هو، فكلمة المرور معروفة لغيره: غيّرها الآن.'],
      'staff-nothing': (c: { user: Who }) => [`${nameOf(c.user)} لا يستطيع العمل على أي شيء بعد`, 'لم تُحدَّد أي صلاحيات لهذا الموظف. افتح الحساب وحدّد ما يحتاجه (الطلبات، المنتجات، العملاء، الإعدادات) أو احذفه.'],
      'idle-account': (c: { user: Who; lastLogin: string | null }, d: (s: string) => string) => [
        `${nameOf(c.user)} لم يسجّل الدخول ${c.lastLogin ? `منذ ${d(c.lastLogin)}` : 'بعد'}`,
        'الحسابات غير المستخدمة هدف سهل. احذفه أو تأكد أن صاحبه ما زال يحتاجه.',
      ],
      'backup-setup': (c: { problem: string }) => [
        {
          'no-key': 'النسخ الاحتياطي غير مفعّل',
          'short-key': 'مفتاح النسخ الاحتياطي قصير جداً',
          'on-server': 'النسخ الاحتياطية محفوظة على نفس خادم المتجر',
          'shared-bucket': 'النسخ الاحتياطية تشارك تخزين الصور',
        }[c.problem] ?? 'مشكلة في إعداد النسخ الاحتياطي',
        {
          'no-key': 'اطلب من المطوّر ضبط BACKUP_KEY (سر طويل عشوائي يُحفظ في مكان آمن مثل مدير كلمات المرور) ومخزناً خاصاً للنسخ. التفاصيل في docs/RECOVERY.md.',
          'short-key': 'اطلب من المطوّر مفتاحاً من 24 حرفاً عشوائياً على الأقل.',
          'on-server': 'إذا ضاع الخادم ضاعت النسخ معه. اطلب من المطوّر ضبط BACKUP_S3_BUCKET على مخزن خاص منفصل.',
          'shared-bucket': 'اطلب من المطوّر مخزناً خاصاً منفصلاً (BACKUP_S3_BUCKET) مع حفظ الإصدارات أو القفل، حتى لا يمكن حذف النسخ بمفاتيح الصور.',
        }[c.problem] ?? '',
      ],
      'backup-failed': (c: { at: string; error: string }, d: (s: string) => string) => [`فشل آخر نسخ احتياطي (${d(c.at)})`, `السبب: ${c.error}. أصلحه اليوم لتكون هناك نسخة حديثة آمنة.`],
      'backup-stale': (c: { at: string | null }, d: (s: string) => string) => [
        c.at ? `لا نسخة احتياطية منذ ${d(c.at)}` : 'لم تُعمل أي نسخة احتياطية بعد',
        'يجب أن يعمل النسخ كل ليلة. تأكد أن المهام تعمل (JOBS_AUTORUN أو المجدول)، أو شغّل scripts/backup.ts مع NOW=1.',
      ],
      'restore-failed': (c: { at: string; error: string }, d: (s: string) => string) => [`فشل اختبار الاستعادة (${d(c.at)})`, `السبب: ${c.error}. قد لا تكون النسخ صالحة حتى يُصلح هذا.`],
      'restore-stale': (c: { at: string | null }, d: (s: string) => string) => [
        c.at ? `لم تُختبر استعادة النسخ منذ ${d(c.at)}` : 'لم تُختبر استعادة النسخ أبداً',
        'النسخة لا تُعتبر صالحة حتى تُستعاد. المهمة الأسبوعية تفعل ذلك، أو شغّل scripts/backup.ts مع TEST=1.',
      ],
      'no-smtp': () => ['لا يمكن إرسال رسائل الأمان', 'لا توجد خدمة بريد (SMTP)، لذا تذهب التنبيهات إلى سجل الخادم فقط. اطلب من المطوّر ضبط SMTP_HOST.'],
      'no-alert-env': () => ['يمكن تغيير مستلمي التنبيهات من داخل لوحة التحكم', 'تذهب التنبيهات إلى بريد حسابات المدراء. ضبط SECURITY_ALERT_EMAILS على الخادم يمنع من يدخل اللوحة من تحويلها بصمت.'],
      'many-admins': (c: { count: number }) => [`${c.count} حسابات بصلاحية مدير`, 'كل مدير يستطيع تغيير كل شيء بما فيه الفريق. اجعلهم موظفين بالصلاحيات التي يحتاجونها فقط.'],
      'audit-broken': (c: { id: number }) => [`تم تعديل سجل التدقيق (قرب السجل #${c.id})`, 'سجل لا يطابق ختمه، أي أنه عُدّل أو حُذف من قاعدة البيانات أو كُتب سجلان معاً. شغّل scripts/audit-verify.ts وراجع بعناية.'],
      'all-2fa': () => ['كل الحسابات مفعّل لها التحقق بخطوتين', ''],
      'backups-ok': () => ['النسخ الاحتياطي يعمل', ''],
      'restore-ok': () => ['آخر نسخة استُعيدت بنجاح في الاختبار', ''],
      'alerts-ok': () => ['رسائل الأمان مضبوطة', ''],
      'audit-ok': () => ['سجل التدقيق سليم', ''],
    },
    stats: {
      failed: (days: number) => `كلمات مرور خاطئة (${days} يوماً)`,
      ips: (n: number) => `من ${n} عنوان`,
      places: 'دخول من أماكن جديدة',
      exports: 'تصدير العملاء',
      team: (a: number, s: number) => `${a} مدير، ${s} موظف`,
      lastBackup: 'آخر نسخة احتياطية',
      lastTest: 'آخر اختبار استعادة',
      never: 'أبداً',
    },
    events: (days: number) => `أحداث الأمان (آخر ${days} يوماً)`,
    eventsNote: (by: string | null, at: string | null) => (at ? `راجعها ${by} في ${at}. الأحداث الجديدة بعدها مميزة.` : 'الأحداث الجديدة مميزة حتى يراجعها أحد.'),
    noEvents: 'لم يحدث ما يستدعي المراجعة.',
    review: 'تمت مراجعة الكل',
    new: 'جديد',
    when: 'الوقت',
    what: 'ما حدث',
    where: 'المكان',
    eventTodo: {
      'login.code-blocked': 'غيّر كلمة مرور الحساب الآن إلا إذا كان صاحبه.',
      'login.recovery-code': 'تحقق مع صاحب الحساب: فقدان الهاتف أمر طبيعي. إن لم يكن هو فأعد ضبط الحساب بسكربت الاسترداد.',
      'recovery.script': 'شغّله شخص لديه وصول للخادم. إن لم يكن من الفريق فقد يكون الخادم مخترقاً.',
      'activity.burst': 'التعديل الجماعي طبيعي. إن لم يكن متوقعاً فأخرج الحساب (سكربت الاسترداد، LOGOUT=1) وراجع ما تغيّر.',
      'backup.failed': 'أصلح النسخ الاحتياطي اليوم؛ راجع الخطأ.',
      'backup.restore-test': 'قد لا تُستعاد النسخ. أصلح قبل الاعتماد عليها.',
      'login.locked': 'إن لم يكن صاحبه فغيّر كلمة المرور عند فتح الحساب.',
      'login.code-failed': 'كلمة المرور كانت صحيحة. إن لم يكن خطأ من صاحبه فغيّرها.',
      'login.new-place': 'السفر أو شبكة جديدة أمر طبيعي. إن لم يكن هو فغيّر كلمة المرور وأخرجه.',
      '2fa.enabled': 'متوقع لزميل جديد أو هاتف جديد. وإلا فأعد ضبط الحساب بسكربت الاسترداد.',
      'customers.export': 'تأكد أن أحداً من الفريق قصد تنزيل بيانات العملاء.',
      'password.reset': 'تأكد أن صاحب الحساب هو من غيّرها.',
      'password.reset-requested': 'تجاهله إلا إذا لم يطلبه أحد.',
      team: 'إن لم يقم أحد من الفريق بهذا التغيير فراجع سجل التدقيق وقائمة الفريق.',
    } as Record<string, string>,
    backups: 'النسخ الاحتياطية',
    backupsNote: 'نسخ مشفّرة من قاعدة البيانات كاملة. الصور في تخزين منفصل.',
    ok: 'تمت',
    failed: 'فشلت',
    size: 'الحجم',
    result: 'النتيجة',
    noBackups: 'لا نسخ مسجّلة بعد.',
    emergency: 'إذا حدث خطأ',
    emergencyItems: [
      ['أحدهم فقد هاتفه', 'يدخل برمز استرداد ويعدّ الهاتف الجديد. إن نفدت الرموز يشغّل المطوّر سكربت الاسترداد مع RESET_2FA=1.'],
      ['الجميع لا يستطيع الدخول', 'يشغّل المطوّر سكربت الاسترداد على الخادم (UNLOCK أو NEW_PASSWORD أو CREATE_ADMIN لمدير جديد). كل استخدام يُسجَّل ويُرسل بالبريد.'],
      ['حساب ربما وقع في يد غريبة', 'أخرجه وغيّر كلمة مروره (سكربت الاسترداد، LOGOUT=1 NEW_PASSWORD=1)، ثم راجع سجلاته الأخيرة في سجل التدقيق.'],
      ['حُذفت بيانات أو تضرر المتجر', 'استعد آخر نسخة في قاعدة بيانات جديدة، تحقق منها، ثم حوّل المتجر إليها. الخطوات في docs/RECOVERY.md.'],
    ],
    auditLog: 'فتح سجل التدقيق',
    summary: 'الأمان',
  },
}

const langOf = (i18n: ServerProps['i18n']): Lang => (i18n.language === 'ar' ? 'ar' : 'en')
const dateTime = (lang: Lang) => (iso: string) =>
  new Date(iso).toLocaleString(lang === 'ar' ? 'ar-JO' : 'en-GB', { timeZone: 'Asia/Amman', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function checkText(c: Check, lang: Lang): [string, string] {
  const t = copy[lang].check as Record<string, (c: never, d: (s: string) => string) => string[]>
  const [title, action] = t[c.kind](c as never, dateTime(lang))
  return [title, action]
}

function userLink(c: Check, admin: string) {
  if ('user' in c) return `${admin}/collections/users/${c.user.id}`
  if (c.kind === 'audit-broken') return `${admin}/collections/audit-log/${c.id}`
  return null
}

/** In the side menu, for admins. */
export function SecurityNavLink({ i18n, payload, user }: ServerProps) {
  if (!isAdmin(user)) return null
  return (
    <a className="nav__link bl-navlink" href={`${payload.config.routes.admin}/security`}>
      <span className="nav__link-label">{copy[langOf(i18n)].nav}</span>
    </a>
  )
}

/** The admin home's security line (admins only): all clear, or how many things need someone. */
export async function SecuritySummary({ payload, lang, admin }: { payload: Payload; lang: Lang; admin: string }) {
  const t = copy[lang]
  const n = needsYou(await securityReport(payload))
  const level: Level = n.critical ? 'critical' : n.warning ? 'warning' : 'ok'
  return (
    <a className={`bl-sec-strip bl-sec-strip--${level}`} href={`${admin}/security`}>
      <strong>{t.summary}:</strong> {level === 'critical' ? t.status.critical(n.critical) : level === 'warning' ? t.status.warning(n.warning) : t.status.ok}
      {n.fresh ? <span className="bl-sec-chip bl-sec-chip--new">{`${t.new}: ${n.fresh}`}</span> : null}
      <span aria-hidden> →</span>
    </a>
  )
}

function EventRow({ e, lang }: { e: SecurityEvent; lang: Lang }) {
  const t = copy[lang]
  return (
    <tr className={e.isNew ? 'is-new' : undefined}>
      <td className="bl-sec-when">
        {dateTime(lang)(e.at)}
        {e.isNew ? <span className="bl-sec-chip bl-sec-chip--new">{t.new}</span> : null}
      </td>
      <td>
        <span className={`bl-sec-chip bl-sec-chip--${e.level}`}>{ACTION_LABELS[e.action as AuditAction]?.[lang] ?? e.action}</span>
        <div className="bl-sec-summary" dir="ltr">
          {e.summary}
        </div>
        <div className="bl-sec-todo">{t.eventTodo[e.team ? 'team' : e.action] ?? ''}</div>
      </td>
      <td className="bl-sec-where" dir="ltr">
        {e.location ?? ''}
        {e.ip ? <small>{e.ip}</small> : null}
      </td>
    </tr>
  )
}

/** /admin/security: the security incident dashboard (admins only). */
export async function Security({ initPageResult, i18n, locale, params, payload, permissions, searchParams, user }: AdminViewServerProps) {
  const admin = payload.config.routes.admin
  if (!initPageResult.req.user) redirect(`${admin}/login?redirect=${encodeURIComponent(`${admin}/security`)}`)
  if (!isAdmin(initPageResult.req.user)) redirect(admin)
  const lang = langOf(i18n)
  const t = copy[lang]
  const d = dateTime(lang)
  const r = await securityReport(payload)
  const n = needsYou(r)
  const level: Level = n.critical ? 'critical' : n.warning ? 'warning' : 'ok'
  const open = r.checks.filter((c) => c.level !== 'ok')
  const fine = r.checks.filter((c) => c.level === 'ok')
  const lastBackup = r.backups.find((b) => b.ok)
  const lastTest = r.restoreTests[0]

  return (
    <DefaultTemplate
      i18n={i18n}
      locale={locale}
      params={params}
      payload={payload}
      permissions={permissions}
      req={initPageResult.req}
      searchParams={searchParams}
      user={user}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <section className="bl-dash bl-sec" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <header className="bl-insights__head">
            <div>
              <h2>{t.title}</h2>
              <p>{t.intro}</p>
            </div>
            <a className="bl-btn" href={`${admin}/collections/audit-log`}>
              {t.auditLog} →
            </a>
          </header>

          <div className={`bl-sec-status bl-sec-status--${level}`} role="status">
            {level === 'critical' ? t.status.critical(n.critical) : level === 'warning' ? t.status.warning(n.warning) : t.status.ok}
          </div>

          {open.length ? (
            <div className="bl-card">
              <h3>{t.needs}</h3>
              <ul className="bl-sec-checks">
                {open.map((c, i) => {
                  const [title, action] = checkText(c, lang)
                  const link = userLink(c, admin)
                  return (
                    <li key={i} className={`bl-sec-check bl-sec-check--${c.level}`}>
                      <span className={`bl-sec-chip bl-sec-chip--${c.level}`}>{t.level[c.level]}</span>
                      <div>
                        <strong>{title}</strong>
                        {action ? (
                          <p>
                            <b>{t.whatToDo}:</b> {action}
                          </p>
                        ) : null}
                      </div>
                      {link ? (
                        <a className="bl-btn" href={link}>
                          {t.open}
                        </a>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          <div className="bl-dash__stats">
            <a className="bl-stat" href={`${admin}/collections/audit-log?where[action][equals]=login.failed`}>
              <span className="bl-stat__value">{r.stats.failedLogins}</span>
              <span className="bl-stat__label">
                {t.stats.failed(r.days)} · {t.stats.ips(r.stats.failedIps)}
              </span>
            </a>
            <a className="bl-stat" href={`${admin}/collections/audit-log?where[action][equals]=login.new-place`}>
              <span className="bl-stat__value">{r.stats.newPlaces}</span>
              <span className="bl-stat__label">{t.stats.places}</span>
            </a>
            <a className="bl-stat" href={`${admin}/collections/audit-log?where[action][equals]=customers.export`}>
              <span className="bl-stat__value">{r.stats.exports}</span>
              <span className="bl-stat__label">{t.stats.exports}</span>
            </a>
            <a className="bl-stat" href={`${admin}/collections/users`}>
              <span className="bl-stat__value">{r.stats.admins + r.stats.staff}</span>
              <span className="bl-stat__label">{t.stats.team(r.stats.admins, r.stats.staff)}</span>
            </a>
            <div className={`bl-stat bl-stat--${lastBackup ? 'good' : 'poor'}`}>
              <span className="bl-stat__value bl-stat__value--small">{lastBackup ? d(lastBackup.at) : t.stats.never}</span>
              <span className="bl-stat__label">{t.stats.lastBackup}</span>
            </div>
            <div className={`bl-stat bl-stat--${lastTest?.ok ? 'good' : lastTest ? 'poor' : 'fair'}`}>
              <span className="bl-stat__value bl-stat__value--small">{lastTest ? d(lastTest.at) : t.stats.never}</span>
              <span className="bl-stat__label">{t.stats.lastTest}</span>
            </div>
          </div>

          <div className="bl-card">
            <div className="bl-sec-head">
              <h3>{t.events(r.days)}</h3>
              {r.events.some((e) => e.isNew) ? (
                <form method="post" action={`${payload.config.routes.api}/globals/security-state/reviewed`}>
                  <button type="submit" className="bl-btn bl-btn--primary">
                    {t.review}
                  </button>
                </form>
              ) : null}
            </div>
            <p className="bl-note">{t.eventsNote(r.reviewedBy, r.reviewedUntil ? d(r.reviewedUntil) : null)}</p>
            {r.events.length ? (
              <table className="bl-table bl-sec-events">
                <thead>
                  <tr>
                    <th scope="col">{t.when}</th>
                    <th scope="col">{t.what}</th>
                    <th scope="col">{t.where}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.events.map((e) => (
                    <EventRow key={e.id} e={e} lang={lang} />
                  ))}
                </tbody>
              </table>
            ) : (
              <p>{t.noEvents}</p>
            )}
          </div>

          <div className="bl-dash__grid">
            <div className="bl-card">
              <h3>{t.backups}</h3>
              <p className="bl-note">{t.backupsNote}</p>
              {r.backups.length ? (
                <table className="bl-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.when}</th>
                      <th scope="col">{t.result}</th>
                      <th scope="col">{t.size}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.backups.slice(0, 7).map((b) => (
                      <tr key={b.at}>
                        <td>{d(b.at)}</td>
                        <td>
                          <span className={`bl-sec-chip bl-sec-chip--${b.ok ? 'ok' : 'critical'}`}>{b.ok ? t.ok : t.failed}</span>
                          {b.error ? <div className="bl-sec-todo">{b.error}</div> : null}
                        </td>
                        <td>{b.size ? backupSize(b.size) : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>{t.noBackups}</p>
              )}
            </div>

            <div className="bl-card">
              <h3>{t.fine}</h3>
              <ul className="bl-sec-fine">
                {fine.map((c) => (
                  <li key={c.kind}>{checkText(c, lang)[0]}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bl-card">
            <h3>{t.emergency}</h3>
            <dl className="bl-sec-emergency">
              {t.emergencyItems.map(([q, a]) => (
                <div key={q}>
                  <dt>{q}</dt>
                  <dd>{a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </Gutter>
    </DefaultTemplate>
  )
}

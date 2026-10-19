import type { CollectionConfig } from 'payload'

import { admins } from '@/access'
import { l } from '@/fields/label'
import { AUDIT_ACTIONS } from '@/lib/audit'

export const ACTION_LABELS: Record<(typeof AUDIT_ACTIONS)[number], { en: string; ar: string }> = {
  'login.password-ok': l('Password accepted, waiting for code', 'كلمة المرور صحيحة، بانتظار الرمز'),
  'login.success': l('Logged in', 'تسجيل دخول'),
  'login.failed': l('Wrong password', 'كلمة مرور خاطئة'),
  'login.locked': l('Account locked', 'قفل الحساب'),
  'login.code-failed': l('Wrong two-factor code', 'رمز تحقق خاطئ'),
  'login.code-blocked': l('Code entry paused', 'إيقاف إدخال الرموز مؤقتًا'),
  'login.recovery-code': l('Recovery code used', 'استخدام رمز استرداد'),
  'login.cancelled': l('Login cancelled', 'إلغاء تسجيل الدخول'),
  logout: l('Logged out', 'تسجيل خروج'),
  'password.reset-requested': l('Password reset requested', 'طلب إعادة تعيين كلمة المرور'),
  'password.reset': l('Password reset', 'إعادة تعيين كلمة المرور'),
  'login.new-place': l('Login from a new place', 'دخول من مكان جديد'),
  '2fa.enabled': l('Two-factor set up', 'تفعيل التحقق بخطوتين'),
  'recovery.script': l('Recovery script', 'سكربت الاسترداد'),
  'customers.export': l('Customers exported', 'تصدير العملاء'),
  'customers.forget': l('Customer browsing erased', 'حذف تصفح عميل'),
  'activity.burst': l('Many changes at once', 'تعديلات كثيرة دفعة واحدة'),
  'security.reviewed': l('Security events reviewed', 'مراجعة أحداث الأمان'),
  'backup.ok': l('Backup made', 'نسخة احتياطية'),
  'backup.failed': l('Backup failed', 'فشل النسخ الاحتياطي'),
  'backup.restore-test': l('Restore test', 'اختبار الاستعادة'),
  create: l('Created', 'إنشاء'),
  update: l('Changed', 'تعديل'),
  delete: l('Deleted', 'حذف'),
}

// Written only by the server (src/lib/audit.ts). Admins can read it; nobody can add, change or
// delete entries through the admin or the API.
export const AuditLog: CollectionConfig = {
  slug: 'audit-log',
  labels: { singular: l('Audit entry', 'سجل تدقيق'), plural: l('Audit log', 'سجل التدقيق') },
  admin: {
    group: l('Team', 'الفريق'),
    useAsTitle: 'summary',
    defaultColumns: ['at', 'action', 'summary', 'ip', 'location'],
    description: l(
      'Logins, two-factor events and every change made by the team. Entries can’t be edited or deleted.',
      'تسجيلات الدخول وأحداث التحقق بخطوتين وكل تعديل يقوم به الفريق. لا يمكن تعديل السجلات أو حذفها.',
    ),
    listSearchableFields: ['summary', 'actorEmail', 'ip'],
  },
  defaultSort: '-at',
  access: { read: admins, create: () => false, update: () => false, delete: () => false },
  indexes: [{ fields: ['at'] }],
  fields: [
    { name: 'at', type: 'date', required: true, index: true, label: l('When', 'الوقت'), admin: { date: { pickerAppearance: 'dayAndTime' }, readOnly: true } },
    {
      name: 'action',
      type: 'select',
      required: true,
      index: true,
      label: l('What', 'الحدث'),
      options: AUDIT_ACTIONS.map((value) => ({ value, label: ACTION_LABELS[value] })),
      admin: { readOnly: true },
    },
    { name: 'summary', type: 'text', required: true, label: l('Summary', 'الملخص'), admin: { readOnly: true } },
    { name: 'actor', type: 'relationship', relationTo: 'users', label: l('Person', 'الشخص'), admin: { readOnly: true } },
    // Kept as text too, so the entry still says who it was after their account is deleted.
    { name: 'actorEmail', type: 'text', index: true, label: l('Email', 'البريد'), admin: { readOnly: true } },
    { name: 'target', type: 'text', label: l('Item', 'العنصر'), admin: { readOnly: true } },
    { name: 'ip', type: 'text', index: true, label: l('IP address', 'عنوان IP'), admin: { readOnly: true } },
    { name: 'location', type: 'text', label: l('Location', 'الموقع'), admin: { readOnly: true } },
    { name: 'agent', type: 'text', label: l('Browser', 'المتصفح'), admin: { readOnly: true } },
    { name: 'detail', type: 'json', label: l('Details', 'التفاصيل'), admin: { readOnly: true } },
    // The hash chain (see src/lib/audit.ts).
    { name: 'prev', type: 'text', admin: { hidden: true } },
    { name: 'hash', type: 'text', admin: { hidden: true } },
  ],
}

'use client'

import { useAuth, useConfig, useTranslation } from '@payloadcms/ui'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

import type { User } from '@/payload-types'

const copy = {
  en: {
    insights: 'Customer insights',
    export: 'Export CSV',
    exportHelp: 'Downloads the customers shown here (current filter and search). Every export is written to the audit log.',
    forget: 'Stop browsing insights and erase history',
    confirm: 'Stop recording this customer’s browsing on every device and delete everything recorded so far? Their orders are kept.',
    failed: 'That didn’t work. Please try again.',
  },
  ar: {
    insights: 'تحليلات العملاء',
    export: 'تصدير CSV',
    exportHelp: 'يُنزّل العملاء الظاهرين هنا (حسب التصفية والبحث الحاليين). يُسجَّل كل تصدير في سجل التدقيق.',
    forget: 'أوقف تحليل التصفح واحذف السجل',
    confirm: 'إيقاف تسجيل تصفح هذا العميل على كل أجهزته وحذف كل ما سُجّل حتى الآن؟ تبقى طلباته كما هي.',
    failed: 'لم ينجح ذلك. حاول مرة أخرى.',
  },
}

/** Above the customers list: a link to the insights page and, for admins, the CSV export of what the list shows. */
export function CustomerListTools() {
  const { i18n } = useTranslation()
  const { user } = useAuth<User>()
  const { config } = useConfig()
  const params = useSearchParams()
  const t = copy[i18n.language === 'ar' ? 'ar' : 'en']
  const query = new URLSearchParams()
  for (const [k, v] of params) if (k.startsWith('where') || k === 'search' || k === 'sort') query.append(k, v)
  const qs = query.toString()

  return (
    <div className="bl-listtools">
      <a className="bl-btn" href={`${config.routes.admin}/customer-insights`}>
        {t.insights} →
      </a>
      {user?.role === 'admin' ? (
        <a className="bl-btn" href={`${config.routes.api}/customers/export${qs ? `?${qs}` : ''}`} title={t.exportHelp} download>
          ⤓ {t.export}
        </a>
      ) : null}
    </div>
  )
}

/** On a customer's Insights tab (admins): withdraws their consent on every device and erases what was recorded. */
export function ForgetCustomerButton({ id, lang }: { id: number; lang: 'en' | 'ar' }) {
  const t = copy[lang]
  const { config } = useConfig()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function forget() {
    if (!window.confirm(t.confirm)) return
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch(`${config.routes.api}/customers/${id}/forget`, { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error(String(res.status))
      router.refresh()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <p>
      <button type="button" className="bl-btn" onClick={forget} disabled={busy} aria-busy={busy || undefined}>
        {t.forget}
      </button>
      {failed ? <span role="alert"> {t.failed}</span> : null}
    </p>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import type { Locale } from '@/lib/locales'

// Same page, other language: swaps only the first path segment.
export function LangSwitch({ locale, label, title }: { locale: Locale; label: string; title: string }) {
  const pathname = usePathname() || `/${locale}`
  const other: Locale = locale === 'ar' ? 'en' : 'ar'
  const href = pathname.replace(/^\/(en|ar)(?=\/|$)/, `/${other}`)
  return (
    <Link className="lang-btn" href={href} hrefLang={other} lang={other} aria-label={title}>
      {label}
    </Link>
  )
}

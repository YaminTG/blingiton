import type { Metadata } from 'next'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { notFound } from 'next/navigation'

import { getPage } from '@/lib/data'
import { isLocale } from '@/lib/locales'
import { alternates, paths } from '@/lib/urls'

type Props = { params: Promise<{ locale: string; page: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, page: slug } = await params
  if (!isLocale(locale)) return {}
  const page = await getPage(locale, slug)
  if (!page) return {}
  return {
    title: { absolute: page.meta?.title || `${page.title} | Blingiton` },
    description: page.meta?.description || undefined,
    alternates: alternates(locale, (l) => paths.page(l, slug)),
  }
}

export default async function ContentPage({ params }: Props) {
  const { locale, page: slug } = await params
  if (!isLocale(locale)) notFound()
  const page = await getPage(locale, slug)
  if (!page) notFound()
  return (
    <>
      <section className="shop-head">
        <div className="wrap">
          <h1>{page.title}</h1>
        </div>
      </section>
      <div className="wrap prose">{page.content ? <RichText data={page.content} /> : null}</div>
    </>
  )
}

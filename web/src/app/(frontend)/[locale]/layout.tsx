import type { Metadata, Viewport } from 'next'
import { Amiri, Aref_Ruqaa, Great_Vibes, Noto_Kufi_Arabic, Nunito_Sans, Playfair_Display, Reem_Kufi, Tajawal } from 'next/font/google'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { Icon } from '@/components/Icon'
import { LangSwitch } from '@/components/LangSwitch'
import { BagButton, Drawers, MenuButton } from '@/components/store/Chrome'
import { CurrencyPicker } from '@/components/store/Money'
import { StoreProvider } from '@/components/store/StoreProvider'
import { CURRENCY_COOKIE } from '@/lib/currency'
import { getPage, getSettings, listCategories } from '@/lib/data'
import { dictionary } from '@/lib/dictionary'
import { dirOf, isLocale, locales } from '@/lib/locales'
import { getRates } from '@/lib/rates'
import { isProduction, serverUrl } from '@/lib/site'
import { paths } from '@/lib/urls'

import '../site.css'
import '../frontend.css'

// Page text
const nunito = Nunito_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-latin' })
// Only the weights the CSS uses (600 falls back to 700); each one is preloaded on every page.
// Latin too: Arabic pages show prices and "Blingiton" in Tajawal, and without the preload those
// files were found only after the CSS (~0.9 s later first paint on a slow phone).
const tajawal = Tajawal({ subsets: ['arabic', 'latin'], weight: ['400', '700', '800'], display: 'swap', variable: '--font-arabic' })
// Lettering for the name previews; not preloaded, only downloaded when a preview draws with it.
// (next/font needs each call written out in full, so the options are repeated.)
const scriptEn = Great_Vibes({ display: 'swap', preload: false, subsets: ['latin'], weight: '400', variable: '--font-script-en' })
const scriptAr = Aref_Ruqaa({ display: 'swap', preload: false, subsets: ['arabic'], weight: '700', variable: '--font-script-ar' })
const classicEn = Playfair_Display({ display: 'swap', preload: false, subsets: ['latin'], weight: '600', style: 'italic', variable: '--font-classic-en' })
const classicAr = Amiri({ display: 'swap', preload: false, subsets: ['arabic'], weight: '700', variable: '--font-classic-ar' })
const modernAr = Reem_Kufi({ display: 'swap', preload: false, subsets: ['arabic'], weight: '700', variable: '--font-modern-ar' })
const kufi = Noto_Kufi_Arabic({ display: 'swap', preload: false, subsets: ['arabic', 'latin'], weight: '300', variable: '--font-kufi' })
const fontVars = [nunito, tajawal, scriptEn, scriptAr, classicEn, classicAr, modernAr, kufi].map((f) => f.variable).join(' ')

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return {
    metadataBase: new URL(serverUrl),
    title: { default: 'Blingiton', template: '%s' },
    // Only the live store may be indexed; every other environment says noindex.
    robots: isProduction ? { index: true, follow: true } : { index: false, follow: false },
    // Small copies of the logo: every visit fetches the icon, and logo.png is 465 KB. Google wants a multiple of 48px.
    icons: { icon: { url: '/icon-96.png', sizes: '96x96', type: 'image/png' }, apple: '/apple-icon.png' },
    openGraph: { siteName: 'Blingiton', locale: locale === 'ar' ? 'ar_JO' : 'en_US', type: 'website' },
  }
}

export const viewport: Viewport = { themeColor: '#F8D3DA', viewportFit: 'cover' }

// Pages are rendered in JOD. For a visitor whose currency cookie says otherwise, mark <html> before
// the first paint so frontend.css hides prices until <Price> has converted them (no JOD flash).
const currencyScript = `try{var m=document.cookie.match(/(?:^|; )${CURRENCY_COOKIE}=([A-Z]{3})/);if(m&&m[1]!=='JOD')document.documentElement.dataset.cur=m[1]}catch(e){}`

// 962796384424 → +962 79 638 4424
const phoneLabel = (digits: string) => (/^962\d{9}$/.test(digits) ? `+962 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}` : `+${digits}`)
const instagramHandle = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? ''

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = dictionary(locale)
  const [settings, categories, deliveryPage, carePage, rates] = await Promise.all([
    getSettings(locale),
    listCategories(locale),
    getPage(locale, 'delivery'),
    getPage(locale, 'silver-care'),
    getRates(),
  ])
  const topLevel = categories.filter((c) => !c.parent)
  const menu = topLevel.filter((c) => c.inMenu)
  const footerShop = topLevel.filter((c) => c.showOnHome).slice(0, 4)
  const whatsapp = settings.whatsapp ? `https://wa.me/${settings.whatsapp}` : null
  const instagram = settings.social?.instagram || null
  const custom = `${paths.home(locale)}#custom`

  const navLinks = [
    { href: paths.shop(locale), label: t.shop },
    ...menu.map((c) => ({ href: paths.category(locale, c.slug ?? ''), label: c.name })),
    { href: custom, label: t.customOrders },
  ]

  return (
    // suppressHydrationWarning: the script below marks <html> before React loads.
    <html lang={locale} dir={dirOf(locale)} className={fontVars} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: currencyScript }} />
      </head>
      <body data-metal="silver">
        <StoreProvider locale={locale} addedText={t.added} rates={rates}>
          <a className="skip" href="#main">
            {t.skip}
          </a>
          <div className="announce">
            <div className="wrap">
              <span>{t.announce[0]}</span>
              <span className="wide">{t.announce[1]}</span>
              <span className="wide">{t.announce[2]}</span>
            </div>
          </div>
          <header className="header">
            <div className="wrap">
              <MenuButton label={t.menu} />
              <Link className="brand" href={paths.home(locale)} aria-label={t.homeLabel}>
                <Image src="/logo.png" alt="" width={52} height={52} loading="eager" />
                <span>BLINGITON</span>
              </Link>
              <nav className="nav" aria-label={t.menu}>
                {navLinks.map((l) => (
                  <Link key={l.href} href={l.href}>
                    {l.label}
                  </Link>
                ))}
              </nav>
              <div className="tools">
                <CurrencyPicker />
                <LangSwitch locale={locale} label={t.language} title={t.languageLabel} />
                <Link className="icon-btn" href={paths.shop(locale)} aria-label={t.search}>
                  <Icon name="search" />
                </Link>
                <BagButton />
              </div>
            </div>
          </header>

          <main id="main">{children}</main>

          <footer className="footer">
            <div className="wrap">
              <div>
                <div className="footer-brand">
                  <Image src="/logo.png" alt="" width={64} height={64} />
                  <strong className="footer-name">BLINGITON</strong>
                </div>
                <p className="footer-tag">{t.footerTag}</p>
              </div>
              <div>
                <h3>{t.shop}</h3>
                <ul>
                  {footerShop.map((c) => (
                    <li key={c.id}>
                      <Link href={paths.category(locale, c.slug ?? '')}>{c.name}</Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>{t.help}</h3>
                <ul>
                  {deliveryPage ? (
                    <li>
                      <Link href={paths.page(locale, 'delivery')}>{deliveryPage.title}</Link>
                    </li>
                  ) : null}
                  {carePage ? (
                    <li>
                      <Link href={paths.page(locale, 'silver-care')}>{carePage.title}</Link>
                    </li>
                  ) : null}
                  {whatsapp ? (
                    <li>
                      <a href={whatsapp} target="_blank" rel="noopener">
                        {t.trackOrder}
                      </a>
                    </li>
                  ) : null}
                  <li>
                    <Link href={custom}>{t.customOrders}</Link>
                  </li>
                </ul>
              </div>
              <div>
                <h3>{t.contact}</h3>
                <ul>
                  {whatsapp && settings.whatsapp ? (
                    <li>
                      <a href={whatsapp} target="_blank" rel="noopener">
                        WhatsApp <bdi dir="ltr">{phoneLabel(settings.whatsapp)}</bdi>
                      </a>
                    </li>
                  ) : null}
                  {instagram ? (
                    <li>
                      <a href={instagram} target="_blank" rel="noopener">
                        Instagram <bdi dir="ltr">@{instagramHandle(instagram)}</bdi>
                      </a>
                    </li>
                  ) : null}
                  <li>{t.jordan}</li>
                </ul>
              </div>
              <p className="small">© {new Date().getFullYear()} Blingiton</p>
            </div>
          </footer>
          {whatsapp ? (
            <a className="wa" href={whatsapp} target="_blank" rel="noopener" aria-label={t.orderOnWhatsApp}>
              <Icon name="whatsapp" />
              <span>{t.orderOnWhatsApp}</span>
            </a>
          ) : null}
          <Drawers links={[{ href: paths.home(locale), label: t.home }, ...navLinks]} />
        </StoreProvider>
      </body>
    </html>
  )
}

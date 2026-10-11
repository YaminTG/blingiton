import Image from 'next/image'
import Link from 'next/link'

// Rendered inside the [locale] layout without access to the locale, so the text is shown in both languages.
export default function NotFound() {
  return (
    <section className="wrap not-found">
      <Image className="sticker" src="/logo.png" alt="" width={120} height={120} />
      <h1>
        We couldn’t find that page <span lang="ar">· لم نجد هذه الصفحة</span>
      </h1>
      <p className="lead">
        It may have moved. <span lang="ar">ربما تغيّر مكانها.</span>
      </p>
      <p className="nf-links">
        <Link className="btn btn-primary" href="/en/shop">
          Visit the shop
        </Link>
        <Link className="btn btn-outline" href="/ar/shop" lang="ar">
          تسوّق الآن
        </Link>
      </p>
    </section>
  )
}

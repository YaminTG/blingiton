---
name: seo-audit
description: Audit the Blingiton storefront (web/) for SEO before finishing a milestone or deploying — titles/descriptions, canonical + hreflang, JSON-LD, sitemap/robots, noindex rules, old-URL redirects, Lighthouse. Use after changes to routes, metadata, structured data, the SEO pipeline, or before any deploy.
---

# SEO audit: Blingiton

Run against a **production build**, not `next dev`. Report a pass/fail table at the end, with the URL and the exact problem for every failure. Fix failures only when the user asked for fixes; otherwise just report them.

## 0. Build and start
```bash
cd web && npm run build && npm run start   # run start in the background
```
Base URL is `http://localhost:3000`. Pick sample URLs from the database through the REST API: `/api/products?limit=3&where[_status][equals]=published`, plus `/api/categories?limit=2` and `/api/pages?limit=1`.

Pages to check, in **both** `/en` and `/ar`: home, 2 category pages (one with `?page=2` if it exists), 3 product pages (at least one personalizable), 1 content page.

## 1. Head tags (every sampled page)
Fetch the HTML with `curl -s` and check:
- [ ] Exactly one `<title>`: 30–60 characters, unique across the sample, Arabic text on `/ar` pages
- [ ] `meta name="description"`: 70–155 characters, unique
- [ ] `<html lang="en" dir="ltr">` / `<html lang="ar" dir="rtl">`
- [ ] `link rel="canonical"`: an absolute URL, matching the page itself (pagination keeps `?page=N`; filter and sort params are stripped)
- [ ] `hreflang` alternates for `en`, `ar` and `x-default` (→ en). Each alternate returns 200, and the pair links back
- [ ] `og:title`, `og:description`, `og:image` (absolute URL that returns 200), `og:locale`
- [ ] Exactly one `<h1>`

## 2. Structured data
Pull every `<script type="application/ld+json">` and parse it as JSON. Invalid JSON is a failure.
- **Product pages**:
  - `Product` with `name`, `image[]`, `description`, `sku` or `productID`, `brand`
  - `offers.price` and `offers.priceCurrency` = `JOD`
  - `offers.availability`: `InStock`, `PreOrder` or `MadeToOrder`, or `OutOfStock`
  - `aggregateRating` **only** when approved reviews exist, and its `reviewCount` equals their number
  - `BreadcrumbList`
- **Category pages**: `ItemList` with product URLs, and `BreadcrumbList`
- **Home**: `JewelryStore` (or `Store`) with name, url, logo, telephone, address and `sameAs` (Instagram), plus `WebSite`
- Remind the user to paste one product URL into Google's Rich Results Test after deploying. It can't run against localhost.

## 3. Crawling
- [ ] `/robots.txt` → disallows `/admin` and `/api`, and links the sitemap
- [ ] `/sitemap.xml` (and each child sitemap) → valid XML; every published product, category and page in both locales; `xhtml:link` alternates; no drafts; every listed URL returns 200 (spot-check 10)
- [ ] `/feeds/google.xml` (Merchant feed) → valid XML, prices in JOD, and image links that return 200
- [ ] **noindex rules**: with `SITE_ENV` not set to `production`, every page sends `X-Robots-Tag: noindex` and robots.txt is `Disallow: /`. With `SITE_ENV=production`, no page has noindex
- [ ] Draft products return 404 to logged-out visitors

## 4. Redirects
- [ ] For 5 products and 2 categories that have `legacy.url`, request the old path (`/product/<old-slug>/`, `/product-category/<slug>/`) → a **301** to the right new URL, in one hop
- [ ] Change a test product's slug in the admin → the old URL returns 301 to the new one
- [ ] An unknown URL → 404 page, not a redirect loop

## 5. Lighthouse (mobile)
Use Chrome DevTools MCP (or `npx lighthouse <url> --preset=perf --form-factor=mobile --output=json`) on the home page, one category page and one product page, each in en and ar:
- [ ] SEO = 100
- [ ] Performance ≥ 90
- [ ] Accessibility ≥ 95
- [ ] Note any image without `alt`, and anything above 2.5s LCP

## 6. Automatic SEO pipeline
- [ ] Count products where `seoStatus != done` and list any marked `attention`, with the reason from `ai`
- [ ] Spot-check 3 AI-written Arabic descriptions:
  - natural Arabic, not transliterated English
  - no facts that appear in neither the product nor SiteSettings → SEO writing → facts
- [ ] No two products share the same meta title or meta description

## Output
A table with one row per check: ✅ / ❌ / ⚠, plus the failing URLs and what's wrong. Finish with the 3 most important fixes.

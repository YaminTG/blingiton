# Blingiton web

Storefront + admin for Blingiton (925 silver jewelry, Amman). Next.js 16 + Payload CMS 3 in one app, Postgres, English + Arabic (RTL). Replaces the old WooCommerce site. Plan: `C:\Users\LENOVO\.claude\plans\dreamy-sniffing-brooks.md`.

This project uses the Payload CMS skill at `.claude/skills/payload/`. Start with `.claude/skills/payload/SKILL.md`, then `.claude/skills/payload/reference/` for details.

## Commands
- `npm run dev`: app on http://localhost:3000, admin on `/admin`
- `npm run generate:types` after any schema change, then `npm run generate:importmap` if admin components changed
- `npm run typecheck`, `npm run lint`, `npm run test:unit`
- `npm run build`: needs `DATABASE_URL`

## Layout
- `src/collections/`: Products, Categories, Reviews, Pages, Media, Users. `src/globals/SiteSettings.ts` holds business details and the SEO writing settings.
- `src/fields/`: shared fields. `seo.ts` has the SEO tab, `seoStatus`, the hidden `ai` bookkeeping, and `legacy` (old WooCommerce IDs and URLs). `slug.ts` is the shared EN/AR slug. `label.ts` has `l(en, ar)` for bilingual admin labels.
- `src/access/`: access rules. Published content is public; drafts are staff-only.
- `src/lib/`: `locales.ts` (en/ar), `site.ts` (`serverUrl`, `isProduction`), `slugify.ts`.
- `src/seo/`: SEO rules (`rules.ts`: length limits, Arabic check), allowed facts per product/category (`facts.ts`), and the writer that fills only empty fields and tracks what AI wrote (`apply.ts`). The future Claude API pipeline must go through `applyProductSeo` / `applyCategorySeo` too.
- Storefront (`src/app/(frontend)/[locale]/`, `src/components/`): a port of the clickable preview in `../preview/`, which is the design reference. Styles are `site.css` (the preview's, unchanged) and `frontend.css` (the preview's per-page styles).
  - `components/preview/draw.ts`: the canvas name/engraving previews, ported from `preview/assets/site.js`
  - `components/store/`: the bag (kept in the browser's localStorage), drawers, toast and the silver/gold switch; `/bag-items` returns names and prices for it
  - Checkout sends the order to the shop's WhatsApp until online payment exists
  - UI text lives in `src/lib/dictionary.ts` (EN + AR)
- `scripts/`:
  - `apply-preview.ts`: copies the preview's hand-tuned settings (personalization, home photos, top menu, Delivery/Silver care pages) into the database
  - `import-woo.ts`: one-time WooCommerce import
  - `backfill-media.ts`: photo fingerprints and low-resolution flags
  - `seo-export.ts` / `seo-apply.ts`: bulk SEO writing done in a Claude Code session. Outputs go to `scripts/output/<SEO_DIR>/`, which git ignores (`seo/` was the first backfill, `seo-v2/` the full rewrite to the length rules in `src/seo/rules.ts`).
    - Export: `SEO_ALL=1 SEO_DIR=seo-v2 npx payload run scripts/seo-export.ts < /dev/null` (all published products, not just gaps).
    - Apply: `SEO_DIR=seo-v2 SEO_REWRITE=1 [SEO_DRY_RUN=1] npx payload run scripts/seo-apply.ts < /dev/null`. Always dry-run first: it checks lengths, slug format/clashes and duplicate titles across all files.
    - `SEO_REWRITE=1` replaces AI-written text only while its fingerprint still matches; anything a person edited is kept.
    - Product entries may carry `slug` / `nameEn` fixes; a slug change adds a 301 from the old URL.
    - Also reads `site.output.json` (home/shop meta in Site settings), `pages.output.json` and `categories.output.json`.
  - `seo-score.ts`: recompute every product's stored SEO score after changing `src/seo/score.ts` (`FORCE=1` rewrites all).

## SEO score (admin)
- `src/seo/score.ts` scores a product 0–100 from the same rules as the pipeline, plus photos, approved reviews and price. It is stored in `seoScore` so the list can sort and filter by it.
- The pipeline (`applyProductSeo`) stores the score on every save, and review hooks refresh it. `storeScores` writes the products table and the latest row of `_products_v`, because the admin list reads versions (products have drafts). A plain `payload.db.updateOne` would leave the list showing stale scores.
- Admin UI pieces live in `src/components/admin/`: the dashboard (`beforeDashboard`), score panel (the `seoScore` field), list cells, and logo. Styles are in `src/app/(payload)/custom.scss`. Run `npx payload generate:importmap` after adding a component path.

## Rules
- **Host-neutral.** Hosting is undecided (Hetzner/Coolify, Vercel, DigitalOcean). Avoid host-specific APIs:
  - storage goes through `@payloadcms/storage-s3`
  - jobs go through the Payload queue (`JOBS_AUTORUN` or `/api/payload-jobs/run` + `CRON_SECRET`)
  - indexing is gated by `SITE_ENV`
- **Only `SITE_ENV=production` may be indexed.** Everything else gets noindex.
- **Every user-facing string exists in EN and AR.** Admin labels use `l()`. Content fields are `localized: true`.
- **The SEO pipeline only fills empty fields.** Never overwrite text a person wrote.
- **AI text states facts from the product or from SiteSettings → SEO writing → facts only.** No invented claims.
- **Scripts run outside the server, so their saves don't clear its page cache.** After running one against the database, restart `npm run dev` and delete `.next/dev/cache/fetch-cache`. When an `unstable_cache` function's query changes, bump its key (e.g. `'v2'`).
- **Pass `req` to nested Payload operations in hooks**, and guard re-saves with `context` flags. See the Payload skill's security notes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

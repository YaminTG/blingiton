# SEO to-do

The SEO work that's partly done or not started yet, **ordered from highest to lowest priority**. Work from the top down. Items 1–23 can be done in code. The last section, **Do it yourself**, needs a person (accounts, outreach or a paid tool) and is left for once the rest is done.

Tick an item when it's done and add the date. Put new findings under **Notes** so whoever picks this up next sees them. If a new item comes up, slot it in where it belongs by priority rather than at the bottom.

Status: `[ ]` not started · `[~]` started · `[x]` done · 🔒 blocked until launch (needs the live domain and Search Console access)

---

## Before launch

Fixes and foundations that matter from day one, or that need to be in place so there's data once the site is live.

1. [x] **Fix the out-of-date checkout line in llms.txt** (done 2026-10-12)
   - `src/app/(frontend)/llms.txt/route.ts:34` says checkout sends the order on WhatsApp. Orders now go through `/place-order`: card or cash on delivery in Jordan, and international orders are arranged on WhatsApp until HyperPay is connected.
   - Why first: it's a few minutes' work, and right now it gives AI assistants wrong information.

2. [~] **Automatic SEO writer for new products** (built 2026-10-12; waiting on a live test with an API key)
   - Have: rules, facts and the "only fill empty fields" writer (`src/seo/apply.ts`). The `seo-refresh` job runs after every save (`src/seo/tasks.ts`).
   - Left: call the Claude API inside `seo-refresh` when `ANTHROPIC_API_KEY` is set. It writes the missing title, meta, descriptions and photo alt text in EN and AR, then passes them to `applyProductSeo` / `applyCategorySeo` / `applyPageSeo`. Use the same length rules as `src/seo/rules.ts` and the same facts-only prompt as the `seo-v2` bulk run.
   - Done when: a new product saved with only a name, price and photos ends up fully written and scored, with no script run.
   - Why here: this is the main goal (SEO happens without anyone thinking about it), and every product added from now on depends on it.

3. [~] **Core Web Vitals** (lab pass done 2026-10-12, see Notes)
   - Have: server-rendered pages, WebP photos in three sizes.
   - Left: run Lighthouse on home, shop, a category, a product and checkout, in both languages, and fix LCP, CLS and INP (watch the canvas name preview and fonts). After launch, collect real-user web-vitals. 🔒 for field data.
   - Why here: it affects rankings and sales on every page, and it's much easier to fix before launch.

4. [x] **Review requests and customer-submitted reviews** (done 2026-10-13)
   - Have: Reviews collection (approval, verified purchase, language, source) and Product schema with ratings that only shows approved reviews.
   - Left: only staff can create reviews right now (`create: loggedIn`). Add a review link to the "completed" order email (`src/lib/orderEmails.ts`) that opens a review form tied to that order. Mark it as a verified purchase, save it unapproved, and show it in the admin for approval.
   - Bilingual. Use a token in the link so nobody else can review for that order.
   - Why here: star ratings in Google results and trust on the page both need reviews to build up, and that takes time, so start collecting from the first order.

5. [~] **Conversion tracking** (events + funnel report done 2026-10-13; improving the steps waits for data)
   - Have: checkout, WhatsApp "ask about this piece", live name preview, bag.
   - Have (2026-10-13): our own cookieless events (visit, product view, typed a name, add to bag, checkout, WhatsApp tap) in the `events` table via `/track`, plus a funnel report on the admin home. See Notes.
   - Left: once there's data, work on the steps where people leave, e.g. trust signals near the price, delivery date on the product page, reviews higher up.
   - Why here: without the events in place at launch, there's nothing to measure later.

6. [x] **Attribution report** (done 2026-10-13, in the admin home's funnel report)
   - Have: every order records its source (direct / organic / referral / utm) in `src/lib/origin.ts`.
   - Left: an orders-by-source report in the admin (count and revenue per source and per landing page). Also count AI assistants (chatgpt.com, perplexity.ai, etc.) as their own referral source.
   - Why here: the data is already being collected, and this shows which SEO work actually brings orders.

7. [~] **Internal linking (the part doable now)**
   - Have: breadcrumbs, 4 related products, subcategory links.
   - Left: links between related categories; a footer or home block linking the main categories; a check that no published product is an orphan. Links from guides and FAQs come with those items below.

## Content

This builds the topical authority and quotable answers that Google and AI search reward. It can start before launch. Items are in the order they depend on each other.

8. [ ] **Intent mapping**
   - Pair the searches people make (e.g. "Arabic name necklace", "silver name necklace Amman", "اسم فضة") with the page that should rank for each: home, category, product or guide. Say which keywords belong to which URL so pages don't compete with each other.
   - Comes first: everything else in this section builds on it.

9. [ ] **Content audit**
   - Go through the existing Pages (About, Delivery, Silver care, etc.) and the old Woo site's pages and posts. Decide what to keep, merge, rewrite or redirect, using the intent map.

10. [ ] **FAQ content**
    - Real questions (delivery times, silver care, sizing, gold plating, returns, custom orders) as an FAQ page plus short FAQ blocks on categories, with FAQPage schema. These are what AI Overviews, ChatGPT and Perplexity quote.

11. [~] **AI Overview / ChatGPT / Perplexity citations (on-site)**
    - Have: AI crawlers welcomed in robots, `/llms.txt`, full schema, facts-only text.
    - Left: short, quotable answers near the top of pages (starting with the FAQ). Write facts like materials, delivery times and price ranges the same way everywhere.

12. [ ] **Guide/blog section**
    - Have: only the Pages collection.
    - Left: either a Posts collection or a `guide` type on Pages. Add Article JSON-LD, sitemap entries, hreflang, an llms.txt section, and SEO pipeline + score support.
    - Needed before items 13–14 can be published.

13. [ ] **Topic clusters and topical authority**
    - Pick 3–4 topics with a main page each, e.g. name necklaces, 925 silver care, gift ideas, Arabic calligraphy styles. List the supporting articles and the products and categories each one links to (this finishes the internal linking from item 7).

14. [ ] **Briefs that rank**
    - One brief per planned article: the search it targets, the questions it answers, headings, which products and categories it links to, and what makes it better than what already ranks. Facts only, from Site settings → SEO writing.

15. [ ] **Multilingual content**
    - Write every article and FAQ from items 10–14 in Arabic too, not as a word-for-word translation. Do it alongside each piece, not as a separate pass at the end.

## After launch 🔒

These need the live domain and Search Console. Start with the first item as soon as the site is live.

16. [ ] **Search Console setup and deep dive** 🔒
    - On launch day: verify the domain, submit the sitemap, check that both languages are picked up. About 4 weeks in: check coverage, crawl stats and queries per page.

17. [ ] **Rank tracking** 🔒
    - Daily Search Console API pull into the database: positions for the queries from intent mapping, per language. No paid tool needed for this level.

18. [~] **Custom dashboards** 🔒
    - Have: admin SEO dashboard (scores, items that need a look, lowest scores).
    - Left: add Search Console clicks and impressions, top queries and pages, orders by source (item 6), and AI-referral traffic.

19. [ ] **Anomaly alerts** 🔒
    - Scheduled Payload job: email when clicks fall sharply week on week, a page drops out of the index, 404s spike, or products lose their schema.

20. [ ] **Plain-English reports** 🔒
    - Weekly or monthly email to the cousin: Claude summarises the Search Console and orders data into "what changed, why, what we're doing". This is the core of the AI-SEO service idea, so build it in a way other shops can reuse.

21. [ ] **AI visibility tracking** 🔒
    - A script that asks a fixed set of questions (e.g. "where to buy an Arabic name necklace in Jordan") through the ChatGPT and Perplexity APIs, and records whether Blingiton is mentioned or linked. Run it monthly; it costs a little per run. Pair it with the AI-referral numbers from item 6.

22. [ ] **Crawl budget audit** 🔒
    - The controls are built (robots, noindex on filtered pages, canonicals, 301s, sitemap). A few months in, check Search Console crawl stats or server logs for wasted crawls (filter URLs, old Woo URLs, 404s). Low priority at ~550 products.

23. [ ] **Refresh program** 🔒
    - Schedule a check of articles and category intros (e.g. every 6 months, or when Search Console shows a page losing clicks). Update facts, prices and links. Only useful once there's content and a few months of data.

---

## Notes

- 2026-10-12: list created from the SEO checklist review. "Done" items not repeated here: architecture, indexation hygiene, hreflang, structured data, multi-currency, category SEO, faceted nav, out-of-stock handling, titles/meta, headings, image optimisation, AI crawler access.
- 2026-10-12: reordered from highest to lowest priority.
- 2026-10-12: item 1 done. Item 2 built: `src/seo/writer.ts` + `prompts.ts`, wired into `seo-refresh`, unit tests in `tests/unit/seo-writer.spec.ts`. Still to do: set `ANTHROPIC_API_KEY`, create a product with only a name, price and photo, and check the EN/AR text and alt text it gets. Then tick item 2. Dry run: all 556 products, 19 categories and 2 pages currently have every field, so turning the key on doesn't set off a backfill.
- 2026-10-12: the writer runs inside the save's `after()` callback (`jobs.run` in `src/hooks/lifecycle.ts`) and one call can take 20–60 s. That's fine on a VPS. On serverless hosting, rely on the cron (`/api/payload-jobs/run`) so the function isn't cut off.
- 2026-10-12, item 3 (lab pass): ran Lighthouse 13 (mobile, simulated slow 4G) on a production build on localhost. Pages: home, shop, necklaces, a name product and checkout, EN + AR. Raw reports are in the session scratchpad, not the repo.
  - Before → after: score 56–76 → 78–91; simulated LCP 5.1–6.9 s → 3.4–4.8 s; checkout CLS 0.44 → 0; page weight ~1.1 MB → 0.33–0.83 MB.
  - Fixes:
    - the 465 KB `logo.png` was the favicon and the glitter text texture, so every page downloaded it. Now `icon-96.png`, `apple-icon.png` and a 14 KB `glitter.webp`.
    - the glitter heading paints in solid pink until the texture loads.
    - checkout holds a screen's height while the bag loads.
    - LCP photos use `loading="eager"` + `fetchPriority="high"` (Next 16 deprecated `priority`).
    - the unused Tajawal 500 weight is no longer preloaded.
  - Tried and reverted: `experimental.inlineCss`. No measurable gain, and it inlines about 187 KB of CSS into every admin page.
  - Left:
    - Arabic pages fetch 3 Tajawal Latin font files (for prices and "Blingiton") after the CSS, which costs about 0.9 s of FCP in the simulation. Fix needs a design call: Nunito for Latin text on Arabic pages, or preload Tajawal Latin on every page.
    - ~150 KB of React/Next JS keeps TBT at 150–400 ms.
    - Uncached pages take 0.5–1 s from here to Neon, so host the app in the same region as the database.
    - Real-user web-vitals after launch 🔒.
- 2026-10-13: item 3 follow-up: Tajawal kept for Latin text on Arabic pages, and its Latin files are now preloaded too.
- 2026-10-13: item 4 done.
  - The "on its way" email has a "Review your order" link: `/en|ar/review?o=<id>&t=<signature>`, where the signature is an HMAC of the order id with `PAYLOAD_SECRET` (`src/lib/reviewCheck.ts`).
  - The page lists the order's pieces with stars and an optional comment. It's noindex and disallowed in robots.
  - `/submit-review` saves them unapproved, marked verified purchase, in the customer's language and linked to the order (one per piece per order), then emails the shop a link to approve them.
  - Tested end to end with a temporary order, since deleted.
  - Site settings has no shop email yet, so neither this notice nor the new-order notice goes out until one is added.
  - The `order` field on Reviews was pushed to the dev database. Production will need migrations (there are none yet).
- 2026-10-13: items 5 and 6.
  - Events are stored in our own database, not Plausible (decided with the user): free, joins with orders and products, and reusable for other shops and for the monthly reports (item 20).
  - Each visit is a random id in sessionStorage. No cookies, no IP and no personal data, so no cookie banner is needed.
  - Each step is counted once per visit and product. Bots, headless browsers and anyone signed in to the admin (`payload-token` cookie) are skipped.
  - The report covers the last 30 days: the funnel; orders, revenue and conversion per source (AI assistants tagged and totalled); the most viewed pieces (views → typed a name → added → checkout → orders); and the first page of visits that ordered.
  - Tested end to end with real browser visits and synthetic events, all deleted afterwards.
  - Later: prune or roll up events older than ~13 months, and add the Search Console numbers (item 18) next to this report.
- 2026-10-12: Site settings → SEO writing → facts says "Pay by card, or cash on delivery inside Jordan". Abroad, card payment isn't live yet (orders go to WhatsApp). The cousin may want to reword it until HyperPay is connected.

---

## Do it yourself (can't be done in code)

These need someone to sign in to accounts, contact people or pay for a tool. Most only make sense once the site is live on blingitonjewels.com. They're also in priority order. Claude can still prepare the text, lists and pitches for each one; just ask.

1. [ ] **Google Business Profile**
   - The cousin creates or claims the profile with their own Google account and completes Google's verification (postcard, phone or video).
   - Use exactly the same name, address, phone and opening hours as Site settings. Pick "Jewelry store" as the category, add the website (both languages), real photos of pieces and packaging, and products.
   - Claude can write: the description (EN + AR), product posts, Q&A answers.
   - Why first: it's free, it's the biggest local ranking factor, and most of the items below build on it.

2. [ ] **NAP consistency (name, address, phone) off the site**
   - On the site it's already consistent (one Site settings record feeds everything).
   - Off the site: update Instagram, TikTok, Facebook, WhatsApp Business, the old Woo site's footer/contact page, and any directory listings so they all match Site settings exactly, down to the spelling and phone format.

3. [ ] **Review management (Google and social)**
   - The on-site part (review requests, customer review form) is item 4 above.
   - Off the site: ask customers for Google reviews (a short link from the Business Profile in the WhatsApp follow-up), and reply to every review, good or bad, within a few days.
   - Once the Business Profile exists, Claude adds its review link to the on-site "Thank you" screen after a review and to the "on its way" email. Google doesn't allow importing reviews into a profile, so customers have to post there themselves.
   - Ask everyone the same way, whatever stars they gave. Google forbids asking only happy customers ("review gating").
   - Claude can write reply templates in EN and AR.

4. [ ] **Reputation cleanup**
   - Search the shop's name on Google, Instagram and review sites. Answer or resolve old complaints, report fake reviews, and make sure the old Woo site doesn't show broken or outdated pages once the new site is live.

5. [ ] **Citation building**
   - List the shop on local and business directories: Apple Business Connect (Apple Maps), Bing Places, Jordanian business directories, the main Arab-region marketplaces/directories, and Yelp-style sites that show up for "jewelry Amman".
   - Same name, address and phone everywhere. Claude can make the list of directories and the text to paste.

6. [ ] **Backlink acquisition**
   - Links from other sites to blingitonjewels.com: Jordanian lifestyle/gift blogs, wedding and engagement sites, "gift guide" articles, local suppliers or partners, university/student pages for graduation gifts.
   - Claude can make the target list and write the outreach messages; a person sends them and follows up.

7. [ ] **Digital PR**
   - Story angles for Jordanian and regional media: local handmade 925 silver, Arabic calligraphy name pieces, seasonal gift guides (Ramadan, Eid, Mother's Day, Valentine's, graduation).
   - Claude can write the press release and pitch emails; a person sends them.

8. [ ] **Influencer partnerships**
   - Jordanian/Gulf Instagram and TikTok creators: gifted custom name pieces in return for posts, each with its own UTM link so orders are tracked (the site already records UTM sources on orders).
   - Needs the cousin's budget and approval.

9. [ ] **Brand mentions**
   - Get the shop named (even without a link) in articles, gift guides, forums and social posts. Search "Blingiton" every month and ask anyone who mentioned it without a link to add one.

10. [ ] **Local rank tracking**
    - Needs a paid tool (BrightLocal, Semrush local, or similar) to see where the shop appears on Google Maps across Amman. Only worth it once the Business Profile is verified and has some reviews.

11. [ ] **Authority tracking**
    - Needs Ahrefs, Moz or Semrush to track domain authority and new backlinks over time. Free alternative: Search Console's Links report, which covers most of what's needed at this size.

- **Multi-location SEO:** doesn't apply. There's one shop. Only revisit if a second branch or a stockist opens.

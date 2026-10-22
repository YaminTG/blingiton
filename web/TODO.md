# To-do

Work that isn't SEO (that lives in `SEO-TODO.md`): payments, checkout, hosting and launch steps. Tick an item when it's done and add the date. Put new findings under **Notes**.

Status: `[ ]` not started · `[~]` started · `[x]` done · 🔒 blocked until there's a public address (production domain or a deployed preview)

---

## HyperPay (card payments)

Built and tested on HyperPay's test server on 2026-10-22 (see `src/lib/payments.ts` and the card-payments notes in `CLAUDE.md`).

1. [ ] **Ask HyperPay about webhooks and going live.** First check the test merchant area (gate2play.test.ctpe.info, Aya's login) for Administration → Webhooks; if it isn't there, email HyperPay. Probably best sent by the cousin or Aya, since the account is theirs. Ask:
   - How webhooks are enabled for the account (self-serve or by them), and the encryption secret.
   - The steps to get the live access token and entity ID, and whether they need to see anything from us first.
   - Whether production uses `https://eu-prod.oppwa.com`.
   - Whether `billing.street1`, `billing.postcode` and `billing.state` are mandatory on the live server. The test server accepts checkouts without them, and the cousin's checkout spec makes the address fields optional, so this decides whether customers must give a postcode.
2. [ ] 🔒 **Register the webhook.** URL `https://<domain>/payment/webhook`; the secret goes in `HYPERPAY_WEBHOOK_KEY` on the server. Optional: without it the `payment-check` job confirms payments within 5 minutes.
3. [ ] 🔒 **Go live.** Put the live `HYPERPAY_BASE_URL` / `HYPERPAY_TOKEN` / `HYPERPAY_ENTITY_ID` on the production server only (never in dev or a preview), then make one small real payment and refund it.
4. [ ] **Ask the cousin whether Jordan should also get "pay online by card"**, alongside card and cash on delivery. A small change.

## Notes

- 2026-10-22: Payload's scheduled jobs haven't run in dev since 2026-10-18 (queued, never completed). The production server must run them, or online payments from customers who closed the tab are only confirmed by the webhook. `scripts/payment-check.ts` runs the payment check by hand.

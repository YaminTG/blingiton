# Blingiton — Design System (Master)

Source of truth for the preview and the Next.js store. Page files in `pages/` override this when present.
Derived from the real brand: logo (`logo.png`, pink glitter circle, white "BLING IT ON!"), blush gift bag with silver rope handles, pink box with hot-pink lettering.

## Direction
- **Style:** vibrant & block-based, softened: blush/cream colour blocks, round "sticker" motifs, pill controls. Playful and giftable, never childish.
- **Pink level:** "Blush bag" — blush and cream surfaces, hot pink for actions/highlights, glitter only as the logo sticker and small decorative badges.
- **Signature motifs:** the logo sticker (placed like it's stuck on packaging), silver rope divider (from the bag handles), metallic name previews (silver / 18K gold plated).

## Colour tokens
| Token | Hex | Use |
|---|---|---|
| `--cream` | #FFF8F5 | page background |
| `--paper` | #FFFFFF | cards, inputs |
| `--blush` | #F8D3DA | brand blocks (the bag) |
| `--blush-soft` | #FDEBEE | subtle fills, hover |
| `--blush-deep` | #F3B9C5 | borders on blush, selected fills |
| `--pink` | #C8336F | primary buttons, links, focus (white text 5.0:1) |
| `--pink-hover` | #A92A5D | primary hover/pressed |
| `--glitter` | #D23E78 | logo pink, decorative only |
| `--ink` | #4E0F2A | text, footer ground (never pure black) |
| `--ink-soft` | #7A3552 | secondary text (≥6:1 on cream and blush) |
| `--line` | #EFD3DA | dividers, input borders |
| `--silver` | gradient #F3F3F6 → #B8B7BF → #86858E | metal, rope |
| `--gold` | gradient #FFF1C9 → #E0B75E → #A77A2A | gold-plated preview |
| `--error` | #B3261E | errors (always with text) |
| `--ok` | #1F7A4D | success (always with icon/text) |

## Typography
- **UI & headings (EN):** Nunito Sans 400/600/800. Caps + 0.12em tracking for labels/buttons echo the logo lettering.
- **UI & headings (AR):** Tajawal 400/500/700/800.
- **Name previews:** Script = Great Vibes / Aref Ruqaa · Classic = Playfair Display italic / Amiri · Modern = Nunito Sans 800 / Reem Kufi. (Final list must match what the workshop can make.)
- Scale (px): 12 · 14 · 16 · 18 · 22 · 28 · 36 · 48 · 64. Body 16–17px, line-height 1.6. Headings `text-wrap: balance`.

## Shape, depth, motion
- Radius: 12 (inputs), 20 (cards), 32 (feature blocks), 999 (pills, stickers).
- Shadows are raspberry-tinted: `0 1px 2px rgba(78,15,42,.06), 0 4px 14px rgba(78,15,42,.06)`; raised `0 12px 32px rgba(78,15,42,.12)`.
- Motion 150–300ms, ease-out enter; springy pop only for "added to bag" sticker. Transform/opacity only. Respect `prefers-reduced-motion`.

## Layout
- Mobile-first; breakpoints 375 / 768 / 1024 / 1440; max content width 1200px; side gutter ≥16px.
- Logical CSS properties only (margin-inline, inset-inline) so Arabic RTL mirrors cleanly; directional icons flip in RTL.
- Touch targets ≥44px; one primary action per view.

## Commerce rules
- Prices in JOD ("60 JOD" / "60 د.أ").
- Payment choices shown early: card online, card on delivery, cash on delivery.
- Personalised items carry their options (name, style, finish, chain, birthstone, gift note) through cart, checkout and order.

## Avoid
- Pure black text, neon gradients, glitter behind body text, emoji icons, dark "luxury vault" looks (rejected by the owner), invented palettes that ignore the logo.

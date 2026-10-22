import type { Payload } from 'payload'

import type { Order, SiteSetting } from '@/payload-types'

import { dictionary } from './dictionary'
import { recordSignal } from './healthSignal'
import type { Locale } from './locales'
import { paymentMethods } from './orderOptions'
import { carrierLink, trackLink } from './orderTrack'
import { reviewLink } from './reviewCheck'
import { serverUrl } from './site'
import { money } from './urls'

/** "received" when the order comes in; the rest follow the order's stage (orderStages.ts). */
export type Kind = 'received' | 'preparing' | 'packed' | 'shipped' | 'delivered'

/** Where each email's "sent" time is kept. The shipped email kept WooCommerce's "completed" name. */
const SENT = { received: 'receivedAt', preparing: 'preparingAt', packed: 'packedAt', shipped: 'completedAt', delivered: 'deliveredAt' } as const

const esc = (s: string | null | undefined) => (s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

/** Whether the shop wants customers emailed at this stage (Site settings → Orders & alerts). */
const wanted = (settings: SiteSetting, kind: Kind) => kind === 'received' || settings.orderFlow?.notify?.[kind] !== false

/**
 * The customer's email when an order comes in and as it moves through the stages the shop chose,
 * plus a "new order" note to the shop (Site settings → email). Each email goes out once per order;
 * `emails.*At` records it. Without SMTP settings, Payload prints the emails to the server log.
 */
export async function sendOrderEmails(payload: Payload, id: number, kind: Kind) {
  const order = await payload.findByID({ collection: 'orders', id, depth: 0 })
  const field = SENT[kind]
  if (order.emails?.[field]) return
  const locale: Locale = order.locale === 'ar' ? 'ar' : 'en'
  const settings = await payload.findGlobal({ slug: 'site-settings', locale, depth: 0 })
  if (!wanted(settings, kind)) return
  const shopEmail = settings.email || undefined

  const sends: Promise<unknown>[] = []
  if (order.customer.email) {
    const mail = customerEmail(order, settings, locale, kind)
    sends.push(payload.sendEmail({ to: order.customer.email, replyTo: shopEmail, ...mail }))
  }
  if (kind === 'received' && shopEmail) sends.push(payload.sendEmail({ to: shopEmail, ...shopNotice(order) }))
  try {
    await Promise.all(sends)
  } catch (err) {
    // The shop-health check retries missing confirmations and alerts the team if they keep failing.
    await recordSignal(payload, { kind: 'email-failed', path: `order:${order.id}`, detail: `${kind} email for #${order.number}: ${err instanceof Error ? err.message : String(err)}` })
    throw err
  }

  await payload.update({
    collection: 'orders',
    id,
    data: { emails: { ...order.emails, [field]: new Date().toISOString() } },
    context: { orderEmails: true },
  })
}

function methodName(order: Order, locale: Locale) {
  const c = dictionary(locale).co
  return { amman: c.amman, jordan: c.jordanCities, intl: c.intl, intl_standard: c.intlStd }[order.shipping.method]
}

const PINK = '#c8336f'
const INK = '#4e0f2a'
const MUTED = '#7a5a66'

function customerEmail(order: Order, settings: SiteSetting, locale: Locale, kind: Kind) {
  const t = dictionary(locale)
  const m = t.mail
  const ar = locale === 'ar'
  const dir = ar ? 'rtl' : 'ltr'
  const end = ar ? 'left' : 'right'
  const no = `#${order.number}`
  const first = order.customer.name.split(/\s+/)[0]
  const abroad = order.payment.method === 'whatsapp'
  const words = {
    received: [m.receivedSubject(no), m.receivedHeading(first), abroad ? m.receivedIntl : m.receivedIntro],
    preparing: [m.preparingSubject(no), m.preparingHeading(first), m.preparingIntro],
    packed: [m.packedSubject(no), m.packedHeading(first), m.packedIntro],
    shipped: [m.completedSubject(no), m.completedHeading(first), m.completedIntro],
    delivered: [m.deliveredSubject(no), m.deliveredHeading(first), m.deliveredIntro],
  }
  const [subject, heading, intro] = words[kind]
  // The full receipt goes with the first email and the "on its way" one; the others stay short.
  const receipt = kind === 'received' || kind === 'shipped'
  const payLabel = paymentMethods.find((p) => p.value === order.payment.method)?.label[locale] ?? ''
  const methodLabel = methodName(order, locale)
  const gift = order.giftCardFee || order.giftMessage ? `${t.co.giftLine}${order.giftMessage ? `: “${order.giftMessage}”` : ''}` : null
  const wa = settings.whatsapp ? `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(t.co.waAbout(no))}` : null
  const font = ar ? "Tahoma, 'Segoe UI', Arial, sans-serif" : "'Helvetica Neue', Arial, sans-serif"
  // The review ask comes with the "delivered" email, or with "on its way" when the shop doesn't send that one.
  const askReview = kind === 'delivered' || (kind === 'shipped' && !wanted(settings, 'delivered'))
  const review = askReview ? reviewLink(locale, order.id) : null
  const reviewAsk = kind === 'delivered' ? m.reviewAskDelivered : m.reviewAsk
  const track = trackLink(locale, order.id)
  const trackingNo = kind === 'shipped' ? order.tracking?.number?.trim() || null : null
  const parcel = kind === 'shipped' ? order.tracking?.url?.trim() || carrierLink(order.tracking?.carrier, order.tracking?.number) : null

  const itemsHtml = (order.items ?? [])
    .map((it) => {
      const details = (it.details ?? []).map((d) => `${d.label ? `${esc(d.label)}: ` : ''}${esc(d.value)}`).join('<br>')
      return `<tr>
  <td style="padding:12px 0;border-bottom:1px solid #f3d9e1;vertical-align:top">
    <div style="font-weight:700;color:${INK}">${esc(it.name)}${it.quantity > 1 ? ` × ${it.quantity}` : ''}</div>
    ${details ? `<div style="margin-top:4px;font-size:13px;line-height:1.5;color:${MUTED}">${details}</div>` : ''}
  </td>
  <td style="padding:12px 0;border-bottom:1px solid #f3d9e1;vertical-align:top;text-align:${end};white-space:nowrap;color:${INK}">${esc(money(it.lineTotal ?? 0, locale))}</td>
</tr>`
    })
    .join('')

  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:4px 0;color:${strong ? INK : MUTED};${strong ? 'font-weight:800;font-size:17px;' : ''}">${esc(label)}</td><td style="padding:4px 0;text-align:${end};color:${INK};${strong ? 'font-weight:800;font-size:17px;' : ''}">${esc(value)}</td></tr>`

  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#fdebee;font-family:${font};color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdebee"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
  <tr><td align="center" style="background:${PINK};padding:22px"><img src="${serverUrl}/apple-icon.png" width="72" height="72" alt="Blingiton" style="display:block;border-radius:50%"></td></tr>
  <tr><td style="padding:28px 28px 4px">
    <h1 style="margin:0 0 10px;font-size:24px;line-height:1.3;color:${INK}">${esc(heading)}</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK}">${esc(intro)}</p>
    <p style="margin:0;font-size:14px;font-weight:800;color:${PINK}">${esc(m.order(no))}</p>
    ${trackingNo ? `<p style="margin:6px 0 0;font-size:14px;color:${INK}"><span dir="ltr">${esc(m.trackingNo(trackingNo))}</span>${parcel ? ` · <a href="${esc(parcel)}" style="color:${PINK};font-weight:700">${esc(m.trackParcel)}</a>` : ''}</p>` : ''}
    <p style="margin:16px 0 4px"><a href="${esc(track)}" style="display:inline-block;padding:11px 20px;border-radius:999px;border:2px solid ${PINK};color:${PINK};font-weight:800;text-decoration:none">${esc(m.trackBtn)}</a></p>
  </td></tr>
  ${
    receipt
      ? `<tr><td style="padding:4px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">${itemsHtml}</table></td></tr>
  <tr><td style="padding:12px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">
    ${row(t.subtotal, money(order.subtotal ?? 0, locale))}
    ${row(`${t.co.delivery} (${methodLabel})`, money(order.deliveryFee ?? 0, locale))}
    ${gift ? row(gift, money(order.giftCardFee ?? 0, locale)) : ''}
    ${row(t.co.total, money(order.total ?? 0, locale), true)}
    ${row(t.co.payment, payLabel)}
  </table></td></tr>
  <tr><td style="padding:18px 28px 0">
    <div style="padding:14px 16px;border-radius:12px;background:#fff6f8;font-size:14px;line-height:1.6">
      <div style="font-weight:800;margin-bottom:4px">${esc(m.deliverTo)}</div>
      ${esc(order.customer.name)}<br>${esc(order.shipping.address)}<br>${esc(order.shipping.city)}${order.shipping.country ? `, ${esc(order.shipping.country)}` : ''}<br><span dir="ltr">${esc(order.customer.phone)}</span>
    </div>
  </td></tr>`
      : ''
  }
  ${
    review
      ? `<tr><td style="padding:22px 28px 0">
    <div style="padding:18px;border-radius:12px;border:2px solid #f3d9e1;text-align:center">
      <div style="font-size:22px;letter-spacing:4px;color:${PINK}">★★★★★</div>
      <p style="margin:8px 0 14px;font-size:15px;line-height:1.6;color:${INK}">${esc(reviewAsk)}</p>
      <a href="${esc(review)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:${INK};color:#ffffff;font-weight:800;text-decoration:none">${esc(m.reviewBtn)}</a>
    </div>
  </td></tr>`
      : ''
  }
  <tr><td style="padding:22px 28px 28px">
    <p style="margin:0 0 14px;font-size:14px;color:${MUTED}">${esc(m.questions)}</p>
    ${wa ? `<a href="${esc(wa)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:${PINK};color:#ffffff;font-weight:800;text-decoration:none">${esc(m.whatsapp)}</a>` : ''}
  </td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:${MUTED}">Blingiton · ${esc(settings.address?.city || (ar ? 'عمّان' : 'Amman'))}</p>
</td></tr></table>
</body></html>`

  const text = [
    heading,
    '',
    intro,
    '',
    m.order(no),
    ...(trackingNo ? [m.trackingNo(trackingNo), ...(parcel ? [`${m.trackParcel}: ${parcel}`] : [])] : []),
    `${m.trackBtn}: ${track}`,
    '',
    ...(receipt
      ? [
          ...(order.items ?? []).flatMap((it) => [
            `${it.quantity} × ${it.name} · ${money(it.lineTotal ?? 0, locale)}`,
            ...(it.details ?? []).map((d) => `   ${d.label ? `${d.label}: ` : ''}${d.value}`),
          ]),
          '',
          `${t.subtotal}: ${money(order.subtotal ?? 0, locale)}`,
          `${t.co.delivery} (${methodLabel}): ${money(order.deliveryFee ?? 0, locale)}`,
          ...(gift ? [`${gift}: ${money(order.giftCardFee ?? 0, locale)}`] : []),
          `${t.co.total}: ${money(order.total ?? 0, locale)}`,
          `${t.co.payment}: ${payLabel}`,
          '',
          `${m.deliverTo}: ${order.customer.name}, ${order.shipping.address}, ${order.shipping.city}${order.shipping.country ? `, ${order.shipping.country}` : ''}`,
          '',
        ]
      : []),
    ...(review ? [reviewAsk, `${m.reviewBtn}: ${review}`, ''] : []),
    m.questions,
    wa ?? '',
  ].join('\n')

  return { subject, html, text }
}

/** Short English note to the shop with a link straight to the order in the admin. */
function shopNotice(order: Order) {
  const link = `${serverUrl}/admin/collections/orders/${order.id}`
  const card = [order.payment.cardBrand, order.payment.cardLast4 && `•••• ${order.payment.cardLast4}`].filter(Boolean).join(' ')
  const pay = [paymentMethods.find((p) => p.value === order.payment.method)?.label.en ?? '', order.payment.paidAt ? `PAID${card ? ` (${card})` : ''}` : ''].filter(Boolean).join(' · ')
  const subject = `New order #${order.number} from ${order.customer.name} · ${money(order.total ?? 0, 'en')}`
  const lines = [
    subject,
    '',
    ...(order.items ?? []).flatMap((it) => [`${it.quantity} × ${it.name}`, ...(it.details ?? []).map((d) => `   ${d.label ? `${d.label}: ` : ''}${d.value}`)]),
    '',
    `Payment: ${pay}`,
    `Delivery: ${methodName(order, 'en')} · ${money(order.deliveryFee ?? 0, 'en')}`,
    ...(order.giftMessage ? [`GIFT CARD (${money(order.giftCardFee ?? 0, 'en')}), write: “${order.giftMessage}”. Leave the prices out of the box.`] : []),
    `Customer: ${order.customer.name}, ${order.customer.phone}, ${order.customer.email ?? ''}`,
    `Deliver to: ${order.shipping.address}, ${order.shipping.city}, ${order.shipping.country ?? ''}`,
    '',
    `Open the order: ${link}`,
  ]
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(lines.join('\n')).replace(esc(link), `<a href="${esc(link)}">${esc(link)}</a>`)}</div>`
  return { subject, text: lines.join('\n'), html }
}

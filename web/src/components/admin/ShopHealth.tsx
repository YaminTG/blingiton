import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps, Payload, ServerProps } from 'payload'

import { can } from '@/access'
import { healthReport, lastHealth } from '@/lib/health'
import { totalAtRisk, worstTier, type Problem, type Tier } from '@/lib/healthRules'
import { formatter, problemText, TIER_LABEL } from '@/lib/healthText'

type Lang = 'en' | 'ar'

const copy = {
  en: {
    nav: 'Shop health',
    title: 'Shop health',
    intro: 'Everything that can quietly cost you sales, ranked by how much. You’re emailed about emergencies straight away, other urgent problems once, and the rest in a 9:00 summary.',
    emergency: 'Business emergency',
    status: {
      urgent: (n: number) => `${n} ${n === 1 ? 'thing needs' : 'things need'} you today`,
      soon: (n: number) => `Selling normally. ${n} ${n === 1 ? 'thing' : 'things'} to fix this week`,
      ok: 'All clear: the shop is selling normally',
    },
    atRisk: (s: string) => `About ${s} a day at risk`,
    risk: (s: string) => `About ${s} a day`,
    whatToDo: 'What to do',
    open: 'Open',
    check: 'Check now',
    checkNote: 'Opens every page and photo again (takes a minute). Doesn’t send emails.',
    problems: 'Problems, costliest first',
    watched: 'What’s being watched',
    w: {
      checkout: (last: string, n: number) => `Checkout: last web order ${last}; ${n} ${n === 1 ? 'visit' : 'visits'} reached checkout since`,
      confirmations: (n: number) => (n ? `Order confirmations: ${n} not sent` : 'Order confirmations: all sent'),
      pages: (pages: number, photos: number, at: string) => `Pages and photos: ${pages} pages and ${photos} photos opened ${at}`,
      pagesNever: 'Pages and photos: not crawled yet (press “Check now”)',
      backups: (ok: boolean) => (ok ? 'Backups: fine (details on the security page)' : 'Backups: see the problems above'),
      jobs: (at: string) => `Background checks: last ran ${at}`,
      rates: (live: boolean) => (live ? 'Exchange rates: today’s' : 'Exchange rates: fixed backup rates'),
    },
    normal: 'Your normal (last 28 days, web orders)',
    normalNote: 'The “at risk” amounts come from these. They’re estimates to rank problems, not accounting.',
    n: { orders: 'Orders', perDay: 'Sales a day', aov: 'Average order', rate: 'Checkouts that order' },
    tooNew: 'Not enough orders yet to know the shop’s normal, so quiet spells aren’t flagged until there are 10 web orders.',
    how: 'How alerts work',
    howItems: [
      ['Emergency', 'Sales are stopping now (checkout or the main pages are down). Emailed at once, then every 2 hours until fixed.'],
      ['Today', 'Losing money or customers today. Emailed once, then in the 9:00 summary while it lasts.'],
      ['This week', 'Worth fixing soon. Only in the 9:00 summary.'],
      ['Good to know', 'Shown here, never emailed.'],
      ['When the whole server is down', 'Nothing inside it can send an email. A free uptime monitor (UptimeRobot, Better Stack) watching /health sends a phone notification instead.'],
    ],
    summary: 'Shop health',
    more: (n: number) => `+${n} more`,
    never: 'never',
  },
  ar: {
    nav: 'صحة المتجر',
    title: 'صحة المتجر',
    intro: 'كل ما قد يكلّفك مبيعات بصمت، مرتّباً حسب كلفته. تصلك رسالة فوراً عند الطوارئ، ومرة واحدة للمشاكل العاجلة الأخرى، والباقي في ملخص الساعة 9:00.',
    emergency: 'طارئ في المتجر',
    status: {
      urgent: (n: number) => `${n} ${n === 1 ? 'أمر يحتاجك' : 'أمور تحتاجك'} اليوم`,
      soon: (n: number) => `البيع طبيعي. ${n} ${n === 1 ? 'أمر' : 'أمور'} للإصلاح هذا الأسبوع`,
      ok: 'كل شيء سليم: المتجر يبيع بشكل طبيعي',
    },
    atRisk: (s: string) => `حوالي ${s} يومياً معرّضة للخسارة`,
    risk: (s: string) => `حوالي ${s} يومياً`,
    whatToDo: 'ما العمل',
    open: 'فتح',
    check: 'افحص الآن',
    checkNote: 'يفتح كل الصفحات والصور من جديد (يستغرق دقيقة). لا يرسل رسائل.',
    problems: 'المشاكل، الأعلى كلفة أولاً',
    watched: 'ما تتم مراقبته',
    w: {
      checkout: (last: string, n: number) => `الدفع: آخر طلب من الموقع ${last}؛ ${n} زيارة وصلت صفحة الدفع بعده`,
      confirmations: (n: number) => (n ? `رسائل تأكيد الطلب: ${n} لم تُرسل` : 'رسائل تأكيد الطلب: أُرسلت كلها'),
      pages: (pages: number, photos: number, at: string) => `الصفحات والصور: فُتحت ${pages} صفحة و${photos} صورة ${at}`,
      pagesNever: 'الصفحات والصور: لم تُفحص بعد (اضغط «افحص الآن»)',
      backups: (ok: boolean) => (ok ? 'النسخ الاحتياطي: سليم (التفاصيل في صفحة الأمان)' : 'النسخ الاحتياطي: راجع المشاكل أعلاه'),
      jobs: (at: string) => `فحوصات الخلفية: آخر تشغيل ${at}`,
      rates: (live: boolean) => (live ? 'أسعار الصرف: أسعار اليوم' : 'أسعار الصرف: الأسعار الاحتياطية الثابتة'),
    },
    normal: 'معدّلك الطبيعي (آخر 28 يوماً، طلبات الموقع)',
    normalNote: 'مبالغ «المعرّضة للخسارة» محسوبة منها. هي تقديرات لترتيب المشاكل، لا حسابات.',
    n: { orders: 'الطلبات', perDay: 'المبيعات يومياً', aov: 'متوسط الطلب', rate: 'زيارات الدفع التي طلبت' },
    tooNew: 'لا توجد طلبات كافية بعد لمعرفة معدّل المتجر، فلا تُرصد فترات الهدوء حتى يصل عدد طلبات الموقع إلى 10.',
    how: 'كيف تعمل التنبيهات',
    howItems: [
      ['طارئ', 'المبيعات تتوقف الآن (الدفع أو الصفحات الرئيسية معطّلة). رسالة فوراً ثم كل ساعتين حتى يُصلح.'],
      ['اليوم', 'خسارة مال أو عملاء اليوم. رسالة مرة واحدة ثم في ملخص 9:00 ما دامت قائمة.'],
      ['هذا الأسبوع', 'يستحق الإصلاح قريباً. في ملخص 9:00 فقط.'],
      ['للعلم', 'يظهر هنا ولا يُرسل.'],
      ['إذا تعطّل الخادم كله', 'لا شيء بداخله يستطيع إرسال رسالة. مراقب مجاني (UptimeRobot أو Better Stack) يراقب /health ويرسل إشعاراً للهاتف بدلاً من ذلك.'],
    ],
    summary: 'صحة المتجر',
    more: (n: number) => `+${n} أخرى`,
    never: 'أبداً',
  },
}

const langOf = (i18n: ServerProps['i18n']): Lang => (i18n.language === 'ar' ? 'ar' : 'en')
// Emergencies and today's problems are red, this week's amber, the rest grey.
const level = (t: Tier | null) => (t === 'emergency' || t === 'urgent' ? 'critical' : t === 'soon' ? 'warning' : 'ok')
const chip = (t: Tier) => (t === 'fyi' ? '' : level(t))

/** In the side menu, for anyone who works on orders. */
export function HealthNavLink({ i18n, payload, user }: ServerProps) {
  if (!can(user, 'orders')) return null
  return (
    <a className="nav__link bl-navlink" href={`${payload.config.routes.admin}/shop-health`}>
      <span className="nav__link-label">{copy[langOf(i18n)].nav}</span>
    </a>
  )
}

function statusLine(problems: Problem[], lang: Lang) {
  const t = copy[lang]
  const worst = worstTier(problems)
  const count = (tier: Tier) => problems.filter((p) => p.tier === tier).length
  if (worst === 'emergency') return `${t.emergency}: ${problemText(problems[0], lang)[0]}`
  if (worst === 'urgent') return t.status.urgent(count('urgent'))
  if (worst === 'soon') return t.status.soon(count('soon'))
  return t.status.ok
}

/**
 * Top of the admin home: the Business Emergency banner when sales are stopping, otherwise one line.
 * Reads the last scheduled run, so it costs nothing to show.
 */
export async function ShopHealthStrip({ payload, lang, admin }: { payload: Payload; lang: Lang; admin: string }) {
  const t = copy[lang]
  const f = formatter(lang)
  const { problems } = await lastHealth(payload)
  const shown = problems.filter((p) => p.tier !== 'fyi')
  const worst = worstTier(shown)
  const risk = totalAtRisk(shown)
  const href = `${admin}/shop-health`

  if (worst === 'emergency') {
    const first = shown[0]
    const [title, todo] = problemText(first, lang)
    return (
      <a className="bl-health-emergency" href={href} role="alert">
        <span className="bl-health-emergency__label">🚨 {t.emergency}</span>
        <strong className="bl-health-emergency__title">{title}</strong>
        {first.atRisk ? <span className="bl-health-emergency__risk">{t.atRisk(f.jod(first.atRisk))}</span> : null}
        <span className="bl-health-emergency__todo">{todo}</span>
        {shown.length > 1 ? <span className="bl-sec-chip">{t.more(shown.length - 1)}</span> : null}
      </a>
    )
  }
  return (
    <a className={`bl-sec-strip bl-sec-strip--${level(worst)}`} href={href}>
      <strong>{t.summary}:</strong> {statusLine(shown, lang)}
      {risk ? <span className="bl-sec-chip bl-sec-chip--critical">{t.atRisk(f.jod(risk))}</span> : null}
      <span aria-hidden> →</span>
    </a>
  )
}

/** /admin/shop-health: every problem, costliest first, and what's being watched. */
export async function ShopHealth({ initPageResult, i18n, locale, params, payload, permissions, searchParams, user }: AdminViewServerProps) {
  const admin = payload.config.routes.admin
  if (!initPageResult.req.user) redirect(`${admin}/login?redirect=${encodeURIComponent(`${admin}/shop-health`)}`)
  if (!can(initPageResult.req.user, 'orders')) redirect(admin)
  const lang = langOf(i18n)
  const t = copy[lang]
  const f = formatter(lang)
  const { problems, input, lastRunAt } = await healthReport(payload)
  const worst = worstTier(problems.filter((p) => p.tier !== 'fyi'))
  const risk = totalAtRisk(problems)
  const b = input.baseline
  const deep = input.deep
  const linkOf = (p: Problem) => (p.link ? (p.link.startsWith('/admin') ? `${admin}${p.link.slice('/admin'.length)}` : p.link) : null)

  const watched: [boolean, string][] = [
    [!problems.some((p) => p.kind === 'checkout-down' || p.kind === 'checkout-errors'), t.w.checkout(f.when(input.lastWebOrderAt), input.checkoutsSinceLastOrder)],
    [!input.missingConfirmations.length, t.w.confirmations(input.missingConfirmations.length)],
    deep ? [!deep.pages.length && !deep.images.length, t.w.pages(deep.checkedPages, deep.checkedImages, f.when(deep.at))] : [false, t.w.pagesNever],
    [!input.backups.length, t.w.backups(!input.backups.length)],
    [!problems.some((p) => p.kind === 'jobs-stopped'), t.w.jobs(f.when(lastRunAt))],
    ...(deep?.rates ? [[deep.rates === 'live', t.w.rates(deep.rates === 'live')] as [boolean, string]] : []),
  ]

  return (
    <DefaultTemplate
      i18n={i18n}
      locale={locale}
      params={params}
      payload={payload}
      permissions={permissions}
      req={initPageResult.req}
      searchParams={searchParams}
      user={user}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <section className="bl-dash bl-sec bl-health" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <header className="bl-insights__head">
            <div>
              <h2>{t.title}</h2>
              <p>{t.intro}</p>
            </div>
            <form method="post" action={`${payload.config.routes.api}/globals/health-state/check`} title={t.checkNote}>
              <button type="submit" className="bl-btn bl-btn--primary">
                {t.check}
              </button>
            </form>
          </header>

          <div className={`bl-sec-status bl-sec-status--${level(worst)}${worst === 'emergency' ? ' bl-health-status--emergency' : ''}`} role="status">
            {worst === 'emergency' ? '🚨 ' : ''}
            {statusLine(problems.filter((p) => p.tier !== 'fyi'), lang)}
            {risk ? <div className="bl-health-risk">{t.atRisk(f.jod(risk))}</div> : null}
          </div>

          {problems.length ? (
            <div className="bl-card">
              <h3>{t.problems}</h3>
              <ul className="bl-sec-checks">
                {problems.map((p) => {
                  const [title, todo] = problemText(p, lang)
                  const link = linkOf(p)
                  return (
                    <li key={p.key} className={`bl-sec-check bl-sec-check--${level(p.tier)}`}>
                      <span className={`bl-sec-chip ${chip(p.tier) ? `bl-sec-chip--${chip(p.tier)}` : ''}`}>{TIER_LABEL[lang][p.tier]}</span>
                      <div>
                        <strong>{title}</strong>
                        {p.atRisk ? <div className="bl-health-risk bl-health-risk--small">{t.risk(f.jod(p.atRisk))}</div> : null}
                        <p>
                          <b>{t.whatToDo}:</b> {todo}
                        </p>
                      </div>
                      {link ? (
                        <a className="bl-btn" href={link} target={link.startsWith('/admin') ? undefined : '_blank'} rel="noreferrer">
                          {t.open}
                        </a>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          <div className="bl-dash__grid">
            <div className="bl-card">
              <h3>{t.watched}</h3>
              <ul className="bl-sec-fine bl-health-watched">
                {watched.map(([ok, line]) => (
                  <li key={line} className={ok ? undefined : 'is-bad'}>
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bl-card">
              <h3>{t.normal}</h3>
              <p className="bl-note">{t.normalNote}</p>
              <div className="bl-dash__stats">
                <div className="bl-stat bl-stat--small">
                  <span className="bl-stat__value">{b.orders}</span>
                  <span className="bl-stat__label">{t.n.orders}</span>
                </div>
                <div className="bl-stat bl-stat--small">
                  <span className="bl-stat__value">{f.jod(b.perDay)}</span>
                  <span className="bl-stat__label">{t.n.perDay}</span>
                </div>
                <div className="bl-stat bl-stat--small">
                  <span className="bl-stat__value">{b.aov ? f.jod(b.aov) : '–'}</span>
                  <span className="bl-stat__label">{t.n.aov}</span>
                </div>
                <div className="bl-stat bl-stat--small">
                  <span className="bl-stat__value">{b.checkoutRate ? `${Math.round(b.checkoutRate * 100)}%` : '–'}</span>
                  <span className="bl-stat__label">{t.n.rate}</span>
                </div>
              </div>
              {b.orders < 10 ? <p className="bl-note">{t.tooNew}</p> : null}
            </div>
          </div>

          <div className="bl-card">
            <h3>{t.how}</h3>
            <dl className="bl-sec-emergency">
              {t.howItems.map(([q, a]) => (
                <div key={q}>
                  <dt>{q}</dt>
                  <dd>{a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </Gutter>
    </DefaultTemplate>
  )
}

'use client'

import { useState } from 'react'

const copy = {
  en: {
    title: 'Two-factor login',
    intro: (email: string) => `Password accepted for ${email}. Enter the 6-digit code from your authenticator app.`,
    setupTitle: 'Set up two-factor login',
    setupIntro: 'Every admin account needs an authenticator app. Install one on your phone (Google Authenticator, Microsoft Authenticator, 1Password…), scan this code with it, then type the 6-digit code it shows.',
    recoveredIntro: 'Recovery code accepted. Set up the authenticator app on your new phone: scan this code, then type the 6-digit code it shows. The old phone stops working.',
    manual: 'Can’t scan? Type this key into the app instead:',
    code: 'Code',
    codeHint: 'Lost your phone? Type one of your recovery codes (xxxx-xxxx) instead.',
    trust: 'Trust this browser for 30 days (don’t ask for a code here). Leave unticked on a shared computer.',
    verify: 'Verify',
    checking: 'Checking…',
    cancel: 'Use a different account',
    wrong: (left?: number) => `That code didn’t work.${left ? ` ${left} ${left === 1 ? 'try' : 'tries'} left for this login.` : ''} Check the phone’s time is set automatically.`,
    restart: 'Too many wrong codes. Log in with your password again.',
    expired: 'This login has expired. Log in with your password again.',
    blocked: 'Too many wrong codes on this account. Code entry is paused for an hour, and the team has been emailed.',
    failed: 'Something went wrong. Try again.',
    codesTitle: 'Save your recovery codes',
    codesIntro: 'If you lose your phone, each of these codes logs you in once. They are shown only now: keep them somewhere safe (a password manager, or printed), not on the same phone.',
    copy: 'Copy codes',
    copied: 'Copied',
    saved: 'I’ve saved them',
    continue: 'Continue to the admin',
  },
  ar: {
    title: 'التحقق بخطوتين',
    intro: (email: string) => `تم قبول كلمة المرور لـ ${email}. أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة.`,
    setupTitle: 'إعداد التحقق بخطوتين',
    setupIntro: 'كل حساب مسؤول يحتاج تطبيق مصادقة. ثبّت تطبيقًا على هاتفك (Google Authenticator أو Microsoft Authenticator أو 1Password…)، امسح هذا الرمز به، ثم اكتب الرمز المكوّن من 6 أرقام الذي يظهر.',
    recoveredIntro: 'تم قبول رمز الاسترداد. أعدّ تطبيق المصادقة على هاتفك الجديد: امسح هذا الرمز ثم اكتب الرمز المكوّن من 6 أرقام. الهاتف القديم يتوقف عن العمل.',
    manual: 'لا يمكنك المسح؟ اكتب هذا المفتاح في التطبيق:',
    code: 'الرمز',
    codeHint: 'فقدت هاتفك؟ اكتب أحد رموز الاسترداد (xxxx-xxxx) بدلًا من ذلك.',
    trust: 'الوثوق بهذا المتصفح لمدة 30 يومًا (بدون طلب رمز هنا). اتركه بدون تحديد على جهاز مشترك.',
    verify: 'تحقق',
    checking: 'جارٍ التحقق…',
    cancel: 'استخدام حساب آخر',
    wrong: (left?: number) => `الرمز غير صحيح.${left ? ` تبقّى ${left} من المحاولات لهذا الدخول.` : ''} تأكد أن وقت الهاتف مضبوط تلقائيًا.`,
    restart: 'رموز خاطئة كثيرة. سجّل الدخول بكلمة المرور من جديد.',
    expired: 'انتهت صلاحية هذا الدخول. سجّل الدخول بكلمة المرور من جديد.',
    blocked: 'رموز خاطئة كثيرة على هذا الحساب. تم إيقاف إدخال الرموز لمدة ساعة وتم إبلاغ الفريق بالبريد.',
    failed: 'حدث خطأ. حاول مرة أخرى.',
    codesTitle: 'احفظ رموز الاسترداد',
    codesIntro: 'إذا فقدت هاتفك، كل رمز من هذه الرموز يُدخلك مرة واحدة. تظهر الآن فقط: احفظها في مكان آمن (مدير كلمات مرور أو مطبوعة)، وليس على نفس الهاتف.',
    copy: 'نسخ الرموز',
    copied: 'تم النسخ',
    saved: 'لقد حفظتها',
    continue: 'المتابعة إلى لوحة التحكم',
  },
}

type Props = {
  ar: boolean
  email: string
  setup: { qr: string; secret: string } | null
  recovered: boolean
  redirect: string
  endpoint: string
}

type Reply = { ok?: true; recoveryCodes?: string[]; setup?: true; error?: 'expired' | 'restart' | 'blocked' | 'wrong'; left?: number }

/** The code step of an admin login (see TwoFactor.tsx and src/lib/twoFactor.ts). */
export function TwoFactorForm({ ar, email, setup, recovered, redirect, endpoint }: Props) {
  const t = copy[ar ? 'ar' : 'en']
  const [code, setCode] = useState('')
  const [trust, setTrust] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const post = (body: object) =>
    fetch(endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !code.trim()) return
    setBusy(true)
    setError(null)
    try {
      const reply = (await (await post({ action: 'verify', code, trust })).json()) as Reply
      if (reply.ok) {
        if (reply.recoveryCodes?.length) setCodes(reply.recoveryCodes)
        else window.location.assign(redirect)
        return
      }
      // A recovery code was accepted: reload to show the new phone's QR code.
      if (reply.setup) return window.location.reload()
      setCode('')
      if (reply.error === 'restart' || reply.error === 'expired') {
        setError(reply.error === 'restart' ? t.restart : t.expired)
        setTimeout(() => window.location.reload(), 2500)
      } else setError(reply.error === 'blocked' ? t.blocked : t.wrong(reply.left))
    } catch {
      setError(t.failed)
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    setBusy(true)
    await post({ action: 'cancel' }).catch(() => null)
    window.location.reload()
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes!.join('\n'))
      setCopied(true)
    } catch {
      // Clipboard blocked: the codes are on screen to copy by hand.
    }
  }

  if (codes) {
    return (
      <div className="bl-2fa">
        <h2>{t.codesTitle}</h2>
        <p>{t.codesIntro}</p>
        <ol className="bl-2fa__codes" dir="ltr">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <div className="bl-2fa__row">
          <button type="button" className="btn btn--style-secondary btn--size-medium" onClick={copyCodes}>
            {copied ? t.copied : t.copy}
          </button>
        </div>
        <label className="bl-2fa__check">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> {t.saved}
        </label>
        <button type="button" className="btn btn--style-primary btn--size-large" disabled={!saved} onClick={() => window.location.assign(redirect)}>
          {t.continue}
        </button>
      </div>
    )
  }

  return (
    <form className="bl-2fa" onSubmit={submit}>
      <h2>{setup ? t.setupTitle : t.title}</h2>
      <p>{setup ? (recovered ? t.recoveredIntro : t.setupIntro) : t.intro(email)}</p>
      {setup ? (
        <>
          <div className="bl-2fa__qr" dangerouslySetInnerHTML={{ __html: setup.qr }} />
          <p className="bl-2fa__manual">
            {t.manual}
            <code dir="ltr" data-secret={setup.secret.replace(/\s/g, '')}>
              {setup.secret}
            </code>
          </p>
        </>
      ) : null}
      <label className="bl-2fa__label" htmlFor="bl-2fa-code">
        {t.code}
      </label>
      <input
        id="bl-2fa-code"
        className="bl-2fa__input"
        dir="ltr"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode={setup ? 'numeric' : 'text'}
        autoComplete="one-time-code"
        autoFocus
        maxLength={20}
        placeholder="123456"
        disabled={busy}
      />
      {setup ? null : <p className="bl-2fa__hint">{t.codeHint}</p>}
      <label className="bl-2fa__check">
        <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} disabled={busy} /> {t.trust}
      </label>
      {error ? (
        <p className="bl-2fa__error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn--style-primary btn--size-large" disabled={busy || !code.trim()}>
        {busy ? t.checking : t.verify}
      </button>
      <button type="button" className="bl-2fa__cancel" onClick={cancel} disabled={busy}>
        {t.cancel}
      </button>
    </form>
  )
}

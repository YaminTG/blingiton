import { headers } from 'next/headers'
import type { Payload } from 'payload'
import { getSafeRedirect } from 'payload/shared'
import QRCode from 'qrcode'

import { readPending, setupSecretOf } from '@/lib/twoFactor'
import { otpauthUrl, spaced } from '@/lib/totp'

import { TwoFactorForm } from './TwoFactorForm'

/**
 * Login page, before the form: when this browser has a login waiting for its two-factor code
 * (src/lib/twoFactor.ts), the password form is hidden and the code step shows instead. On a
 * first login (or after a recovery code) that's the QR code to set up an authenticator app.
 */
export async function TwoFactor({
  payload,
  searchParams,
  i18n,
}: {
  payload: Payload
  searchParams?: Record<string, string | string[] | undefined>
  i18n?: { language?: string }
}) {
  const login = await readPending(payload, await headers())
  if (!login) return null

  const redirect = getSafeRedirect({ redirectTo: searchParams?.redirect ?? '', fallbackTo: payload.config.routes.admin })

  let setup: { qr: string; secret: string } | null = null
  if (login.needsSetup) {
    const secret = setupSecretOf(login)
    if (secret) {
      const qr = await QRCode.toString(otpauthUrl(secret, login.user.email), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      setup = { qr, secret: spaced(secret) }
    }
  }

  return (
    <>
      <style>{'.login__form{display:none}'}</style>
      <TwoFactorForm
        ar={i18n?.language === 'ar'}
        email={login.user.email}
        setup={setup}
        recovered={Boolean(login.pending.recovered)}
        redirect={redirect}
        endpoint={`${payload.config.routes.api}/users/two-factor`}
      />
    </>
  )
}

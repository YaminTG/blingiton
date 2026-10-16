import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { codeAt, stepAt } from '../../src/lib/totp'

export interface LoginOptions {
  page: Page
  serverURL?: string
  user: {
    email: string
    password: string
  }
}

/**
 * Logs the user into the admin panel via the login page.
 */
export async function login({
  page,
  serverURL = 'http://localhost:3000',
  user,
}: LoginOptions): Promise<void> {
  await page.goto(`${serverURL}/admin/login`)

  await page.fill('#field-email', user.email)
  await page.fill('#field-password', user.password)
  await page.click('button[type="submit"]')

  // Two-factor: the seeded user is new, so the login page shows the setup QR code. Read the key
  // off the page, answer with the current code, then get past the recovery codes.
  const key = page.locator('[data-secret]')
  await expect(key).toBeVisible()
  const secret = (await key.getAttribute('data-secret')) ?? ''
  await page.fill('#bl-2fa-code', codeAt(secret, stepAt(Date.now())))
  await page.click('.bl-2fa button[type="submit"]')
  await page.check('.bl-2fa__check input')
  await page.click('.bl-2fa .btn--style-primary')

  await page.waitForURL(`${serverURL}/admin`)

  const dashboardArtifact = page.locator('span[title="Dashboard"]')
  await expect(dashboardArtifact).toBeVisible()
}

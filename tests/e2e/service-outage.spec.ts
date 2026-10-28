import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { visitLocale } from './helpers/locale'
import { localeCookieName } from '../../shared/locale'
import { outageCookie, outageOrigin } from './helpers/outage'

const copies = [
  { locale: 'ru', title: 'Сад временно недоступен', description: 'Сейчас не удаётся подключиться к саду. Пожалуйста, попробуйте немного позже.' },
  { locale: 'en', title: 'The garden is temporarily unavailable', description: 'We can’t connect to the garden right now. Please try again a little later.' }
]

async function expectLanding(page: Page, copy: typeof copies[number]) {
  await expect(page).toHaveURL(`${outageOrigin}/`)
  await expect(page.locator('.landing')).toBeVisible()
  const notice = page.getByTestId('service-unavailable-notice')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText(copy.title)
  await expect(notice).toContainText(copy.description)
  await expect(page.locator('.error-page, .auth-form, .account-page, .memorial-creation-form, canvas')).toHaveCount(0)
  await expect(page.getByText('Authentication unavailable', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

for (const copy of copies) {
  test(`${copy.locale}: an unavailable database leaves fresh guests on the landing for every service page`, async ({ page, request }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    expect((await request.get('/api/health')).status()).toBe(503)
    const home = await visitLocale(page, '/', copy.locale)
    expect(home?.status()).toBe(200)
    expect(home?.headers()['cache-control']).toContain('no-store')
    await expectLanding(page, copy)
    await page.screenshot({ path: testInfo.outputPath(`offline-${copy.locale}.png`), animations: 'disabled' })
    for (const path of ['/account', '/login', '/register', '/gardens', '/memorials/new?garden=lake&place=3', '/forgot-password', '/reset-password?token=offline-fixture', '/verify-email']) {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expectLanding(page, copy)
    }
    await page.getByRole('button', { name: copy.locale === 'ru' ? 'Закрыть уведомление' : 'Dismiss notification', exact: true }).click()
    await expect(page.getByTestId('service-unavailable-notice')).toHaveCount(0)
    await expect(page.locator('.landing')).toBeVisible()
    await page.reload()
    await expectLanding(page, copy)
    expect(errors).toEqual([])
  })

  test(`${copy.locale}: the fallback is rendered without JavaScript and preserves the existing session cookie`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    try {
      await context.addCookies([
        { name: localeCookieName, value: copy.locale, url: outageOrigin },
        { name: 'better-auth.session_token', value: outageCookie, url: outageOrigin, httpOnly: true, sameSite: 'Lax' }
      ])
      const response = await context.request.get(`${outageOrigin}/account`, { maxRedirects: 0 })
      expect(response.status()).toBe(302)
      expect(response.headers().location).toBe('/')
      const page = await context.newPage()
      const home = await page.goto(`${outageOrigin}/`)
      expect(home?.status()).toBe(200)
      await expectLanding(page, copy)
      const cookie = (await context.cookies()).find(item => item.name === 'better-auth.session_token')
      expect(cookie?.value).toBe(outageCookie)
      expect(await home!.text()).not.toContain('Stack Trace')
    } finally {
      await context.close()
    }
  })

  test(`${copy.locale}: repeated unavailable navigation stays on one landing and a restored session service recovers without reloading`, async ({ page }) => {
    await visitLocale(page, '/', copy.locale)
    await expectLanding(page, copy)
    let available = false
    let checks = 0
    await page.route('**/api/me', route => {
      checks++
      return route.fulfill(available
        ? { status: 401, json: { statusCode: 401, statusMessage: 'Unauthorized' } }
        : { status: 503, json: { statusCode: 503, statusMessage: 'Unavailable' } })
    })
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.locator('.hero-actions a').first().click()
      await expectLanding(page, copy)
      await expect(page.getByTestId('service-unavailable-notice')).toHaveCount(1)
    }
    // A connection failure uses the same safe fallback, rather than an error page.
    await page.unroute('**/api/me')
    await page.route('**/api/me', route => route.abort('connectionrefused'))
    await page.locator('.hero-actions a').last().click()
    await expectLanding(page, copy)
    await page.unroute('**/api/me')
    available = true
    await page.route('**/api/me', route => route.fulfill({ status: 401, json: { statusCode: 401, statusMessage: 'Unauthorized' } }))
    await page.locator('.hero-actions a').first().click()
    await expect(page).toHaveURL(`${outageOrigin}/register`)
    await expect(page.locator('.auth-form')).toBeVisible()
    await expect(page.getByTestId('service-unavailable-notice')).toHaveCount(0)
    expect(checks).toBeGreaterThanOrEqual(2)
    expect(checks).toBeLessThan(9)
  })
}

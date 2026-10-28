import { visitLocale } from './helpers/locale'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { hashPassword } from 'better-auth/crypto'
import { expect, test as base } from '@playwright/test'
import { getDatabaseOptions } from '../../server/db/config'
import { signInFixture } from './helpers/sign-in'

const origin = 'http://127.0.0.1:4173'
type Role = 'user' | 'admin'
type Member = { id: string, email: string, revoke: () => Promise<void> }

const test = base.extend<{ member: Member, role: Role }>({
  role: ['user', { option: true }],
  member: [async ({ page, baseURL, role }, use) => {
    const database = process.env.E2E_DATABASE
    if (baseURL !== origin || !database || !/^petmemoreal_e2e_\d+_[a-f0-9]{8}$/.test(database)) throw new Error('Landing auth fixtures require the temporary E2E database')
    const pool = new pg.Pool({ ...getDatabaseOptions(), database })
    const id = randomUUID()
    const email = `landing-${id}@example.test`
    const password = 'Landing-visitor-fixture-2026!'
    try {
      await pool.query('INSERT INTO auth_user (id, name, email, email_verified, role) VALUES ($1, $2, $3, true, $4)', [id, 'Landing visitor', email, role])
      await pool.query('INSERT INTO auth_account (id, account_id, provider_id, user_id, password) VALUES ($1, $2, $3, $4, $5)', [randomUUID(), id, 'credential', id, await hashPassword(password)])
      const response = await signInFixture(page.request, { origin, email, password })
      expect(response.ok()).toBe(true)
      await use({ id, email, revoke: async () => { await pool.query('DELETE FROM auth_session WHERE user_id = $1', [id]) } })
    } finally {
      await pool.query('DELETE FROM auth_user WHERE id = $1', [id])
      await pool.end()
    }
  }, { timeout: 90_000 }]
})

for (const locale of ['ru', 'en']) {
  base(`${locale}: a guest follows fixed landing links to registration and sign-in`, async ({ page }) => {
    const ru = locale === 'ru'
    const response = await visitLocale(page, `/`, locale)
    expect(response?.status()).toBe(200)
    expect(response?.headers()['cache-control']).toContain('private')
    expect(response?.headers()['cache-control']).toContain('no-store')
    await expect(page.locator('.landing')).toBeVisible()
    await expect(page.getByTestId('landing-sign-out')).toHaveCount(0)
    await page.locator('.hero-actions a').first().click()
    await expect(page).toHaveURL(new RegExp(`/register$`))
    await expect(page.locator('.auth-form')).toBeVisible()
    await expect(page.getByLabel(ru ? 'Ваше имя' : 'Your name', { exact: true })).toBeVisible()
    await page.locator('.auth-links').getByRole('link', { name: ru ? 'Вернуться ко входу' : 'Back to sign in', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/login$`))
    await expect(page.locator('.auth-form')).toBeVisible()
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
    await visitLocale(page, `/`, locale)
    await page.locator('.hero-actions a').last().click()
    await expect(page).toHaveURL(new RegExp(`/login$`))
    await page.locator('.auth-links').getByRole('link', { name: ru ? 'Создать аккаунт' : 'Create an account', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/register$`))
    expect((await page.request.get('/api/me')).status()).toBe(401)
  })

  for (const role of ['user', 'admin'] as const) {
    test.describe(`${locale}: ${role} session`, () => {
      test.use({ role })

      test('home redirects to gardens on the server, without JavaScript and during client navigation', async ({ page, browser, member }) => {
        await visitLocale(page, '/gardens', locale)
        const me = await page.request.get('/api/me')
        expect(await me.json()).toMatchObject({ id: member.id, email: member.email, role })
        const home = await page.request.get(`/`, { maxRedirects: 0 })
        expect(home.status()).toBe(302)
        expect(home.headers().location).toBe(`/gardens`)
        expect(home.headers()['cache-control']).toContain('private')
        expect(home.headers()['cache-control']).toContain('no-store')
        expect(await home.text()).not.toContain('id="hero-title"')
        const visitor = await browser.newContext()
        const withoutScripts = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState() })
        try {
          // A member's redirect must never be reused for a visitor with no session.
          const guestHome = await visitor.request.get(`${origin}/`, { maxRedirects: 0 })
          expect(guestHome.status()).toBe(200)
          expect(guestHome.headers()['cache-control']).toContain('no-store')
          const publicHtml = await guestHome.text()
          expect(publicHtml).toContain('id="hero-title"')
          expect(publicHtml).not.toContain(member.id)
          expect(publicHtml).not.toContain(member.email)
          expect((await page.request.get(`/`, { maxRedirects: 0 })).status()).toBe(302)
          const serverOnly = await withoutScripts.newPage()
          await serverOnly.goto(`${origin}/`)
          await expect(serverOnly).toHaveURL(new RegExp(`/gardens$`))
          await expect(serverOnly.locator('.landing')).toHaveCount(0)
          await expect(serverOnly.getByRole('heading', { level: 1 })).toHaveText(locale === 'ru' ? 'Четыре тихих сада' : 'Four quiet gardens')
        } finally {
          await visitor.close()
          await withoutScripts.close()
        }
        await visitLocale(page, `/`, locale)
        await expect(page).toHaveURL(new RegExp(`/gardens$`))
        await expect(page.getByTestId('garden-choices').getByRole('button')).toHaveCount(4)
        await expect(page.locator('.landing')).toHaveCount(0)
        for (const garden of ['meadow', 'lake', 'grove', 'hill']) {
          await page.getByTestId(`garden-choice-${garden}`).click()
          await expect(page).toHaveURL(new RegExp(`/gardens\\?garden=${garden}$`))
          await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
          await page.getByTestId('garden-home').click()
          await expect(page).toHaveURL(new RegExp(`/gardens$`))
          await expect(page.getByTestId('garden-choices').getByRole('button')).toHaveCount(4)
          await expect(page.locator('.landing')).toHaveCount(0)
        }
        for (const path of ['login', 'register']) {
          const response = await page.request.get(`/${path}`, { maxRedirects: 0 })
          expect(response.status()).toBe(302)
          expect(response.headers().location).toBe(`/account`)
          expect(response.headers()['cache-control']).toContain('no-store')
        }
        const gardenTarget = `/gardens?garden=lake&create=3`
        const creationTarget = `/memorials/new?garden=lake&place=3`
        for (const [redirect, target] of [[gardenTarget, creationTarget], [creationTarget, creationTarget], ['https://untrusted.example', `/account`]] as const) {
          const query = new URLSearchParams({ redirect })
          const response = await page.request.get(`/login?${query}`, { maxRedirects: 0 })
          expect(response.status()).toBe(302)
          expect(response.headers().location).toBe(target)
          expect(response.headers()['cache-control']).toContain('no-store')
        }
        await visitLocale(page, `/account`, locale)
        await expect(page.getByTestId('profile-name')).toHaveText('Landing visitor')
        await page.locator('.account-header .brand').click()
        await expect(page).toHaveURL(new RegExp(`/gardens$`))
        await expect(page.locator('.landing')).toHaveCount(0)
        await visitLocale(page, `/account`, locale)
        await page.getByRole('button', { name: locale === 'ru' ? 'Выйти' : 'Sign out', exact: true }).click()
        await expect(page).toHaveURL(new RegExp(`/$`))
        await expect(page.locator('.landing')).toBeVisible()
        expect((await page.request.get('/api/me')).status()).toBe(401)
        const signedOutHome = await visitLocale(page, `/`, locale)
        expect(signedOutHome?.status()).toBe(200)
        await expect(page.locator('.landing')).toBeVisible()
      })

      test('revoking a session restores the public landing and guest forms', async ({ page, member }) => {
        await visitLocale(page, `/`, locale)
        await expect(page).toHaveURL(new RegExp(`/gardens$`))
        await member.revoke()
        expect((await page.request.get('/api/me')).status()).toBe(401)
        const home = await visitLocale(page, `/`, locale)
        expect(home?.status()).toBe(200)
        await expect(page.locator('.landing')).toBeVisible()
        for (const path of ['register', 'login']) {
          const response = await visitLocale(page, `/${path}`, locale)
          expect(response?.status()).toBe(200)
          expect(response?.headers()['cache-control']).toContain('no-store')
          await expect(page).toHaveURL(new RegExp(`/${path}$`))
          await expect(page.locator('.auth-form')).toBeVisible()
        }
        await visitLocale(page, `/`, locale)
        await page.locator('.hero-actions a').last().click()
        await expect(page).toHaveURL(new RegExp(`/login$`))
        await expect(page.locator('.auth-form')).toBeVisible()
      })
    })
  }
}

test('a failed home-session check returns to the landing without signing the member out and recovers during navigation', async ({ page, member }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Session failure handling does not depend on viewport')
  await visitLocale(page, '/account', 'ru')
  await expect(page.getByTestId('profile-name')).toHaveText('Landing visitor')
  await page.route('**/api/me', route => route.fulfill({ status: 503, json: { statusCode: 503, statusMessage: 'Service unavailable' } }))
  await page.locator('.account-header .brand').click()
  await expect(page).toHaveURL(new URL('/', origin).href)
  await expect(page.locator('.landing')).toBeVisible()
  await expect(page.getByTestId('service-unavailable-notice')).toContainText('Сад временно недоступен')
  await expect(page.locator('.error-page, .auth-form, .account-page')).toHaveCount(0)
  await page.locator('.hero-actions a').first().click()
  await expect(page).toHaveURL(new URL('/', origin).href)
  await expect(page.getByTestId('service-unavailable-notice')).toHaveCount(1)
  await page.unroute('**/api/me')
  const response = await page.request.get('/api/me')
  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ id: member.id, email: member.email, role: 'user' })
  await page.locator('.hero-actions a').first().click()
  await expect(page).toHaveURL(new URL('/account', origin).href)
  await expect(page.getByTestId('profile-name')).toHaveText('Landing visitor')
  await expect(page.getByTestId('service-unavailable-notice')).toHaveCount(0)
  await page.locator('.account-header .brand').click()
  await expect(page).toHaveURL(/\/gardens$/)
  await expect(page.getByTestId('garden-choices').getByRole('button')).toHaveCount(4)
})

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

const password = 'Garden-memory-2026!'
const newPassword = 'Garden-new-memory-2026!'
const mailpit = `http://127.0.0.1:${process.env.MAILPIT_WEB_PORT || 8025}`

test('loopback page aliases redirect to the configured auth origin before showing the form', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Server redirect is independent of viewport')
  for (const host of ['localhost:4173', '[::1]:4173']) {
    const response = await request.get('/ru/register?redirect=%2Fru%2Fmemorials%2Fnew', { headers: { host }, maxRedirects: 0 })
    expect(response.status()).toBe(302)
    expect(response.headers().location).toBe('http://127.0.0.1:4173/ru/register?redirect=%2Fru%2Fmemorials%2Fnew')
    expect(response.headers()['cache-control']).toContain('no-store')
  }
  const canonical = await request.get('/en/register', { maxRedirects: 0 })
  expect(canonical.status()).toBe(200)
  // The Host header cannot redirect a non-loopback site or an API request.
  const external = await request.get('/en/register', { headers: { host: 'untrusted.example' }, maxRedirects: 0 })
  expect(external.status()).toBe(200)
  const api = await request.get('/api/auth/get-session', { headers: { host: 'localhost:4173' }, maxRedirects: 0 })
  expect(api.status()).toBe(200)
  expect(api.headers().location).toBeUndefined()
})

const copies = [
  { locale: 'ru', name: 'Ваше имя', password: 'Пароль', confirm: 'Повторите пароль', register: 'Зарегистрироваться', login: 'Войти', sent: 'Проверьте почту:', unverified: 'Сначала подтвердите почту.', verified: 'Почта подтверждена.', welcome: 'Здравствуйте, Тест', logout: 'Выйти', reset: 'Отправить ссылку', save: 'Сохранить пароль', changed: 'Пароль изменён.', credentials: 'Неверный email или пароль.', resend: 'Отправить письмо', emailSent: 'Если для этого адреса', invalid: 'Ссылка недействительна', nameRequired: 'Укажите ваше имя.', mismatch: 'Пароли не совпадают.', subject: 'Подтвердите почту' },
  { locale: 'en', name: 'Your name', password: 'Password', confirm: 'Repeat password', register: 'Register', login: 'Sign in', sent: 'Check your inbox:', unverified: 'Confirm your email first.', verified: 'Email confirmed.', welcome: 'Hello, Тест', logout: 'Sign out', reset: 'Send reset link', save: 'Save password', changed: 'Your password has been changed.', credentials: 'Incorrect email or password.', resend: 'Send confirmation', emailSent: 'If this action is available', invalid: 'This link is invalid', nameRequired: 'Please enter your name.', mismatch: 'Passwords do not match.', subject: 'Confirm your email' }
]

async function emailLink(request: APIRequestContext, email: string, path: string, minimum = 1) {
  let messages: { ID: string, Subject: string }[] = []
  await expect.poll(async () => {
    const response = await request.get(`${mailpit}/api/v1/search`, { params: { query: `to:${email}` } })
    const data = await response.json()
    messages = data.messages ?? []
    return messages.length
  }).toBeGreaterThanOrEqual(minimum)
  for (const message of messages) {
    const response = await request.get(`${mailpit}/api/v1/message/${message.ID}`)
    const detail = await response.json()
    const link = (detail.Text as string).split(/\s+/).find(part => part.startsWith('http://127.0.0.1:4173/api/auth/') && part.includes(path))
    if (link) return { link, subject: message.Subject }
  }
  throw new Error('Expected a local authentication email')
}

async function login(page: Page, copy: typeof copies[number], email: string, value = password) {
  await page.goto(`/${copy.locale}/login`)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel(copy.password, { exact: true }).fill(value)
  await page.getByRole('button', { name: copy.login, exact: true }).click()
}

for (const copy of copies) {
  test(`${copy.locale}: registration, email, session, logout and password recovery`, async ({ page, request, browser, isMobile }, testInfo) => {
    const email = `e2e-${randomUUID()}@example.test`
    await page.goto(`/${copy.locale}/account`)
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/login$`))
    expect((await page.request.get('/api/me')).status()).toBe(401)

    await page.goto(`/${copy.locale}`)
    await expect(page.locator('.auth-header-login')).toBeVisible()
    await page.goto(`/${copy.locale}/register`)
    await page.getByRole('button', { name: copy.register, exact: true }).click()
    await expect(page.getByText(copy.nameRequired, { exact: true })).toBeVisible()
    await expect(page.getByLabel(copy.name, { exact: true })).toBeFocused()
    await page.getByLabel(copy.name, { exact: true }).fill('  Тест  ')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel(copy.password, { exact: true }).fill(password)
    await page.getByLabel(copy.confirm, { exact: true }).fill('different')
    await page.getByRole('button', { name: copy.register, exact: true }).click()
    await expect(page.getByText(copy.mismatch, { exact: true })).toBeVisible()
    await page.getByLabel(copy.confirm, { exact: true }).fill(password)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('registration.png'), fullPage: true })
    await page.getByRole('button', { name: copy.register, exact: true }).click()
    await expect(page.getByRole('main').getByRole('status')).toContainText(copy.sent)
    expect((await page.request.get('/api/me')).status()).toBe(401)

    await login(page, copy, email)
    await expect(page.getByRole('alert')).toContainText(copy.unverified)
    const initial = await emailLink(request, email, '/verify-email')
    expect(initial.subject).toContain(copy.subject)
    await page.goto(`/${copy.locale}/verify-email`)
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByRole('button', { name: copy.resend, exact: true }).click()
    await expect(page.getByRole('main').getByRole('status')).toContainText(copy.emailSent)
    const confirmation = await emailLink(request, email, '/verify-email', 2)
    await page.goto(confirmation.link)
    await expect(page.getByRole('main').getByRole('status')).toContainText(copy.verified)

    await login(page, copy, email)
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/account$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.locale === 'ru' ? 'Мой кабинет' : 'My account')
    await expect(page.getByTestId('profile-name')).toHaveText('Тест')
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.locale === 'ru' ? 'Мой кабинет' : 'My account')
    const me = await page.request.get('/api/me')
    expect(me.headers()['cache-control']).toContain('no-store')
    expect(await me.json()).toMatchObject({ email, emailVerified: true })
    const cookies = await page.context().cookies()
    expect(cookies.find(cookie => cookie.name.includes('session_token'))?.httpOnly).toBe(true)
    await page.locator('.account-header .brand').click()
    await expect(page.getByTestId('landing-sign-out')).toBeEnabled()
    await expect(page.locator('.auth-header-login')).toHaveCount(0)
    await page.locator('.invitation-actions a').last().click()
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/account$`))
    await page.getByRole('button', { name: copy.logout, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/login$`))
    expect((await page.request.get('/api/me')).status()).toBe(401)

    await login(page, copy, email)
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/account$`))
    const home = await page.goto(`/${copy.locale}`)
    expect(home?.headers()['cache-control']).toContain('no-store')
    // The first server-rendered response must already reflect the real cookie.
    expect(await home!.text()).toContain('data-testid="landing-sign-out"')
    const header = page.locator('.site-header')
    await expect(header.locator('.auth-header-login')).toHaveCount(0)
    await expect(header.locator('.header-cta')).toHaveCount(0)
    await expect(page.locator('.invitation-actions a').last()).toHaveAttribute('href', `/${copy.locale}/account`)
    await page.reload()
    const exit = page.getByTestId('landing-sign-out')
    await expect(exit).toBeEnabled()
    await expect(exit).toHaveAccessibleName(copy.logout)
    const icon = (await exit.boundingBox())!
    expect(icon.width).toBeGreaterThanOrEqual(44)
    expect(icon.height).toBeGreaterThanOrEqual(44)
    if (isMobile) {
      await header.locator('.language-link').focus()
      await page.keyboard.press('Tab')
      await expect(exit).toBeFocused()
    } else await exit.hover()
    const tooltip = page.locator('[data-slot="content"] [data-slot="text"]')
    await expect(tooltip).toHaveText(copy.logout)
    await expect(tooltip).toBeVisible()
    await expect(exit).toHaveAccessibleDescription(copy.logout)
    await page.screenshot({ path: testInfo.outputPath('landing-signed-in.png'), animations: 'disabled' })

    await page.route('**/api/auth/sign-out', route => route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'Unavailable' } }))
    if (isMobile) await exit.tap()
    else await exit.click()
    await expect(page.getByText(copy.locale === 'ru' ? 'Не удалось выполнить запрос. Попробуйте ещё раз немного позже.' : 'We could not complete your request. Please try again shortly.', { exact: true })).toBeVisible()
    await expect(exit).toBeEnabled()
    expect((await page.request.get('/api/me')).status()).toBe(200)
    await page.unroute('**/api/auth/sign-out')
    if (isMobile) await exit.tap()
    else await exit.click()
    await expect(exit).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}$`))
    await expect(header.locator('.auth-header-login')).toBeVisible()
    await expect(header.locator('.header-cta')).toHaveAttribute('href', `/${copy.locale}/register`)
    expect((await page.request.get('/api/me')).status()).toBe(401)
    await page.reload()
    await expect(exit).toHaveCount(0)
    await expect(header.locator('.auth-header-login')).toBeVisible()

    // Keep a second real session open; resetting a password must revoke it.
    const other = await browser.newContext()
    try {
      const signedIn = await other.request.post('http://127.0.0.1:4173/api/auth/sign-in/email', { data: { email, password }, headers: { origin: 'http://127.0.0.1:4173' } })
      expect(signedIn.ok()).toBe(true)
      await page.goto(`/${copy.locale}/forgot-password`)
      await page.getByLabel('Email', { exact: true }).fill(email)
      await page.getByRole('button', { name: copy.reset, exact: true }).click()
      await expect(page.getByRole('main').getByRole('status')).toContainText(copy.emailSent)
      const reset = await emailLink(request, email, '/reset-password/', 3)
      await page.goto(reset.link)
      const resetToken = new URL(page.url()).searchParams.get('token')
      await page.getByLabel(copy.password, { exact: true }).fill(newPassword)
      await page.getByLabel(copy.confirm, { exact: true }).fill(newPassword)
      await page.getByRole('button', { name: copy.save, exact: true }).click()
      await expect(page.getByRole('main').getByRole('status')).toContainText(copy.changed)
      await expect(page).not.toHaveURL(/token=/)
      expect((await other.request.get('http://127.0.0.1:4173/api/me')).status()).toBe(401)
      const replay = await request.post('/api/auth/reset-password', { data: { token: resetToken, newPassword: password }, headers: { origin: 'http://127.0.0.1:4173' } })
      expect(replay.ok()).toBe(false)
      await login(page, copy, email)
      await expect(page.getByRole('alert')).toContainText(copy.credentials)
      await login(page, copy, email, newPassword)
      await expect(page).toHaveURL(new RegExp(`/${copy.locale}/account$`))
    } finally {
      await other.close()
    }
  })

  test(`${copy.locale}: invalid links, generic recovery response and network errors`, async ({ page }) => {
    await page.goto(`/${copy.locale}/reset-password?error=INVALID_TOKEN`)
    await expect(page.getByRole('alert')).toContainText(copy.invalid)
    await expect(page.getByRole('button', { name: copy.save, exact: true })).toHaveCount(0)
    await page.goto(`/${copy.locale}/forgot-password`)
    await page.getByLabel('Email', { exact: true }).fill(`absent-${randomUUID()}@example.test`)
    await page.getByRole('button', { name: copy.reset, exact: true }).click()
    await expect(page.getByRole('main').getByRole('status')).toContainText(copy.emailSent)
    await page.goto(`/${copy.locale}/login`)
    await page.route('**/api/auth/sign-in/email', route => route.abort())
    await page.getByLabel('Email', { exact: true }).fill('absent@example.test')
    await page.getByLabel(copy.password, { exact: true }).fill(password)
    await page.getByRole('button', { name: copy.login, exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('button', { name: copy.login, exact: true })).toBeEnabled()
  })
}

test('server rejects invalid input, untrusted origins and privilege escalation', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Server rules do not depend on viewport')
  const headers = { origin: 'http://127.0.0.1:4173' }
  const email = `security-${randomUUID()}@example.test`
  const signup = { name: 'Security test', email, password }
  expect((await request.post('/api/auth/sign-up/email', { headers, data: { ...signup, name: ' ' } })).status()).toBe(400)
  expect((await request.post('/api/auth/sign-up/email', { headers, data: { ...signup, password: 'short' } })).status()).toBe(400)
  expect((await request.post('/api/auth/sign-up/email', { headers: { origin: 'https://untrusted.example' }, data: signup })).status()).toBe(403)
  expect((await request.post('/api/auth/sign-up/email', { headers, data: { ...signup, callbackURL: 'https://untrusted.example' } })).status()).toBe(403)
  const created = await request.post('/api/auth/sign-up/email', { headers, data: { ...signup, role: 'admin', emailVerified: true } })
  expect(created.ok()).toBe(true)
  const data = await created.json()
  expect(data.user).toMatchObject({ role: 'user', emailVerified: false })
  expect(data.token).toBeNull()
  const duplicate = await request.post('/api/auth/sign-up/email', { headers, data: signup })
  expect(duplicate.status()).toBe(created.status())
  expect((await duplicate.json()).token).toBeNull()
})

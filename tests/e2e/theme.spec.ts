import { visitLocale } from './helpers/locale'
import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import { expectCompactFocus, expectFieldTextSeparated, expectModestCorners } from './helpers/ui-controls'

async function expectReadableButton(button: Locator) {
  await expect(button).toBeEnabled()
  const contrast = await button.evaluate((element) => {
    const style = getComputedStyle(element)
    function luminance(color: string) {
      const channels = (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map((value) => {
        const channel = value / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
    }
    const foreground = luminance(style.color)
    const background = luminance(style.backgroundColor)
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
  })
  expect(contrast).toBeGreaterThanOrEqual(4.5)
}

for (const locale of ['ru', 'en']) {
  test(`${locale}: focused authentication stays readable, keyboard accessible and stable while submitting`, async ({ page, isMobile }, testInfo) => {
    const ru = locale === 'ru'
    await visitLocale(page, '/login?redirect=%2Fgardens%3Fgarden%3Dgrove', locale)
    await page.keyboard.press('Tab')
    await expect(page.locator('.skip-link')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#auth-main')).toBeFocused()
    const recovery = page.locator('.auth-password-help')
    await expect(recovery).toHaveText(ru ? 'Забыли пароль?' : 'Forgot your password?')
    await expect(recovery).toHaveAttribute('href', '/forgot-password?redirect=/gardens?garden=grove')
    for (const control of await page.locator('.auth-header-actions a, .auth-page header .brand, .auth-password-help, .auth-links a').all()) {
      if (!await control.isVisible()) continue
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    if (isMobile) {
      await expect(page.locator('.auth-aside')).toBeHidden()
      expect((await page.locator('.auth-card').boundingBox())!.y).toBeLessThan(130)
    }
    const email = page.getByLabel('Email', { exact: true })
    const password = page.getByLabel(ru ? 'Пароль' : 'Password', { exact: true })
    await email.fill('request-retry@example.test')
    await password.fill('A-valid-password-2026')
    const submit = page.locator('.auth-form button[type="submit"]')
    const original = (await submit.boundingBox())!
    let calls = 0
    let release: (() => void) | undefined
    const held = new Promise<void>(resolve => { release = resolve })
    await page.route('**/api/auth/sign-in/email', async route => {
      calls++
      await held
      await route.fulfill({ status: 401, json: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid credentials' } })
    })
    try {
      await expect(page.locator('.auth-form')).toHaveAttribute('novalidate', '')
      await submit.click()
      await expect(page.locator('.auth-form')).toHaveAttribute('aria-busy', 'true')
      await expect(submit).toBeDisabled()
      await expect(email).toBeDisabled()
      await expect.poll(() => calls).toBe(1)
      await page.keyboard.press('Enter')
      expect(calls).toBe(1)
      const pending = (await submit.boundingBox())!
      expect(pending.width).toBeCloseTo(original.width, 0)
      expect(pending.height).toBeCloseTo(original.height, 0)
      await page.screenshot({ path: testInfo.outputPath('auth-request-pending.png'), fullPage: true, animations: 'disabled' })
      release!()
      await expect(page.getByRole('alert')).toContainText(ru ? 'Неверный email или пароль.' : 'Incorrect email or password.')
      await expect(submit).toBeEnabled()
      await expect(email).toHaveValue('request-retry@example.test')
      await expect(password).toHaveValue('A-valid-password-2026')
      await expect(page.locator('.auth-form')).toHaveAttribute('aria-busy', 'false')
      expect(calls).toBe(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('auth-request-error.png'), fullPage: true })
      await page.setViewportSize({ width: 320, height: 720 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.locator('.auth-card h1')).toBeVisible()
      await expect(submit).toBeEnabled()
      await page.screenshot({ path: testInfo.outputPath('auth-reflow-320.png'), fullPage: true })
    } finally {
      release?.()
    }
  })

  test(`${locale}: auth forms share the garden theme and remain usable`, async ({ page }, testInfo) => {
    const ru = locale === 'ru'
    await visitLocale(page, `/login`, locale)
    await expect(page.locator('header .brand')).toHaveText('PetMemoreal')
    await expect(page.locator('header .brand-mark')).toHaveCSS('border-top-width', '0px')
    const art = page.locator('.auth-background')
    await expect(art).toBeVisible()
    expect(await art.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await expectReadableButton(page.locator('.auth-form button[type="submit"]'))
    const password = page.getByLabel(ru ? 'Пароль' : 'Password', { exact: true })
    await expectModestCorners(password)
    await expectModestCorners(page.locator('.auth-form button[type="submit"]'))
    await expectCompactFocus(password)
    await expectFieldTextSeparated(password)
    await password.fill('Garden-example-2026')
    const toggle = page.getByRole('button', { name: ru ? 'Показать пароль' : 'Show password' })
    await expectCompactFocus(toggle)
    const textSpace = await password.evaluate((element) => {
      const style = getComputedStyle(element)
      const toggle = element.parentElement?.querySelector('button')
      const bounds = element.getBoundingClientRect()
      return { textEnd: bounds.right - Number.parseFloat(style.paddingRight), toggleStart: toggle?.getBoundingClientRect().left }
    })
    expect(textSpace.toggleStart).toBeDefined()
    expect(textSpace.textEnd).toBeLessThanOrEqual(textSpace.toggleStart! - 2)
    await page.screenshot({ path: testInfo.outputPath('password-focus.png'), animations: 'disabled' })
    await page.keyboard.press('Enter')
    await expect(page.getByLabel(ru ? 'Пароль' : 'Password', { exact: true })).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: ru ? 'Скрыть пароль' : 'Hide password' }).click()
    await expect(page.getByLabel(ru ? 'Пароль' : 'Password', { exact: true })).toHaveAttribute('type', 'password')
    await page.getByLabel(ru ? 'Пароль' : 'Password', { exact: true }).clear()
    await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true, animations: 'disabled' })

    await page.locator('.auth-links').getByRole('link', { name: ru ? 'Создать аккаунт' : 'Create an account', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/register$`))
    await page.locator('.auth-form button[type="submit"]').click()
    await expect(page.getByText(ru ? 'Укажите ваше имя.' : 'Please enter your name.', { exact: true })).toBeVisible()
    const invalidName = page.getByLabel(ru ? 'Ваше имя' : 'Your name', { exact: true })
    await expect(invalidName).toBeFocused()
    await expect(invalidName).toHaveAttribute('aria-invalid', 'true')
    await expectCompactFocus(invalidName)
    await expectFieldTextSeparated(invalidName)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('register-errors.png'), fullPage: true, animations: 'disabled' })

    await visitLocale(page, `/register`, locale)
    await page.locator('.auth-form button[type="submit"]:not([disabled])').waitFor()
    await page.screenshot({ path: testInfo.outputPath('register.png'), fullPage: true, animations: 'disabled' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('.auth-card')).toHaveCSS('animation-name', 'none')
    for (const route of ['forgot-password', 'verify-email', 'reset-password?error=INVALID_TOKEN']) {
      await visitLocale(page, `/${route}`, locale)
      await expect(page.locator('.auth-card h1')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.locator('.auth-page .brand').click()
    await expect(page).toHaveURL(new RegExp(`/$`))
  })

  test(`${locale}: a late sign-in response does not replace a newer recovery page`, async ({ page }) => {
    await visitLocale(page, '/login', locale)
    await page.getByLabel('Email', { exact: true }).fill('late-reply@example.test')
    await page.getByLabel(locale === 'ru' ? 'Пароль' : 'Password', { exact: true }).fill('A-valid-password-2026')
    let release: (() => void) | undefined
    const held = new Promise<void>(resolve => { release = resolve })
    const submitted = page.waitForRequest('**/api/auth/sign-in/email')
    await page.route('**/api/auth/sign-in/email', async route => {
      await held
      await route.fulfill({ status: 200, json: {} })
    })
    try {
      await page.locator('.auth-form button[type="submit"]').click()
      await submitted
      await page.locator('.auth-password-help').click()
      await expect(page).toHaveURL(/\/forgot-password$/)
      const finished = page.waitForResponse('**/api/auth/sign-in/email')
      release!()
      await finished
      // The response has completed before checking that the user's newer route remains active.
      await expect(page.locator('.auth-form')).toHaveAttribute('aria-busy', 'false')
      await expect(page).toHaveURL(/\/forgot-password$/)
      await expect(page.locator('.auth-card h1')).toHaveText(locale === 'ru' ? 'Восстановить доступ' : 'Recover access')
    } finally {
      release?.()
    }
  })

  test(`${locale}: readable actions and responsive navigation to registration`, async ({ page }) => {
    await visitLocale(page, `/`, locale)
    await expect(page.locator('header .brand')).toHaveText('PetMemoreal')
    await expect(page.locator('header .brand-mark')).toHaveCSS('border-top-width', '0px')
    const create = page.locator('.hero-actions a').first()
    await expectReadableButton(create)
    await create.focus()
    await expect(create).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/register$`))
    await visitLocale(page, `/`, locale)

    await page.locator('.auth-header-login').click()
    await expect(page).toHaveURL(new RegExp(`/login$`))
    await page.locator('.auth-links').getByRole('link', { name: locale === 'ru' ? 'Создать аккаунт' : 'Create an account', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/register$`))
    await expectReadableButton(page.locator('.auth-form button[type="submit"]'))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

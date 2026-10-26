import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'

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
  test(`${locale}: auth forms share the garden theme and remain usable`, async ({ page }, testInfo) => {
    const ru = locale === 'ru'
    await page.goto(`/${locale}/login`)
    const art = page.locator('.auth-background')
    await expect(art).toBeVisible()
    expect(await art.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await expectReadableButton(page.locator('.auth-form button[type="submit"]'))
    await page.getByLabel(ru ? 'Пароль' : 'Password', { exact: true }).fill('Garden-example-2026')
    const toggle = page.getByRole('button', { name: ru ? 'Показать пароль' : 'Show password' })
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel(ru ? 'Пароль' : 'Password', { exact: true })).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: ru ? 'Скрыть пароль' : 'Hide password' }).click()
    await expect(page.getByLabel(ru ? 'Пароль' : 'Password', { exact: true })).toHaveAttribute('type', 'password')
    await page.getByLabel(ru ? 'Пароль' : 'Password', { exact: true }).clear()
    await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true, animations: 'disabled' })

    await page.locator('.auth-links').getByRole('link', { name: ru ? 'Создать аккаунт' : 'Create an account', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/${locale}/register$`))
    await page.locator('.auth-form button[type="submit"]').click()
    await expect(page.getByText(ru ? 'Укажите ваше имя.' : 'Please enter your name.', { exact: true })).toBeVisible()
    await expect(page.getByLabel(ru ? 'Ваше имя' : 'Your name', { exact: true })).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('register-errors.png'), fullPage: true, animations: 'disabled' })

    await page.goto(`/${locale}/register`)
    await page.locator('.auth-form button[type="submit"]:not([disabled])').waitFor()
    await page.screenshot({ path: testInfo.outputPath('register.png'), fullPage: true, animations: 'disabled' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('.auth-card')).toHaveCSS('animation-name', 'none')
    for (const route of ['forgot-password', 'verify-email', 'reset-password?error=INVALID_TOKEN']) {
      await page.goto(`/${locale}/${route}`)
      await expect(page.locator('.auth-card h1')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.locator('.auth-page .brand').click()
    await expect(page).toHaveURL(new RegExp(`/${locale}$`))
  })

  test(`${locale}: readable actions and responsive navigation to registration`, async ({ page }) => {
    await page.goto(`/${locale}`)
    const create = page.locator('.hero-actions a').first()
    await expectReadableButton(create)
    await create.focus()
    await expect(create).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${locale}/register$`))
    await page.goto(`/${locale}`)

    await page.locator('.auth-header-login').click()
    await expect(page).toHaveURL(new RegExp(`/${locale}/login$`))
    await page.locator('.auth-links').getByRole('link', { name: locale === 'ru' ? 'Создать аккаунт' : 'Create an account', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/${locale}/register$`))
    await expectReadableButton(page.locator('.auth-form button[type="submit"]'))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

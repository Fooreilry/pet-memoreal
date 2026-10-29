import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import { visitLocale } from './helpers/locale'

async function textContrast(element: Locator) {
  return element.evaluate((target) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    function rgba(color: string) {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const values = Array.from(context.getImageData(0, 0, 1, 1).data)
      return [values[0]!, values[1]!, values[2]!, values[3]! / 255]
    }
    function blend(top: number[], bottom: number[]) { return top.slice(0, 3).map((value, index) => value * top[3]! + bottom[index]! * (1 - top[3]!)) }
    function luminance(rgb: number[]) {
      const values = rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      return values[0]! * .2126 + values[1]! * .7152 + values[2]! * .0722
    }
    const ancestors: Element[] = []
    for (let node: Element | null = target; node; node = node.parentElement) ancestors.unshift(node)
    const background = ancestors.reduce((color, node) => blend(rgba(getComputedStyle(node).backgroundColor), color), [255, 255, 255])
    const foreground = blend(rgba(getComputedStyle(target).color), background)
    const [light, dark] = [luminance(background), luminance(foreground)].sort((a, b) => b - a)
    return (light! + .05) / (dark! + .05)
  })
}

for (const locale of ['ru', 'en']) {
  test(`${locale}: actual error and success notices remain readable and safe primary states keep contrast`, async ({ page }, testInfo) => {
    await page.route('**/api/auth/sign-in/email', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid credentials' }) }))
    await visitLocale(page, '/login', locale)
    const submit = page.locator('.auth-form button[type="submit"]')
    await expect(submit).toBeEnabled()
    await expect(page.locator('.auth-form input').first()).toHaveCSS('font-size', '16px')
    expect(await textContrast(submit)).toBeGreaterThanOrEqual(4.5)
    await submit.hover()
    expect(await textContrast(submit)).toBeGreaterThanOrEqual(4.5)
    await page.getByLabel('Email', { exact: true }).fill('contrast@example.test')
    await page.getByLabel(locale === 'ru' ? 'Пароль' : 'Password', { exact: true }).fill('Contrast-fixture-2026')
    await submit.click()
    const errorTitle = page.getByRole('alert').locator('[data-slot="title"]')
    await expect(errorTitle).toBeVisible()
    expect(await textContrast(errorTitle)).toBeGreaterThanOrEqual(4.5)
    await page.screenshot({ path: testInfo.outputPath('readable-error.png'), fullPage: true })

    await visitLocale(page, '/login?verified=1', locale)
    const successTitle = page.locator('[role="status"] [data-slot="title"]')
    await expect(successTitle).toBeVisible()
    expect(await textContrast(successTitle)).toBeGreaterThanOrEqual(4.5)
    const root = await page.locator('html').evaluate(element => getComputedStyle(element).scrollbarColor)
    expect(root).not.toBe('auto')
    await page.emulateMedia({ forcedColors: 'active' })
    await expect(page.locator('html')).toHaveCSS('scrollbar-color', 'auto')
    await page.emulateMedia({ forcedColors: 'none' })
    await page.screenshot({ path: testInfo.outputPath('readable-success.png'), fullPage: true })
  })

  test(`${locale}: shared dialog and locale changes preserve the library-owned garden popover triggers`, async ({ page }) => {
    await visitLocale(page, '/gardens?garden=meadow', locale)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
    const switcher = page.getByTestId('garden-switch')
    await switcher.focus()
    await page.keyboard.press('Enter')
    await expect(switcher).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('garden-overview')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(switcher).toHaveAttribute('aria-expanded', 'false')

    const help = page.getByTestId('garden-help')
    await help.focus()
    await page.keyboard.press('Enter')
    await expect(help).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.garden-help-card')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(help).toHaveAttribute('aria-expanded', 'false')
  })
}

import { visitLocale } from './helpers/locale'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: the header stays above an inset garden with reachable controls and neighboring paths`, async ({ page }, testInfo) => {
    await visitLocale(page, `/gardens?garden=meadow`, locale)
    const canvas = page.locator('canvas')
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
    const title = page.getByRole('heading', { level: 1 })
    await expect(title).toHaveText(locale === 'ru' ? 'Луг' : 'Meadow')
    for (const size of [page.viewportSize()!, { width: 844, height: 390 }]) {
      await page.setViewportSize(size)
      await expect.poll(async () => {
        const bounds = await canvas.boundingBox()
        const stage = await page.locator('.garden-stage').boundingBox()
        return bounds && stage ? bounds.height - stage.height : Number.POSITIVE_INFINITY
      }).toBeCloseTo(0, 0)
      const bounds = (await canvas.boundingBox())!
      const header = (await page.getByTestId('garden-header').boundingBox())!
      expect(bounds.x).toBeGreaterThan(0)
      expect(bounds.y).toBeGreaterThanOrEqual(header.y + header.height)
      expect(bounds.x + bounds.width).toBeLessThan(size.width)
      expect(bounds.y + bounds.height).toBeLessThan(size.height)
      const heading = (await title.boundingBox())!
      expect(heading.x + heading.width / 2).toBeCloseTo(size.width / 2, 0)
      expect(heading.y).toBeLessThan(bounds.y + 40)
      const controls = (await page.locator('.camera-toolbar').boundingBox())!
      expect(controls.x).toBeGreaterThan(bounds.x + bounds.width * 0.7)
      expect(controls.y).toBeLessThan(bounds.y + 40)
      for (const element of [page.getByTestId('garden-switch'), page.getByTestId('garden-previous'), page.getByTestId('garden-next'), page.getByTestId('garden-zoom-in'), page.getByTestId('garden-fullscreen')]) {
        const box = (await element.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(bounds.x)
        expect(box.y).toBeGreaterThanOrEqual(bounds.y)
        expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width)
        expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height)
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`workspace-${size.width}.png`), animations: 'disabled' })
    }
    await expect(page.getByTestId('garden-previous')).toContainText(locale === 'ru' ? 'Холм' : 'Hill')
    await expect(page.getByTestId('garden-next')).toContainText(locale === 'ru' ? 'Озеро' : 'Lake')
    await page.getByTestId('garden-previous').click()
    await expect(title).toHaveText(locale === 'ru' ? 'Холм' : 'Hill')
    await expect(title).toBeFocused()
    await page.getByTestId('garden-next').click()
    await expect(title).toHaveText(locale === 'ru' ? 'Луг' : 'Meadow')
    await page.getByTestId('garden-next').click()
    await expect(title).toHaveText(locale === 'ru' ? 'Озеро' : 'Lake')
    await expect(page.getByTestId('garden-previous')).toContainText(locale === 'ru' ? 'Луг' : 'Meadow')
    await expect(page.getByTestId('garden-next')).toContainText(locale === 'ru' ? 'Роща' : 'Grove')
    await expect(page.getByTestId('garden-back')).toHaveCount(0)
    await page.getByTestId('garden-switch').click()
    await expect(page.getByTestId('garden-lake')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('garden-grove').click()
    await expect(title).toHaveText(locale === 'ru' ? 'Роща' : 'Grove')
    await expect(page.getByTestId('garden-grove')).toHaveCount(0)
  })
}

test('fullscreen keeps forms visible, tracks external exit and closes when leaving the garden', async ({ page }) => {
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: { user: { id: 'preview-user', emailVerified: true }, session: {} } }))
  await visitLocale(page, '/gardens?garden=lake', 'en')
  const toggle = page.getByTestId('garden-fullscreen')
  await expect(toggle).toBeEnabled()
  await toggle.click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true)
  await expect(toggle).toHaveAccessibleName('Exit fullscreen')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('garden-zoom-in').click()
  const empty = page.getByTestId('empty-lake-3')
  await empty.focus()
  await expect(empty).toBeInViewport()
  await empty.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveAccessibleName('Create a memorial')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Pet’s name', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close form' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => document.exitFullscreen())
  await expect(toggle).toHaveAccessibleName('Enter fullscreen')
  await expect(page.locator('.camera-toolbar output')).toHaveText('125%')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('garden-switch').click()
  await page.getByTestId('garden-home').click()
  await expect(page).toHaveURL(/\/$/)
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull()
})

test('an unsupported fullscreen API leaves the garden and zoom usable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false }))
  await visitLocale(page, '/gardens?garden=hill', 'en')
  await expect(page.getByTestId('garden-fullscreen')).toBeDisabled()
  await expect(page.getByTestId('garden-fullscreen')).toHaveAttribute('title', 'Fullscreen is unavailable in this browser')
  await page.getByTestId('garden-zoom-in').click()
  await expect(page.locator('.camera-toolbar output')).toHaveText('125%')
  const first = page.getByTestId('memorial-hill-1')
  await first.focus()
  await expect(first).toBeInViewport()
  await first.click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

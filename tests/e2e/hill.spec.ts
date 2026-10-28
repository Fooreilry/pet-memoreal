import { visitLocale } from './helpers/locale'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function clearPreview(page: Page) {
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  await page.mouse.move(0, 0)
  await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
})

test('the green hill opens from its preview and every monument stays reachable beside the scenery', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens', 'ru')
  await expect(page.getByTestId('garden-choice-hill')).toBeVisible()
  await clearPreview(page)
  await page.locator('canvas').screenshot({ path: testInfo.outputPath('hill-garden-selection.png') })
  const hill = page.getByTestId('garden-choice-hill')
  if (isMobile) await hill.tap()
  else await hill.click()
  await expect(page).toHaveURL(/\/gardens\?garden=hill$/)
  const scene = page.locator('.canvas-wrapper')
  const canvas = page.locator('canvas')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(canvas).toHaveAccessibleName(/Зелёные склоны, мшистые камни, кустарники и ручей\./)
  await expect(page.locator('.memorial-hit')).toHaveCount(14)
  await expect(page.locator('.memorial-empty')).toHaveCount(10)
  await clearPreview(page)
  await canvas.screenshot({ path: testInfo.outputPath('hill-garden.png') })
  await page.getByTestId('garden-zoom-in').click()
  await expect(page.locator('.camera-toolbar output')).toHaveText('125%')
  for (const place of [1, 2, 7, 14]) {
    const stone = page.getByTestId(`memorial-hill-${place}`)
    await stone.focus()
    await expect(stone).toBeInViewport()
    if (isMobile) await stone.tap()
    else await stone.click()
    await expect(page.getByRole('dialog').locator('.memorial-location')).toContainText(`Место ${place}`)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(stone).toBeFocused()
  }
  await page.getByTestId('memorial-hill-1').focus()
  await clearPreview(page)
  await canvas.screenshot({ path: testInfo.outputPath('hill-detail.png') })
  expect(errors).toEqual([])
})

test('hill scenery preserves the complete layout after rotation and a free place remains keyboard accessible', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: null }))
  await visitLocale(page, '/gardens?garden=hill', 'en')
  const scene = page.locator('.canvas-wrapper')
  const canvas = page.locator('canvas')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(canvas).toHaveAccessibleName(/Green slopes, mossy rocks, shrubs and a stream\./)
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size)
    // Wait for the backing canvas to catch up with the CSS size after rotation.
    await expect.poll(() => canvas.evaluate((element) => {
      const resolution = Math.min(devicePixelRatio || 1, 2)
      const surface = element as HTMLCanvasElement
      return Math.abs(surface.width - surface.clientWidth * resolution) + Math.abs(surface.height - surface.clientHeight * resolution)
    })).toBeLessThan(3)
    await expect(scene).toHaveAttribute('data-motion', 'paused')
    await expect(page.locator('.memorial-hit')).toHaveCount(14)
    await expect(page.locator('.memorial-hit[data-monument-kind]')).toHaveCount(4)
    // Dynamic viewport units can settle after the backing canvas during rotation.
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    await clearPreview(page)
    await canvas.screenshot({ path: testInfo.outputPath(`hill-${size.width}.png`) })
  }
  await page.getByTestId('garden-zoom-in').click()
  const empty = page.getByTestId('empty-hill-3')
  await expect(empty).toBeEnabled()
  await empty.focus()
  await expect(empty).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  expect(new URL(page.url()).searchParams.get('redirect')).toBe('/memorials/new?garden=hill&place=3')
  expect(errors).toEqual([])
})

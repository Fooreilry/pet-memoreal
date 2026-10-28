import { visitLocale } from './helpers/locale'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function clearPreview(page: Page) {
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  await page.mouse.move(0, 0)
  await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
}

async function chooseGarden(page: Page, garden: string) {
  await page.getByTestId('garden-switch').click()
  await page.getByTestId(`garden-${garden}`).click()
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
})

test('the detailed lake opens from its preview and water lilies, mist and shoreline plants leave every monument reachable', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []
  const images: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.resourceType() === 'image') images.push(request.url()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens', 'ru')
  const lake = page.getByTestId('garden-choice-lake')
  await expect(lake).toBeVisible()
  await clearPreview(page)
  await page.locator('canvas').screenshot({ path: testInfo.outputPath('lake-garden-selection.png') })
  if (isMobile) await lake.tap()
  else await lake.click()
  await expect(page).toHaveURL(/\/gardens\?garden=lake$/)
  const scene = page.locator('.canvas-wrapper')
  const canvas = page.locator('canvas')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  await expect(canvas).toHaveAccessibleName(/Тихая вода, кувшинки, прибрежная зелень и лёгкая дымка\./)
  await expect(page.locator('.memorial-hit')).toHaveCount(10)
  await expect(page.locator('.memorial-empty')).toHaveCount(6)
  await expect(page.locator('.memorial-hit[data-monument-kind]')).toHaveCount(4)
  await clearPreview(page)
  await canvas.screenshot({ path: testInfo.outputPath('lake-garden.png') })
  await page.getByTestId('garden-zoom-in').click()
  await expect(page.locator('.camera-toolbar output')).toHaveText('125%')
  for (const place of [1, 2, 5, 10]) {
    const stone = page.getByTestId(`memorial-lake-${place}`)
    await stone.focus()
    await expect(stone).toBeInViewport()
    if (isMobile) await stone.tap()
    else await stone.click()
    await expect(page.getByRole('dialog').locator('.memorial-location')).toContainText(`Место ${place}`)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(stone).toBeFocused()
  }
  await page.getByTestId('memorial-lake-1').focus()
  await clearPreview(page)
  await canvas.screenshot({ path: testInfo.outputPath('lake-detail.png') })
  expect(images.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true)
  expect(errors).toEqual([])
})

test('lake mist obeys pause and reduced motion while rotation and sparse plants preserve all four gardens', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: null }))
  await visitLocale(page, '/gardens?garden=lake', 'en')
  const scene = page.locator('.canvas-wrapper')
  const canvas = page.locator('canvas')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(canvas).toHaveAccessibleName(/Quiet water, water lilies, shoreline plants and a light mist\./)
  await expect(canvas).toHaveAccessibleName(/Quiet ripples on the water/)
  await expect(scene).toHaveAttribute('data-motion', 'running')
  await clearPreview(page)
  const first = page.getByTestId('memorial-lake-1')
  await first.focus()
  await expect(first).toBeInViewport()
  await first.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(scene).toHaveAttribute('data-motion', 'running')
  await clearPreview(page)
  const moving = await canvas.screenshot()
  await expect.poll(async () => Buffer.compare(moving, await canvas.screenshot())).not.toBe(0)
  const pause = page.getByTestId('garden-motion')
  await pause.click()
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  const still = await canvas.screenshot()
  // Several frames expose an accidentally running mist or water animation.
  await page.waitForTimeout(250)
  expect(Buffer.compare(still, await canvas.screenshot())).toBe(0)
  for (const size of [{ width: 360, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size)
    await expect.poll(() => canvas.evaluate(element => {
      const surface = element as HTMLCanvasElement
      const resolution = Math.min(devicePixelRatio || 1, 2)
      return Math.abs(surface.width - surface.clientWidth * resolution) + Math.abs(surface.height - surface.clientHeight * resolution)
    })).toBeLessThan(3)
    await expect(page.locator('.memorial-hit')).toHaveCount(10)
    await expect(scene).toHaveAttribute('data-motion', 'paused')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    await clearPreview(page)
    await canvas.screenshot({ path: testInfo.outputPath(`lake-${size.width}.png`) })
  }
  for (const [garden, count] of [['lake', 10], ['grove', 16], ['hill', 14], ['meadow', 12]] as const) {
    if (garden !== 'lake') await chooseGarden(page, garden)
    await expect(page.locator('canvas')).toHaveCount(1)
    await expect(page.locator('.memorial-hit')).toHaveCount(count)
    await expect(page.locator('.memorial-hit[data-monument-kind]')).toHaveCount(4)
    await expect(pause).toHaveAttribute('aria-pressed', 'true')
    await clearPreview(page)
    await canvas.screenshot({ path: testInfo.outputPath(`plants-${garden}.png`) })
  }
  await chooseGarden(page, 'lake')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(pause).toHaveCount(0)
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  await clearPreview(page)
  const reduced = await canvas.screenshot()
  await page.waitForTimeout(250)
  expect(Buffer.compare(reduced, await canvas.screenshot())).toBe(0)
  await page.getByTestId('garden-zoom-in').click()
  const empty = page.getByTestId('empty-lake-3')
  await expect(empty).toBeEnabled()
  await empty.focus()
  await expect(empty).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  expect(new URL(page.url()).searchParams.get('redirect')).toBe('/memorials/new?garden=lake&place=3')
  expect(errors).toEqual([])
})

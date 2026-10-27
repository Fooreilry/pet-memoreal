import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { visitLocale } from './helpers/locale'

const gardens = [
  { id: 'meadow', places: 12, name: 'Meadow' },
  { id: 'lake', places: 10, name: 'Lake' },
  { id: 'grove', places: 16, name: 'Grove' },
  { id: 'hill', places: 14, name: 'Hill' }
] as const

async function clearPreview(page: Page) {
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  await page.mouse.move(0, 0)
  await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('textured garden previews stay still and all four choices remain reachable', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await visitLocale(page, '/gardens', 'en')
  const scene = page.locator('.canvas-wrapper')
  const canvas = page.locator('canvas')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  await expect(page.getByTestId('garden-choices').getByRole('button')).toHaveCount(4)
  for (const garden of gardens) await expect(page.getByTestId(`garden-choice-${garden.id}`)).toBeInViewport()
  await clearPreview(page)
  const still = await canvas.screenshot({ path: testInfo.outputPath('textured-garden-overview.png') })
  // A stopped ticker must retain the cached surface instead of repainting random details.
  await page.waitForTimeout(150)
  expect(Buffer.compare(still, await canvas.screenshot())).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
  expect(errors).toEqual([])
})

for (const garden of gardens) {
  test(`${garden.id}: textured ground stays static while stories, zoom and the last place remain usable`, async ({ page, isMobile }, testInfo) => {
    const errors: string[] = []
    const images: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (request.resourceType() === 'image') images.push(request.url()) })
    await visitLocale(page, '/gardens', 'en')
    const choice = page.getByTestId(`garden-choice-${garden.id}`)
    if (isMobile) await choice.tap()
    else await choice.click()
    await expect(page).toHaveURL(new RegExp(`/gardens\\?garden=${garden.id}$`))
    const scene = page.locator('.canvas-wrapper')
    const canvas = page.locator('canvas')
    await expect(scene).toHaveAttribute('data-state', 'ready')
    await expect(scene).toHaveAttribute('data-motion', 'paused')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(garden.name)
    await expect(page.locator('.memorial-hit')).toHaveCount(garden.places)
    await expect(page.locator('.memorial-empty')).toHaveCount(garden.places - 4)
    await expect(page.locator('.memorial-empty:disabled')).toHaveCount(0)
    await expect(page.locator('.memorial-hit[data-monument-kind]')).toHaveCount(4)
    await clearPreview(page)
    await canvas.screenshot({ path: testInfo.outputPath(`${garden.id}-textured-ground.png`) })

    const first = page.getByTestId(`memorial-${garden.id}-1`)
    await first.focus()
    await expect(first).toBeInViewport()
    if (isMobile) await first.tap()
    else await first.click()
    await expect(page.getByRole('dialog').locator('.memorial-location')).toContainText('Place 1')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(first).toBeFocused()

    await page.getByTestId('garden-zoom-in').click()
    await page.getByTestId('garden-zoom-in').click()
    await expect(page.locator('.camera-toolbar output')).toHaveText('156%')
    const last = page.getByTestId(`memorial-${garden.id}-${garden.places}`)
    await last.focus()
    await expect(last).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog').locator('.memorial-location')).toContainText(`Place ${garden.places}`)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(last).toBeFocused()
    await expect(page.locator('.camera-toolbar output')).toHaveText('156%')
    await clearPreview(page)
    const detail = await canvas.screenshot({ path: testInfo.outputPath(`${garden.id}-textured-ground-detail-156.png`) })
    await page.waitForTimeout(150)
    expect(Buffer.compare(detail, await canvas.screenshot())).toBe(0)

    await page.getByTestId('garden-camera-reset').click()
    await expect(scene).toHaveAttribute('data-zoom', '1.000')
    await expect(scene).toHaveAttribute('data-camera-x', '0.00')
    await expect(scene).toHaveAttribute('data-camera-y', '0.00')
    await page.getByTestId('garden-next').click()
    await expect(scene).toHaveAttribute('data-state', 'ready')
    await expect(scene).toHaveAttribute('data-zoom', '1.000')
    await expect(page.locator('canvas')).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    expect(images.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true)
    expect(errors).toEqual([])
  })
}

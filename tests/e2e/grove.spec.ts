import { clickGardenControl, dismissGardenTools, ensureGardenControl } from './helpers/garden-controls'
import { openMemorialStory } from './helpers/memorial'
import { visitLocale } from './helpers/locale'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function clearPreview(page: Page) {
  await dismissGardenTools(page)
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  await page.mouse.move(0, 0)
  await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
})

test('the detailed grove opens from its preview and every monument remains reachable among trees and shrubs', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens', 'ru')
  const grove = page.getByTestId('garden-choice-grove')
  await expect(grove).toBeVisible()
  await clearPreview(page)
  await page.locator('canvas').screenshot({ path: testInfo.outputPath('grove-garden-selection.png') })
  if (isMobile) await grove.tap()
  else await grove.click()
  await expect(page).toHaveURL(/\/gardens\?garden=grove$/)
  const scene = page.locator('.canvas-wrapper')
  const canvas = page.locator('canvas')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(canvas).toHaveAccessibleName(/Тенистые поляны, многослойные кроны, кустарники и тёплые фонари\./)
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  await expect(page.locator('.memorial-hit')).toHaveCount(16)
  await expect(page.locator('.memorial-empty')).toHaveCount(12)
  await expect(page.locator('.memorial-hit[data-monument-kind]')).toHaveCount(4)
  await clearPreview(page)
  await canvas.screenshot({ path: testInfo.outputPath('grove-garden.png') })
  const initialZoom = Number(await scene.getAttribute('data-zoom'))
  await page.getByTestId('garden-zoom-in').click()
  await expect.poll(async () => Number(await scene.getAttribute('data-zoom'))).toBeCloseTo(Math.min(4, initialZoom * 1.25), 2)
  for (const place of [1, 2, 8, 16]) {
    const stone = page.getByTestId(`memorial-grove-${place}`)
    await stone.focus()
    await expect(stone).toBeInViewport()
    await openMemorialStory(page, stone, isMobile)
    await expect(page.getByRole('dialog').locator('.memorial-location')).toContainText(`Место ${place}`)
    await page.getByTestId('memorial-detail-return').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(stone).toBeFocused()
  }
  await page.getByTestId('memorial-grove-1').focus()
  await clearPreview(page)
  await canvas.screenshot({ path: testInfo.outputPath('grove-detail.png') })
  expect(errors).toEqual([])
})

test('grove leaves pause across hill visits, rotation keeps places clear and a guest can choose a free place', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: null }))
  await visitLocale(page, '/gardens?garden=grove', 'en')
  const scene = page.locator('.canvas-wrapper')
  const canvas = page.locator('canvas')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(canvas).toHaveAccessibleName(/Shaded clearings, layered canopies, shrubs and warm lanterns\./)
  await expect(canvas).toHaveAccessibleName(/Leaves drifting through the grove/)
  await expect(scene).toHaveAttribute('data-motion', 'running')
  await clearPreview(page)
  const moving = await canvas.screenshot()
  await expect.poll(async () => Buffer.compare(moving, await canvas.screenshot())).not.toBe(0)
  const pause = page.getByTestId('garden-motion')
  await clickGardenControl(page, 'garden-motion')
  await dismissGardenTools(page)
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  const still = await canvas.screenshot()
  // Check several frames so a ticker accidentally continuing to update is observable.
  await page.waitForTimeout(250)
  expect(Buffer.compare(still, await canvas.screenshot())).toBe(0)
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size)
    await expect.poll(() => canvas.evaluate(element => {
      const surface = element as HTMLCanvasElement
      const resolution = Math.min(devicePixelRatio || 1, 2)
      return Math.abs(surface.width - surface.clientWidth * resolution) + Math.abs(surface.height - surface.clientHeight * resolution)
    })).toBeLessThan(3)
    await expect(scene).toHaveAttribute('data-motion', 'paused')
    await expect(page.locator('.memorial-hit')).toHaveCount(16)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    await clearPreview(page)
    await canvas.screenshot({ path: testInfo.outputPath(`grove-${size.width}.png`) })
  }
  await page.getByTestId('garden-next').click()
  await expect(canvas).toHaveAccessibleName(/Green slopes, mossy rocks, shrubs and a stream\./)
  await ensureGardenControl(page, 'garden-motion')
  await expect(pause).toHaveAttribute('aria-pressed', 'true')
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  await clearPreview(page)
  await canvas.screenshot({ path: testInfo.outputPath('hill-shared-decor.png') })
  await page.getByTestId('garden-previous').click()
  await expect(canvas).toHaveAccessibleName(/Shaded clearings, layered canopies, shrubs and warm lanterns\./)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(pause).toHaveCount(0)
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  await page.getByTestId('garden-zoom-in').click()
  const empty = page.getByTestId('empty-grove-3')
  await expect(empty).toBeEnabled()
  await empty.focus()
  await expect(empty).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  expect(new URL(page.url()).searchParams.get('redirect')).toBe('/memorials/new?garden=grove&place=3')
  expect(errors).toEqual([])
})

import { clickGardenControl } from './helpers/garden-controls'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { PublicMemorial } from '../../shared/memorials'
import { visitLocale } from './helpers/locale'

const gardens = [
  { id: 'meadow', places: 12, name: 'Meadow' },
  { id: 'lake', places: 10, name: 'Lake' },
  { id: 'grove', places: 16, name: 'Grove' },
  { id: 'hill', places: 14, name: 'Hill' }
] as const

async function placement(page: Page) {
  return page.locator('.memorial-position').evaluateAll(elements => elements.map((element, index) => {
    const node = element as HTMLElement
    return { place: index + 1, x: Number(node.dataset.worldX), y: Number(node.dataset.worldY), chunk: node.dataset.chunkId }
  }))
}

async function clearPreview(page: Page) {
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  await page.mouse.move(0, 0)
  await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('seeded chunks keep their world positions through reload, garden changes and viewport rotation', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const originalViewport = page.viewportSize()!
  await visitLocale(page, '/gardens', 'en')
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  await clearPreview(page)
  await page.locator('canvas').screenshot({ path: testInfo.outputPath('organic-garden-overview.png') })

  for (const garden of gardens) {
    await visitLocale(page, `/gardens?garden=${garden.id}`, 'en')
    const view = page.locator('.canvas-wrapper')
    await expect(view).toHaveAttribute('data-state', 'ready')
    await expect(view).toHaveAttribute('data-layout-version', /\d+/)
    await expect(page.locator('.memorial-position')).toHaveCount(garden.places)
    const initial = await placement(page)
    expect(initial.every(place => Number.isFinite(place.x) && Number.isFinite(place.y) && !!place.chunk)).toBe(true)
    expect(new Set(initial.map(place => place.chunk)).size).toBeGreaterThan(1)
    // Small independent offsets should visibly break the former rows and columns.
    expect(new Set(initial.map(place => Math.round(place.x))).size).toBeGreaterThan(4)
    expect(new Set(initial.map(place => Math.round(place.y))).size).toBeGreaterThan(4)
    const version = await view.getAttribute('data-layout-version')
    await page.reload()
    await expect(view).toHaveAttribute('data-state', 'ready')
    await expect.poll(() => placement(page)).toEqual(initial)
    await expect(view).toHaveAttribute('data-layout-version', version!)
    await page.setViewportSize(isMobile ? { width: 844, height: 390 } : { width: 1100, height: 780 })
    await page.locator('canvas').screenshot()
    await expect.poll(() => placement(page)).toEqual(initial)
    await page.setViewportSize(originalViewport)
    await page.getByTestId('garden-next').click()
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(garden.name)
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(garden.name)
    await expect.poll(() => placement(page)).toEqual(initial)
  }
  expect(errors).toEqual([])
})

for (const garden of gardens) {
  test(`${garden.id}: every irregular place remains keyboard reachable and cached chunks follow the camera`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await visitLocale(page, `/gardens?garden=${garden.id}`, 'en')
    const view = page.locator('.canvas-wrapper')
    await expect(view).toHaveAttribute('data-state', 'ready')
    await expect(view).toHaveAttribute('data-motion', 'paused')
    await expect(page.locator('.memorial-hit')).toHaveCount(garden.places)
    await expect(page.locator('.memorial-empty')).toHaveCount(garden.places - 4)
    await expect(page.locator('.memorial-hit[data-monument-kind]')).toHaveCount(4)
    await expect.poll(async () => {
      const bounds = (await view.boundingBox())!
      for (const stone of await page.locator('.memorial-hit[data-monument-kind]').all()) {
        const box = (await stone.boundingBox())!
        const x = box.x + box.width / 2, y = box.y + box.height / 2
        if (x > bounds.x + 35 && x < bounds.x + bounds.width - 35 && y > bounds.y + 35 && y < bounds.y + bounds.height - 35) return true
      }
      return false
    }).toBe(true)
    const initial = await placement(page)
    const visibleAtStart = Number(await view.getAttribute('data-visible-chunks'))
    expect(visibleAtStart).toBeGreaterThan(0)
    expect(visibleAtStart).toBeLessThanOrEqual(garden.places)
    await clearPreview(page)
    await page.locator('canvas').screenshot({ path: testInfo.outputPath(`${garden.id}-organic-chunks.png`) })

    for (const button of await page.locator('.memorial-hit').all()) {
      await button.focus()
      await expect(button).toBeFocused()
      await expect(button).toBeInViewport()
      await expect(button).toBeEnabled()
      if (await button.getAttribute('data-monument-kind')) {
        await page.keyboard.press('Enter')
        await expect(page.getByTestId('memorial-summary')).toBeFocused()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.getByTestId('memorial-detail-return').click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(button).toBeFocused()
      }
    }
    await clickGardenControl(page, 'garden-camera-reset')
    const visibleAtCenter = Number(await view.getAttribute('data-visible-chunks'))
    const centeredZoom = Number(await view.getAttribute('data-zoom'))
    const zoomIn = page.getByTestId('garden-zoom-in')
    for (let step = 0; step < 4 && await zoomIn.isEnabled(); step++) await zoomIn.click()
    await expect(page.locator('.camera-toolbar output')).toHaveText(`${Math.round(Math.min(4, centeredZoom * 1.25 ** 4) * 100)}%`)
    const visibleZoomed = Number(await view.getAttribute('data-visible-chunks'))
    expect(visibleZoomed).toBeGreaterThan(0)
    expect(visibleZoomed).toBeLessThanOrEqual(visibleAtCenter)
    await view.focus()
    const before = Number(await view.getAttribute('data-camera-x'))
    await page.keyboard.press('ArrowRight')
    expect(Number(await view.getAttribute('data-camera-x'))).toBeLessThan(before)
    await expect.poll(() => placement(page)).toEqual(initial)
    await clearPreview(page)
    await page.locator('canvas').screenshot({ path: testInfo.outputPath(`${garden.id}-organic-chunks-zoom.png`) })
    const finalPlace = page.locator('.memorial-hit').last()
    await finalPlace.focus()
    await expect(finalPlace).toBeInViewport()
    expect(Number(await view.getAttribute('data-visible-chunks'))).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    expect(errors).toEqual([])
  })
}

test('loading a new saved memorial changes its contents without moving any chunk or breaking a direct link', async ({ page }) => {
  let saved: PublicMemorial[] = []
  await page.unroute('**/api/gardens/*/memorials')
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: saved }))
  await visitLocale(page, '/gardens?garden=meadow', 'en')
  const view = page.locator('.canvas-wrapper')
  await expect(view).toHaveAttribute('data-state', 'ready')
  await expect(page.getByTestId('empty-meadow-3')).toBeEnabled()
  const initial = await placement(page)
  saved = [{ source: 'saved', id: 'chunk-stability-fixture', gardenId: 'meadow', place: 3, name: 'A familiar friend',
    born: 2010, died: 2024, story: 'This memory stays in the same corner of the garden.', creatorName: null, species: 'pet' }]
  // Wait for the client route and its data fetch before using browser history.
  // A bare link click can resolve before Nuxt has committed its asynchronous push.
  const nextLoaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/gardens/lake/memorials' && response.ok())
  await page.getByTestId('garden-next').click()
  await nextLoaded
  await expect(page).toHaveURL(/\/gardens\?garden=lake$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lake')
  const meadowLoaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/gardens/meadow/memorials' && response.ok())
  await page.goBack()
  await meadowLoaded
  await expect(page).toHaveURL(/\/gardens\?garden=meadow$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Meadow')
  await expect(page.getByTestId('memorial-chunk-stability-fixture')).toBeAttached()
  await expect.poll(() => placement(page)).toEqual(initial)
  await page.goto('/gardens?garden=meadow&memorial=chunk-stability-fixture')
  await expect(page.getByRole('dialog')).toHaveAccessibleName('A familiar friend')
  await expect.poll(() => placement(page)).toEqual(initial)
  await page.getByTestId('memorial-detail-return').click()
  await expect(page.getByTestId('memorial-chunk-stability-fixture')).toBeFocused()
  await expect(page.getByTestId('memorial-chunk-stability-fixture')).toBeInViewport()
})

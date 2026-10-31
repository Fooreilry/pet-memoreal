import { clickGardenControl } from './helpers/garden-controls'
import { openMemorialStory } from './helpers/memorial'
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

async function sceneryFrame(page: Page, path?: string) {
  const hasTitle = await page.evaluate(() => {
    const title = document.querySelector<HTMLElement>('[data-testid="garden-title"].garden-title')
    if (!title) return false
    const bounds = title.getBoundingClientRect()
    // The fading title's fractional mask edge can leave one antialiased column.
    // Mask integer CSS bounds with a one-pixel gutter, preserving every scene pixel outside it.
    const mask = document.createElement('div')
    mask.dataset.testid = 'garden-surface-title-mask'
    mask.setAttribute('aria-hidden', 'true')
    Object.assign(mask.style, {
      position: 'fixed', left: `${Math.floor(bounds.left) - 1}px`, top: `${Math.floor(bounds.top) - 1}px`,
      width: `${Math.ceil(bounds.right) - Math.floor(bounds.left) + 2}px`,
      height: `${Math.ceil(bounds.bottom) - Math.floor(bounds.top) + 2}px`, pointerEvents: 'none'
    })
    document.body.appendChild(mask)
    return true
  })
  const mask = page.getByTestId('garden-surface-title-mask')
  try {
    return await page.locator('.canvas-wrapper').screenshot({ path, mask: hasTitle ? [mask] : [], animations: 'disabled' })
  } finally {
    if (hasTitle) await mask.evaluate(element => element.remove())
  }
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
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  await expect(page.getByTestId('garden-choices').getByRole('button')).toHaveCount(4)
  for (const garden of gardens) await expect(page.getByTestId(`garden-choice-${garden.id}`)).toBeInViewport()
  await clearPreview(page)
  const still = await sceneryFrame(page, testInfo.outputPath('textured-garden-overview.png'))
  // A stopped ticker must retain the cached surface instead of repainting random details.
  await page.waitForTimeout(150)
  expect(Buffer.compare(still, await sceneryFrame(page))).toBe(0)
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
    await expect(scene).toHaveAttribute('data-state', 'ready')
    await expect(scene).toHaveAttribute('data-motion', 'paused')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(garden.name)
    await expect(page.locator('.memorial-hit')).toHaveCount(garden.places)
    await expect(page.locator('.memorial-empty')).toHaveCount(garden.places - 4)
    await expect(page.locator('.memorial-empty:disabled')).toHaveCount(0)
    await expect(page.locator('.memorial-hit[data-monument-kind]')).toHaveCount(4)
    await clearPreview(page)
    await sceneryFrame(page, testInfo.outputPath(`${garden.id}-textured-ground.png`))

    const initialCamera = await scene.evaluate(element => ['data-zoom', 'data-camera-x', 'data-camera-y'].map(attribute => element.getAttribute(attribute)!))
    const initialZoom = Number(initialCamera[0])
    const first = page.getByTestId(`memorial-${garden.id}-1`)
    await first.focus()
    await expect(first).toBeInViewport()
    await openMemorialStory(page, first, isMobile)
    await expect(page.getByRole('dialog').locator('.memorial-location')).toContainText('Place 1')
    await page.getByTestId('memorial-detail-return').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(first).toBeFocused()

    await page.getByTestId('garden-zoom-in').click()
    await page.getByTestId('garden-zoom-in').click()
    await expect.poll(async () => Number(await scene.getAttribute('data-zoom'))).toBeCloseTo(Math.min(4, initialZoom * 1.25 ** 2), 2)
    const last = page.getByTestId(`memorial-${garden.id}-${garden.places}`)
    await last.focus()
    await expect(last).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('memorial-summary')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog').locator('.memorial-location')).toContainText(`Place ${garden.places}`)
    await page.getByTestId('memorial-detail-return').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(last).toBeFocused()
    await expect.poll(async () => Number(await scene.getAttribute('data-zoom'))).toBeCloseTo(Math.min(4, initialZoom * 1.25 ** 2), 2)
    await clearPreview(page)
    const detail = await sceneryFrame(page, testInfo.outputPath(`${garden.id}-textured-ground-detail-zoomed.png`))
    await page.waitForTimeout(150)
    const repeated = await sceneryFrame(page)
    if (Buffer.compare(detail, repeated) !== 0) {
      await testInfo.attach('paused-ground-initial', { body: detail, contentType: 'image/png' })
      await testInfo.attach('paused-ground-repeated', { body: repeated, contentType: 'image/png' })
    }
    expect(Buffer.compare(detail, repeated)).toBe(0)

    await clickGardenControl(page, 'garden-camera-reset')
    await expect(scene).toHaveAttribute('data-zoom', initialCamera[0]!)
    await expect(scene).toHaveAttribute('data-camera-x', initialCamera[1]!)
    await expect(scene).toHaveAttribute('data-camera-y', initialCamera[2]!)
    await page.getByTestId('garden-next').click()
    await expect(scene).toHaveAttribute('data-state', 'ready')
    await expect(scene).toHaveAttribute('data-zoom', initialCamera[0]!)
    await expect(page.locator('canvas')).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    expect(images.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true)
    expect(errors).toEqual([])
  })
}

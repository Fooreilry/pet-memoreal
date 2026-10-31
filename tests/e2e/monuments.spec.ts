import { openMemorialStory } from './helpers/memorial'
import { visitLocale } from './helpers/locale'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const gardens = ['meadow', 'lake', 'grove', 'hill'] as const
const kinds = ['arch', 'boulder', 'stele', 'tablet']

async function ready(page: Page, garden: typeof gardens[number], demoPlaces = 4) {
  // Wait for this garden's markers, not the previous scene still leaving the DOM.
  await expect(page.locator(`.memorial-hit[data-monument-kind][data-testid^="memorial-${garden}-"]`)).toHaveCount(demoPlaces)
  await expect(page.locator('.memorial-hit[data-monument-kind]')).toHaveCount(4)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
}

async function styles(page: Page) {
  return page.locator('.memorial-hit[data-monument-kind]').evaluateAll(elements => elements.map(element => ({
    id: element.getAttribute('data-testid'),
    kind: element.getAttribute('data-monument-kind'),
    x: element.closest<HTMLElement>('.memorial-position')!.dataset.worldX,
    y: element.closest<HTMLElement>('.memorial-position')!.dataset.worldY,
    chunk: element.closest<HTMLElement>('.memorial-position')!.dataset.chunkId
  })))
}

test('each garden has four distinct monument forms with usable stories at increased zoom', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []
  const imageRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.resourceType() === 'image') imageRequests.push(request.url()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
  await visitLocale(page, '/gardens?garden=meadow', 'ru')
  for (const [index, garden] of gardens.entries()) {
    if (index > 0) {
      await page.getByTestId('garden-switch').click()
      await page.getByTestId(`garden-${garden}`).click()
    }
    await ready(page, garden)
    const records = await styles(page)
    expect(records.map(record => record.kind).sort()).toEqual(kinds)
    await expect(page.locator('.memorial-empty[data-monument-kind]')).toHaveCount(0)
    const scene = page.locator('.canvas-wrapper')
    const initialZoom = Number(await scene.getAttribute('data-zoom'))
    await page.getByTestId('garden-zoom-in').click()
    await expect.poll(async () => Number(await scene.getAttribute('data-zoom'))).toBeCloseTo(Math.min(4, initialZoom * 1.25), 2)
    const stone = page.getByTestId(`memorial-${garden}-1`)
    await stone.focus()
    await expect(stone).toBeInViewport()
    await page.locator('canvas').screenshot({ path: testInfo.outputPath(`monuments-${garden}.png`) })
    await openMemorialStory(page, stone, isMobile)
    await expect(page.getByRole('dialog').locator('.memorial-location')).toContainText('Место 1')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(stone).toBeFocused()
  }
  expect(imageRequests.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true)
  expect(errors).toEqual([])
})

test('monument forms stay attached to their places after resize, reload and language changes', async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
  await visitLocale(page, '/gardens?garden=grove', 'ru')
  await ready(page, 'grove')
  const original = await styles(page)
  for (const record of original) {
    expect(Number(record.x)).toBeGreaterThan(0)
    expect(Number(record.y)).toBeGreaterThan(0)
    expect(record.chunk).toMatch(/^grove:v1:place-\d+$/)
  }
  for (const size of [{ width: 1200, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    await expect.poll(() => styles(page)).toEqual(original)
  }
  await page.reload()
  await ready(page, 'grove')
  expect(await styles(page)).toEqual(original)
  await page.getByRole('link', { name: 'Switch to English', exact: true }).click()
  await expect(page).toHaveURL(/\/gardens\?garden=grove$/)
  await ready(page, 'grove')
  expect(await styles(page)).toEqual(original)
  await page.getByTestId('memorial-grove-16').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('memorial-summary')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog').locator('.memorial-location')).toContainText('Place 16')
})

test('a saved memorial keeps the form of its place and opens for a guest by keyboard', async ({ page }, testInfo) => {
  const record = {
    source: 'saved', id: '4af299b0-5507-4ccb-8f56-13144a23ae73', gardenId: 'meadow', place: 1,
    name: 'Poppy', born: 2011, died: 2025, story: 'A friend who loved the quiet garden.',
    species: 'pet', creatorName: null
  }
  let saved = false
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: saved ? [record] : [] }))
  await visitLocale(page, '/gardens?garden=meadow', 'en')
  await ready(page, 'meadow')
  const originalKind = await page.getByTestId('memorial-meadow-1').getAttribute('data-monument-kind')
  expect(kinds).toContain(originalKind)
  saved = true
  await page.reload()
  await ready(page, 'meadow', 3)
  await expect(page.getByTestId('memorial-meadow-1')).toHaveCount(0)
  const stone = page.getByTestId(`memorial-${record.id}`)
  await expect(stone).toHaveAttribute('data-monument-kind', originalKind!)
  await page.getByTestId('garden-zoom-in').click()
  await stone.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('memorial-summary')).toBeFocused()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveAccessibleName('Poppy')
  await expect(dialog).toContainText(record.story)
  await expect(page.getByTestId('memorial-creator')).toContainText('Anonymous')
  await page.screenshot({ path: testInfo.outputPath('saved-monument-story.png'), animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(stone).toBeFocused()
})

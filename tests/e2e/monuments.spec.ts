import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const gardens = ['meadow', 'lake', 'grove', 'hill'] as const
const kinds = ['arch', 'boulder', 'stele', 'tablet']

async function ready(page: Page) {
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('.memorial-hit[data-monument-kind]')).toHaveCount(4)
}

async function styles(page: Page) {
  return page.locator('.memorial-hit[data-monument-kind]').evaluateAll(elements => elements.map(element => ({
    id: element.getAttribute('data-testid'),
    kind: element.getAttribute('data-monument-kind')
  })))
}

test('each garden has four distinct monument forms with usable stories at increased zoom', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []
  const imageRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.resourceType() === 'image') imageRequests.push(request.url()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
  await page.goto('/ru/gardens?garden=meadow')
  for (const [index, garden] of gardens.entries()) {
    if (index > 0) {
      await page.getByTestId('garden-switch').click()
      await page.getByTestId(`garden-${garden}`).click()
    }
    await ready(page)
    const records = await styles(page)
    expect(records.map(record => record.kind).sort()).toEqual(kinds)
    await expect(page.locator('.memorial-empty[data-monument-kind]')).toHaveCount(0)
    await page.getByTestId('garden-zoom-in').click()
    await expect(page.locator('.camera-toolbar output')).toHaveText('125%')
    const stone = page.getByTestId(`memorial-${garden}-1`)
    await stone.focus()
    await expect(stone).toBeInViewport()
    await page.locator('canvas').screenshot({ path: testInfo.outputPath(`monuments-${garden}.png`) })
    if (isMobile) await stone.tap()
    else await stone.click()
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
  await page.goto('/ru/gardens?garden=grove')
  await ready(page)
  const original = await styles(page)
  for (const size of [{ width: 1200, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    await expect.poll(() => styles(page)).toEqual(original)
  }
  await page.reload()
  await ready(page)
  expect(await styles(page)).toEqual(original)
  await page.getByRole('link', { name: 'Switch to English', exact: true }).click()
  await expect(page).toHaveURL(/\/en\/gardens\?garden=grove$/)
  await ready(page)
  expect(await styles(page)).toEqual(original)
  await page.getByTestId('memorial-grove-16').focus()
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
  await page.goto('/en/gardens?garden=meadow')
  await ready(page)
  const originalKind = await page.getByTestId('memorial-meadow-1').getAttribute('data-monument-kind')
  expect(kinds).toContain(originalKind)
  saved = true
  await page.reload()
  await ready(page)
  await expect(page.getByTestId('memorial-meadow-1')).toHaveCount(0)
  const stone = page.getByTestId(`memorial-${record.id}`)
  await expect(stone).toHaveAttribute('data-monument-kind', originalKind!)
  await page.getByTestId('garden-zoom-in').click()
  await stone.focus()
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

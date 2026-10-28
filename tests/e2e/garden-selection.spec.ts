import { visitLocale } from './helpers/locale'
import { expect, test } from '@playwright/test'

const gardens = ['meadow', 'lake', 'grove', 'hill'] as const

test('overview hover zooms scenery inside fixed compact cards while captions stay still', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens', 'en')
  const first = page.getByTestId('garden-choice-meadow')
  const second = page.getByTestId('garden-choice-lake')
  await expect(first).toBeVisible()
  const canvas = page.locator('canvas')
  const before = await canvas.screenshot()
  const size = (await first.boundingBox())!
  const nextSize = (await second.boundingBox())!
  const scale = Number(await page.locator('.canvas-wrapper').getAttribute('data-projection-scale'))
  expect(nextSize.x - size.x - size.width).toBeLessThan(20 * scale)
  const captionClip = {
    x: Math.ceil(size.x + 20 * scale),
    y: Math.ceil(size.y + size.height - 90 * scale),
    width: Math.floor(size.width - 40 * scale),
    height: Math.floor(70 * scale)
  }
  const caption = await page.screenshot({ clip: captionClip })
  await first.hover()
  await expect(first).toHaveClass(/garden-choice-active/)
  await expect(first).toHaveCSS('border-top-width', '0px')
  expect(await first.boundingBox()).toEqual(size)
  await expect.poll(async () => Buffer.compare(before, await canvas.screenshot())).not.toBe(0)
  expect(Buffer.compare(caption, await page.screenshot({ clip: captionClip }))).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('garden-hover.png'), animations: 'disabled' })
  await second.hover()
  await expect(second).toHaveClass(/garden-choice-active/)
  await expect(first).not.toHaveClass(/garden-choice-active/)
  await page.mouse.move(0, 0)
  await expect(page.locator('.garden-choice-active')).toHaveCount(0)
  await expect.poll(async () => Buffer.compare(before, await canvas.screenshot())).toBe(0)
  await first.focus()
  await expect(first).toBeFocused()
  await expect(first).toHaveCSS('outline-width', '2px')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/gardens\?garden=meadow$/)
})

test('scenery zoom animates with ambient motion paused and stops after hover settles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visitLocale(page, '/gardens?garden=meadow', 'en')
  await page.getByTestId('garden-motion').click()
  await page.getByTestId('garden-switch').click()
  await page.getByTestId('garden-overview').focus()
  await page.mouse.move(0, 0)
  await page.keyboard.press('Enter')
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  const first = page.getByTestId('garden-choice-meadow')
  const canvas = page.locator('canvas')
  const initial = await canvas.screenshot()
  const size = (await first.boundingBox())!
  await first.hover()
  await expect.poll(async () => Buffer.compare(initial, await canvas.screenshot())).not.toBe(0)
  // The short interaction finishes without starting a permanent animation loop.
  await page.waitForTimeout(320)
  const settled = await canvas.screenshot()
  await page.waitForTimeout(120)
  expect(Buffer.compare(settled, await canvas.screenshot())).toBe(0)
  expect(await first.boundingBox()).toEqual(size)
  await page.mouse.move(0, 0)
  await expect.poll(async () => Buffer.compare(initial, await canvas.screenshot())).toBe(0)
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: the garden overview has four tiles, selection works with touch and keyboard, and Back restores the overview`, async ({ page }, testInfo) => {
    const errors: string[] = []
    const requests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/gardens/*/memorials', (route) => {
      requests.push(route.request().url())
      return route.fulfill({ json: [] })
    })
    await visitLocale(page, `/gardens`, locale)
    const title = page.getByRole('heading', { level: 1 })
    const overviewTitle = locale === 'ru' ? 'Четыре тихих сада' : 'Four quiet gardens'
    await expect(title).toHaveText(overviewTitle)
    await expect(title).toHaveClass('sr-only')
    await expect(page.locator('.garden-hud, .garden-title')).toHaveCount(0)
    const header = page.getByTestId('garden-header')
    await expect(header).toBeVisible()
    await expect(page.getByTestId('garden-choices').getByRole('button')).toHaveCount(4)
    await expect(page.locator('.camera-toolbar, .garden-paths, .memorial-controls')).toHaveCount(0)
    const boxes = []
    for (const garden of gardens) {
      const tile = page.getByTestId(`garden-choice-${garden}`)
      await expect(tile).toBeInViewport()
      boxes.push((await tile.boundingBox())!)
    }
    // The restored overview is a 2x2 canvas, including on phones.
    expect(boxes[0]!.y).toBeCloseTo(boxes[1]!.y, 0)
    expect(boxes[2]!.y).toBeCloseTo(boxes[3]!.y, 0)
    expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x + boxes[0]!.width)
    expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height)
    expect(boxes[0]!.y).toBeGreaterThan((await header.boundingBox())!.y + (await header.boundingBox())!.height)
    expect(requests).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('garden-selection.png'), animations: 'disabled' })
    const lake = page.getByTestId('garden-choice-lake')
    if (testInfo.project.name === 'mobile') await lake.tap()
    else await lake.click()
    await expect(page).toHaveURL(new RegExp(`/gardens\\?garden=lake$`))
    await expect(title).toHaveText(locale === 'ru' ? 'Озеро' : 'Lake')
    await expect(title).toBeFocused()
    await expect(header).toBeVisible()
    await expect(page.locator('.memorial-hit')).toHaveCount(10)
    await expect(page.getByTestId('garden-choices')).toHaveCount(0)
    await page.goBack()
    await expect(title).toHaveText(overviewTitle)
    await expect(page.locator('canvas')).toHaveCount(1)
    const grove = page.getByTestId('garden-choice-grove')
    await grove.focus()
    await expect(grove).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/gardens\\?garden=grove$`))
    await page.reload()
    await expect(title).toHaveText(locale === 'ru' ? 'Роща' : 'Grove')
    await expect(page.locator('.memorial-hit')).toHaveCount(16)
    await page.getByTestId('garden-switch').click()
    await page.getByTestId('garden-overview').click()
    await expect(page).toHaveURL(new RegExp(`/gardens$`))
    await expect(title).toHaveText(overviewTitle)
    await expect(title).toBeFocused()
    await expect(page.getByTestId('garden-choices')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    expect(errors).toEqual([])
  })

  test(`${locale}: each overview tile opens its own garden, while direct memorial links bypass selection`, async ({ page }) => {
    await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
    for (const garden of gardens) {
      await visitLocale(page, `/gardens`, locale)
      await page.getByTestId(`garden-choice-${garden}`).click()
      await expect(page).toHaveURL(new RegExp(`/gardens\\?garden=${garden}$`))
      await expect(page.getByTestId(`memorial-${garden}-1`)).toBeVisible()
    }
    await visitLocale(page, `/gardens?garden=lake&memorial=lake-1`, locale)
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByTestId('garden-choices')).toHaveCount(0)
  })
}

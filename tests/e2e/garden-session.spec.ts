import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { visitLocale } from './helpers/locale'

const gardens = ['meadow', 'lake', 'grove', 'hill'] as const

async function positions(page: Page) {
  return page.locator('.memorial-position').evaluateAll(elements => elements.map(element => {
    const node = element as HTMLElement
    return { x: Number(node.dataset.worldX), y: Number(node.dataset.worldY), chunk: node.dataset.chunkId }
  }))
}

async function expectWholeMap(page: Page) {
  const view = page.locator('.canvas-wrapper')
  await expect(view).toHaveAttribute('data-state', 'ready')
  await expect(view).toHaveAttribute('data-zoom', '1.000')
  await expect(view).toHaveAttribute('data-camera-x', '0.00')
  await expect(view).toHaveAttribute('data-camera-y', '0.00')
  await expect(page.getByTestId('garden-frame')).toBeVisible()
  await expect(page.getByTestId('garden-frame')).toHaveAttribute('data-frame-style', 'seamless')
  await expect(page.getByTestId('garden-frame')).toHaveCSS('border-top-width', '0px')
  await expect(view).toHaveAttribute('data-landscape-space', 'world')
  await expect(view).toHaveAttribute('data-core-decor', 'chunks')
  await expect.poll(async () => Number(await view.getAttribute('data-surrounding-plants'))).toBeGreaterThan(0)
  // Check actual DOM dimensions after the viewport and its dynamic height settle.
  await expect.poll(async () => {
    const metrics = await view.evaluate(element => {
      const node = element as HTMLElement
      const rect = node.getBoundingClientRect()
      return { width: rect.width, height: rect.height, worldWidth: Number(node.dataset.worldWidth), worldHeight: Number(node.dataset.worldHeight),
        scale: Number(node.dataset.projectionScale), x: Number(node.dataset.projectionOffsetX), y: Number(node.dataset.projectionOffsetY) }
    })
    const { width, height, worldWidth, worldHeight, scale, x, y } = metrics
    return Object.values(metrics).every(Number.isFinite) && scale > 0 && worldWidth > 0 && worldHeight > 0
      && x >= 14 && y >= 14 && x + worldWidth * scale <= width - 14 && y + worldHeight * scale <= height - 14
      && Math.abs(x + worldWidth * scale / 2 - width / 2) < 1 && Math.abs(y + worldHeight * scale / 2 - height / 2) < 1
  }).toBe(true)
  const viewport = (await view.boundingBox())!
  const frame = (await page.getByTestId('garden-frame').boundingBox())!
  expect(frame.width).toBeGreaterThan(100)
  expect(frame.height).toBeGreaterThan(100)
  expect(frame.x).toBeGreaterThanOrEqual(viewport.x + 12)
  expect(frame.y).toBeGreaterThanOrEqual(viewport.y + 12)
  expect(frame.x + frame.width).toBeLessThanOrEqual(viewport.x + viewport.width - 12)
  expect(frame.y + frame.height).toBeLessThanOrEqual(viewport.y + viewport.height - 12)
  for (const stone of await page.locator('.memorial-hit').all()) {
    const bounds = (await stone.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(viewport.x)
    expect(bounds.y).toBeGreaterThanOrEqual(viewport.y)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.x + viewport.width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.y + viewport.height)
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('the continuous surroundings follow the same camera while the core keeps its chunk layout', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await visitLocale(page, '/gardens?garden=meadow', 'en')
  await expectWholeMap(page)
  const view = page.locator('.canvas-wrapper')
  const original = await positions(page)

  const environment = () => view.evaluate(element => {
    const node = element as HTMLElement
    return {
      width: node.clientWidth, height: node.clientHeight,
      scale: Number(node.dataset.surroundingScale), x: Number(node.dataset.surroundingX), y: Number(node.dataset.surroundingY),
      projection: Number(node.dataset.projectionScale), zoom: Number(node.dataset.zoom),
      expectedX: Number(node.dataset.projectionOffsetX) + Number(node.dataset.cameraX),
      expectedY: Number(node.dataset.projectionOffsetY) + Number(node.dataset.cameraY),
      bounds: JSON.parse(node.dataset.surroundingBounds!) as { left: number, right: number, top: number, bottom: number }
    }
  })
  async function expectContinuousCoverage() {
    await expect.poll(async () => {
      const state = await environment()
      return [state.scale, state.x, state.y, state.width, state.height, ...Object.values(state.bounds)].every(Number.isFinite)
        && state.scale > 0
        && Math.abs(state.scale - state.projection * state.zoom) < 0.002
        && Math.abs(state.x - state.expectedX) < 0.03 && Math.abs(state.y - state.expectedY) < 0.03
        && state.bounds.left * state.scale + state.x <= 1 && state.bounds.top * state.scale + state.y <= 1
        && state.bounds.right * state.scale + state.x >= state.width - 1 && state.bounds.bottom * state.scale + state.y >= state.height - 1
    }).toBe(true)
  }

  await expectContinuousCoverage()
  const initial = await environment()
  await view.screenshot({ path: testInfo.outputPath('continuous-garden-fit.png'), animations: 'disabled' })
  for (let step = 0; step < 4; step++) await page.getByTestId('garden-zoom-in').click()
  await expect(view).toHaveAttribute('data-zoom', '2.441')
  await expectContinuousCoverage()
  expect((await environment()).scale).toBeGreaterThan(initial.scale * 2)
  const zoomed = await environment()
  await view.focus()
  await page.keyboard.press('Shift+ArrowRight')
  await expect.poll(async () => (await environment()).x).toBeLessThan(zoomed.x - 90)
  await expectContinuousCoverage()
  expect((await environment()).bounds).toEqual(initial.bounds)
  expect(await positions(page)).toEqual(original)
  await view.screenshot({ path: testInfo.outputPath('continuous-garden-pan.png'), animations: 'disabled' })

  await page.getByTestId('garden-camera-reset').click()
  await expectWholeMap(page)
  await expectContinuousCoverage()
  await page.setViewportSize({ width: 820, height: 500 })
  await expectContinuousCoverage()
  expect(await positions(page)).toEqual(original)
  await page.reload()
  await expectWholeMap(page)
  await expectContinuousCoverage()
  expect(await positions(page)).toEqual(original)
  expect(errors).toEqual([])
})

test('all four complete maps and their frames fit at 100% on portrait, desktop and wide screens', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  for (const garden of gardens) {
    await visitLocale(page, `/gardens?garden=${garden}`, 'en')
    await expectWholeMap(page)
    await page.locator('.canvas-wrapper').screenshot({ path: testInfo.outputPath(`${garden}-whole-map-frame.png`), animations: 'disabled' })
  }
  await page.setViewportSize(isMobile ? { width: 844, height: 390 } : { width: 1920, height: 650 })
  for (const garden of gardens) {
    await visitLocale(page, `/gardens?garden=${garden}`, 'en')
    await expectWholeMap(page)
    await page.locator('.canvas-wrapper').screenshot({ path: testInfo.outputPath(`${garden}-wide-whole-map-frame.png`), animations: 'disabled' })
  }
  await page.getByTestId('garden-zoom-in').click()
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-zoom', '1.250')
  await page.getByTestId('garden-camera-reset').click()
  await expectWholeMap(page)
  expect(errors).toEqual([])
})

test('one visitor session preserves arrangement through reload, garden selection and shared tabs', async ({ page, context }) => {
  await visitLocale(page, '/gardens?garden=meadow', 'en')
  await expectWholeMap(page)
  const view = page.locator('.canvas-wrapper')
  const seed = await view.getAttribute('data-session-seed')
  expect(seed).toMatch(/^\d+$/)
  const original = await positions(page)
  await page.reload()
  await expect(view).toHaveAttribute('data-state', 'ready')
  await expect(view).toHaveAttribute('data-session-seed', seed!)
  await expect.poll(() => positions(page)).toEqual(original)
  await page.getByTestId('garden-next').click()
  await expect(page).toHaveURL(/\/gardens\?garden=lake$/)
  await expect(view).toHaveAttribute('data-state', 'ready')
  await expect(view).toHaveAttribute('data-session-seed', seed!)
  await page.goBack()
  await expect(page).toHaveURL(/\/gardens\?garden=meadow$/)
  await expect(view).toHaveAttribute('data-state', 'ready')
  await expect.poll(() => positions(page)).toEqual(original)
  const otherTab = await context.newPage()
  try {
    await otherTab.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
    await visitLocale(otherTab, '/gardens?garden=meadow', 'en')
    await expect(otherTab.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
    await expect(otherTab.locator('.canvas-wrapper')).toHaveAttribute('data-session-seed', seed!)
    await expect.poll(() => positions(otherTab)).toEqual(original)
  } finally {
    await otherTab.close()
  }
})

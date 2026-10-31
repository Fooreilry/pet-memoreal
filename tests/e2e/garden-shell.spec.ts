import { clickGardenControl, dismissGardenTools, ensureGardenControl } from './helpers/garden-controls'
import { openMemorialStory } from './helpers/memorial'
import { visitLocale } from './helpers/locale'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function expectDrawingFrame(page: Page) {
  await expect.poll(() => page.locator('.canvas-wrapper').evaluate((scene) => {
    const host = scene.querySelector<HTMLElement>('.canvas-host')!
    const canvas = scene.querySelector('canvas')!
    const width = Number(scene.getAttribute('data-drawing-width'))
    const height = Number(scene.getAttribute('data-drawing-height'))
    const marginX = Number(scene.getAttribute('data-drawing-margin-x'))
    const marginY = Number(scene.getAttribute('data-drawing-margin-y'))
    const density = Math.min(devicePixelRatio || 1, 2)
    return Math.max(Math.abs(width - host.clientWidth - marginX * 2), Math.abs(height - host.clientHeight - marginY * 2),
      Math.abs(canvas.offsetLeft + marginX), Math.abs(canvas.offsetTop + marginY),
      Math.abs(canvas.clientWidth - width), Math.abs(canvas.clientHeight - height),
      Math.abs(canvas.width / density - width), Math.abs(canvas.height / density - height))
  })).toBeLessThanOrEqual(1)
}

async function expectWindowMap(page: Page) {
  await expect(page.locator('.gardens-page')).toHaveAttribute('data-expanded', 'true')
  await expect(page.getByTestId('garden-header')).toBeHidden()
  await expect.poll(() => page.evaluate(() => {
    const stage = document.querySelector('.garden-stage')!.getBoundingClientRect()
    const bounds = document.querySelector('.canvas-wrapper')!.getBoundingClientRect()
    return Math.max(Math.abs(stage.x), Math.abs(stage.y), Math.abs(stage.width - innerWidth), Math.abs(stage.height - innerHeight),
      Math.abs(bounds.x), Math.abs(bounds.y), Math.abs(bounds.width - innerWidth), Math.abs(bounds.height - innerHeight))
  })).toBeLessThanOrEqual(1)
  await expectDrawingFrame(page)
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}


async function escapeExpandedMap(page: Page) {
  const more = page.getByTestId('garden-more')
  if (await more.isVisible() && await more.getAttribute('aria-expanded') === 'true') {
    await page.keyboard.press('Escape')
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await expect(more).toBeFocused()
    await expectWindowMap(page)
  }
  await page.keyboard.press('Escape')
}

async function expectExpansionControlFocused(page: Page) {
  const more = page.getByTestId('garden-more')
  await expect(await more.isVisible() ? more : page.getByTestId('garden-fullscreen')).toBeFocused()
}

async function expectInsetMap(page: Page) {
  await expect(page.locator('.gardens-page')).toHaveAttribute('data-expanded', 'false')
  await expect(page.getByTestId('garden-header')).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const stage = document.querySelector('.garden-stage')!.getBoundingClientRect()
    const header = document.querySelector('[data-testid="garden-header"]')!.getBoundingClientRect()
    return stage.x > 0 && stage.y >= header.bottom && stage.right < innerWidth && stage.bottom < innerHeight
  })).toBe(true)
  await expectDrawingFrame(page)
}

async function forbidNativeFullscreen(page: Page) {
  await page.addInitScript(() => {
    const state = window as Window & { nativeFullscreenCalls: number }
    state.nativeFullscreenCalls = 0
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false })
    const forbidden = () => {
      state.nativeFullscreenCalls++
      throw new Error('The garden must expand inside the browser window')
    }
    Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: forbidden })
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: forbidden })
  })
}

async function expectNoNativeFullscreen(page: Page) {
  expect(await page.evaluate(() => (window as Window & { nativeFullscreenCalls: number }).nativeFullscreenCalls)).toBe(0)
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
}

async function expectRetainedPlacesBlocked(page: Page) {
  const controls = page.locator('.memorial-controls')
  await expect(controls).toHaveCount(1)
  await expect(controls).toHaveAttribute('aria-hidden', 'true')
  expect(await controls.evaluate(element => (element as HTMLElement).inert)).toBe(true)
  await expect(page.getByTestId('memorial-hill-1')).toHaveCount(1)
  await expect(page.getByTestId('empty-meadow-3')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: the header stays above an inset garden with reachable controls and neighboring paths`, async ({ page }, testInfo) => {
    await visitLocale(page, `/gardens?garden=meadow`, locale)
    const viewport = page.locator('.canvas-wrapper')
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
    const title = page.getByRole('heading', { level: 1 })
    await expect(title).toHaveText(locale === 'ru' ? 'Луг' : 'Meadow')
    for (const size of [page.viewportSize()!, { width: 844, height: 390 }, { width: 320, height: 640 }, { width: 720, height: 500 }, { width: 390, height: 390 }, { width: 320, height: 450 }]) {
      await page.setViewportSize(size)
      await expect.poll(async () => {
        const bounds = await viewport.boundingBox()
        const stage = await page.locator('.garden-stage').boundingBox()
        return bounds && stage ? bounds.height - stage.height : Number.POSITIVE_INFINITY
      }).toBeCloseTo(0, 0)
      await expectDrawingFrame(page)
      const bounds = (await viewport.boundingBox())!
      const header = (await page.getByTestId('garden-header').boundingBox())!
      expect(bounds.x).toBeGreaterThan(0)
      expect(bounds.y).toBeGreaterThanOrEqual(header.y + header.height)
      expect(bounds.x + bounds.width).toBeLessThan(size.width)
      expect(bounds.y + bounds.height).toBeLessThan(size.height)
      const heading = (await title.boundingBox())!
      expect(heading.x + heading.width / 2).toBeCloseTo(size.width / 2, 0)
      expect(heading.y).toBeLessThan(bounds.y + 40)
      const controls = (await page.locator('.camera-toolbar').boundingBox())!
      expect(controls.x + controls.width).toBeLessThanOrEqual(bounds.x + bounds.width)
      expect(controls.x + controls.width).toBeGreaterThan(bounds.x + bounds.width - 32)
      expect(controls.y).toBeLessThan(bounds.y + 40)
      const more = page.getByTestId('garden-more')
      const compact = await more.isVisible()
      if (compact) {
        expect(controls.width).toBeLessThanOrEqual(48)
        expect(controls.height).toBeLessThanOrEqual(170)
      }
      const overlapsHeading = controls.x < heading.x + heading.width && controls.x + controls.width > heading.x
        && controls.y < heading.y + heading.height && controls.y + controls.height > heading.y
      expect(overlapsHeading).toBe(false)
      const utility = compact ? more : page.getByTestId('garden-fullscreen')
      for (const element of [page.getByTestId('garden-switch'), page.getByTestId('garden-previous'), page.getByTestId('garden-next'), page.getByTestId('garden-zoom-in'), utility]) {
        const box = (await element.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(bounds.x)
        expect(box.y).toBeGreaterThanOrEqual(bounds.y)
        expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width)
        expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height)
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
      const expansion = await ensureGardenControl(page, 'garden-fullscreen')
      // Popover transforms can introduce subpixel float noise in DOMRect values.
      await expect.poll(() => expansion.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44 - 0.01)
      const expansionBounds = (await expansion.boundingBox())!
      expect(expansionBounds.width).toBeGreaterThanOrEqual(44 - 0.01)
      expect(expansionBounds.height).toBeGreaterThanOrEqual(44 - 0.01)
      await dismissGardenTools(page)
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.locator('.garden-path-label')).toHaveCount(0)
      await page.screenshot({ path: testInfo.outputPath(`workspace-${size.width}.png`), animations: 'disabled' })
    }
    await expect(page.getByTestId('garden-previous')).toContainText(locale === 'ru' ? 'Холм' : 'Hill')
    await expect(page.getByTestId('garden-next')).toContainText(locale === 'ru' ? 'Озеро' : 'Lake')
    await page.getByTestId('garden-previous').click()
    await expect(title).toHaveText(locale === 'ru' ? 'Холм' : 'Hill')
    await expect(title).toBeFocused()
    await page.getByTestId('garden-next').click()
    await expect(title).toHaveText(locale === 'ru' ? 'Луг' : 'Meadow')
    await page.getByTestId('garden-next').click()
    await expect(title).toHaveText(locale === 'ru' ? 'Озеро' : 'Lake')
    await expect(page.getByTestId('garden-previous')).toContainText(locale === 'ru' ? 'Луг' : 'Meadow')
    await expect(page.getByTestId('garden-next')).toContainText(locale === 'ru' ? 'Роща' : 'Grove')
    await expect(page.getByTestId('garden-back')).toHaveCount(0)
    await page.getByTestId('garden-switch').click()
    await expect(page.getByTestId('garden-lake')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('garden-grove').click()
    await expect(title).toHaveText(locale === 'ru' ? 'Роща' : 'Grove')
    await expect(page.getByTestId('garden-grove')).toHaveCount(0)
  })
}

for (const locale of ['ru', 'en']) {
  test(`${locale}: expanding the map fills only the browser window and preserves the camera across resize`, async ({ page }, testInfo) => {
    await forbidNativeFullscreen(page)
    await visitLocale(page, '/gardens?garden=hill', locale)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
    const expand = locale === 'ru' ? 'Развернуть карту на всё окно' : 'Expand map to window'
    const restore = locale === 'ru' ? 'Свернуть карту' : 'Restore map size'
    await expectInsetMap(page)
    await expect(await ensureGardenControl(page, 'garden-fullscreen')).toBeEnabled()
    await expect(await ensureGardenControl(page, 'garden-fullscreen')).toHaveAccessibleName(expand)
    const scene = page.locator('.canvas-wrapper')
    const initialZoom = Number(await scene.getAttribute('data-zoom'))
    await page.getByTestId('garden-zoom-in').click()
    await expect.poll(async () => Number(await scene.getAttribute('data-zoom'))).toBeCloseTo(Math.min(4, initialZoom * 1.25), 2)
    const zoomed = (await scene.getAttribute('data-zoom'))!
    const originalCanvas = await page.locator('canvas').elementHandle()
    const sceneAttributes = ['data-session-seed', 'data-layout-version', 'data-world-width', 'data-world-height']
    const sceneValues = await Promise.all(sceneAttributes.map(attribute => scene.getAttribute(attribute)))
    const place = page.getByTestId('memorial-hill-1').locator('..')
    const worldPosition = [await place.getAttribute('data-world-x'), await place.getAttribute('data-world-y')]
    await clickGardenControl(page, 'garden-fullscreen')
    await expectWindowMap(page)
    await expect(await ensureGardenControl(page, 'garden-fullscreen')).toHaveAccessibleName(restore)
    await expect(await ensureGardenControl(page, 'garden-fullscreen')).toHaveAttribute('aria-pressed', 'true')
    await expect(scene).toHaveAttribute('data-zoom', zoomed)
    await expect(place).toHaveAttribute('data-world-x', worldPosition[0]!)
    await expect(place).toHaveAttribute('data-world-y', worldPosition[1]!)
    await dismissGardenTools(page)
    await page.screenshot({ path: testInfo.outputPath(`map-window-${locale}.png`), scale: 'css', animations: 'disabled' })
    await page.setViewportSize({ width: 844, height: 390 })
    await expectWindowMap(page)
    expect(await page.locator('canvas').evaluate((canvas, previous) => canvas === previous, originalCanvas)).toBe(true)
    for (const [index, attribute] of sceneAttributes.entries()) await expect(scene).toHaveAttribute(attribute, sceneValues[index]!)
    await expect(place).toHaveAttribute('data-world-x', worldPosition[0]!)
    await expect(place).toHaveAttribute('data-world-y', worldPosition[1]!)
    await expect(scene).toHaveAttribute('data-zoom', zoomed)
    await expect(page.getByTestId('garden-switch')).toBeVisible()
    await expect(page.getByTestId('garden-next')).toBeVisible()
    await clickGardenControl(page, 'garden-fullscreen')
    await expectInsetMap(page)
    await expect(await ensureGardenControl(page, 'garden-fullscreen')).toHaveAccessibleName(expand)
    await expect(await ensureGardenControl(page, 'garden-fullscreen')).toHaveAttribute('aria-pressed', 'false')
    await expect(scene).toHaveAttribute('data-zoom', zoomed)
    await clickGardenControl(page, 'garden-fullscreen')
    await expectWindowMap(page)
    await escapeExpandedMap(page)
    await expectInsetMap(page)
    await expectExpansionControlFocused(page)
    await expectNoNativeFullscreen(page)
  })
}

test('expanded map keeps story dialogs and garden menus usable and Escape dismisses them before restoring the map', async ({ page }) => {
  test.setTimeout(60_000)
  await forbidNativeFullscreen(page)
  await visitLocale(page, '/gardens?garden=hill', 'en')
  await clickGardenControl(page, 'garden-fullscreen')
  await expectWindowMap(page)
  await dismissGardenTools(page)
  const first = page.getByTestId('memorial-hill-1')
  await first.focus()
  await expect(first).toBeInViewport()
  await openMemorialStory(page, first)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expectWindowMap(page)
  await expect(first).toBeFocused()
  await page.getByTestId('garden-switch').click()
  await expect(page.getByTestId('garden-overview')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('garden-overview')).toHaveCount(0)
  await expectWindowMap(page)
  await page.getByTestId('garden-next').click()
  await expect(page).toHaveURL(/\/gardens\?garden=meadow$/)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  await expectWindowMap(page)
  await page.getByTestId('garden-switch').click()
  await page.getByTestId('garden-overview').click()
  await expect(page).toHaveURL(/\/gardens$/)
  await expect(page.getByTestId('garden-choices').getByRole('button')).toHaveCount(4)
  await expectInsetMap(page)
  await expect(page.getByTestId('garden-fullscreen')).toHaveCount(0)
  await expectNoNativeFullscreen(page)
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: staged loading hides partial places and recovers from a data error before returning to garden choices`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let unavailable = true
    const id = '8bca0797-5d6c-4b68-b243-9c41c7fe0103'
    await page.route('**/api/gardens/lake/memorials', async (route) => {
      await gate
      await route.fulfill(unavailable
        ? { status: 503, json: { statusMessage: 'Memorials unavailable' } }
        : { json: [{ id, gardenId: 'lake', place: 3, name: 'Patient friend', born: 2010, died: 2024, story: 'A story that arrives with the whole garden.', source: 'saved', species: 'pet', creatorName: null, canEdit: false }] })
    })
    try {
      await visitLocale(page, '/gardens?garden=lake', locale)
      const scene = page.locator('.canvas-wrapper')
      const loading = page.getByTestId('garden-loading')
      await expect(scene).toHaveAttribute('data-state', 'loading')
      await expect(scene).toHaveAttribute('aria-busy', 'true')
      await expect(loading).toHaveAttribute('data-phase', 'stories')
      await expect(loading.getByRole('status')).toHaveText(locale === 'ru' ? 'Собираем истории…' : 'Gathering stories…')
      await expect(loading.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
      await expect(loading.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '3')
      await expect(loading.locator('.garden-loading-stages li')).toHaveText(locale === 'ru' ? ['Пейзаж', 'Истории', 'Места памяти'] : ['Scenery', 'Stories', 'Memorials'])
      await expect(loading.locator('.garden-loading-sprout')).toHaveCSS('animation-name', 'none')
      await expect(loading).toBeInViewport()
      await expect(page.locator('.canvas-host')).toBeHidden()
      await expect(page.locator('.memorial-hit, .garden-hud')).toHaveCount(0)
      await expect(page.getByTestId('garden-header')).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`garden-staged-loading-${locale}.png`), animations: 'disabled' })
      release()
      await expect(scene).toHaveAttribute('data-state', 'error')
      const alert = page.getByRole('alert')
      await expect(alert).toBeVisible()
      await expect(alert.getByRole('heading')).toHaveText(locale === 'ru' ? 'Не удалось открыть сад' : 'The garden could not be opened')
      await expect(alert).toContainText(locale === 'ru' ? 'Места памяти сейчас не загружаются.' : "Memorials aren't loading right now.")
      const retry = alert.getByRole('button')
      const retryBounds = (await retry.boundingBox())!
      expect(retryBounds.width).toBeGreaterThanOrEqual(44)
      expect(retryBounds.height).toBeGreaterThanOrEqual(44)
      await expect(page.locator('.memorial-hit, .garden-hud')).toHaveCount(0)
      await page.screenshot({ path: testInfo.outputPath(`garden-data-error-${locale}.png`), animations: 'disabled' })
      unavailable = false
      await retry.click()
      await expect(scene).toHaveAttribute('data-state', 'ready')
      await expect(scene).toHaveAttribute('aria-busy', 'false')
      await expect(loading).toHaveCount(0)
      await expect(page.getByTestId(`memorial-${id}`)).toBeVisible()
      await expect(page.getByTestId('empty-lake-3')).toHaveCount(0)
      await expect(page.locator('.memorial-hit')).toHaveCount(10)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale === 'ru' ? 'Озеро' : 'Lake')
      await page.getByTestId('garden-switch').click()
      await expect(page.getByTestId('garden-lake')).toHaveAttribute('aria-pressed', 'true')
      await page.getByTestId('garden-overview').click()
      await expect(page).toHaveURL(/\/gardens$/)
      await expect(scene).toHaveAttribute('data-state', 'ready')
      await expect(page.getByTestId('garden-choices').getByRole('button')).toHaveCount(4)
      await expect(page.locator('.memorial-hit, .garden-hud')).toHaveCount(0)
      await expect(page.getByTestId('garden-header')).toBeVisible()
    } finally { release() }
  })
}

test('window expansion ends on the creation page and starts inset after returning to the garden', async ({ page }) => {
  await forbidNativeFullscreen(page)
  await page.route('**/api/me', route => route.fulfill({ json: { id: 'preview-user', name: 'Preview', emailVerified: true } }))
  await visitLocale(page, '/gardens?garden=lake', 'en')
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  const initialZoom = (await scene.getAttribute('data-zoom'))!
  await expect(await ensureGardenControl(page, 'garden-fullscreen')).toBeEnabled()
  await clickGardenControl(page, 'garden-fullscreen')
  await expectWindowMap(page)
  await expect(await ensureGardenControl(page, 'garden-fullscreen')).toHaveAccessibleName('Restore map size')
  await expect(await ensureGardenControl(page, 'garden-fullscreen')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('garden-zoom-in').click()
  const empty = page.getByTestId('empty-lake-3')
  await empty.focus()
  await expect(empty).toBeInViewport()
  await empty.click()
  await expect(page).toHaveURL(/\/memorials\/new\?garden=lake&place=3$/)
  await expect(page.getByTestId('memorial-create-page')).toBeVisible()
  await expect(page.getByLabel('Pet’s name', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.gardens-page-expanded')).toHaveCount(0)
  await expect(page.getByTestId('garden-header')).toBeVisible()
  await expectNoNativeFullscreen(page)
  await page.getByTestId('memorial-create-cancel').click()
  await expect(page).toHaveURL(/\/gardens\?garden=lake$/)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  await expectInsetMap(page)
  await expect(await ensureGardenControl(page, 'garden-fullscreen')).toHaveAccessibleName('Expand map to window')
  await expect(scene).toHaveAttribute('data-zoom', initialZoom)
  await clickGardenControl(page, 'garden-fullscreen')
  await expect(await ensureGardenControl(page, 'garden-fullscreen')).toHaveAttribute('aria-pressed', 'true')
  await escapeExpandedMap(page)
  await expectInsetMap(page)
  await expect(await ensureGardenControl(page, 'garden-fullscreen')).toHaveAccessibleName('Expand map to window')
  await expect(scene).toHaveAttribute('data-zoom', initialZoom)
  await page.getByTestId('garden-zoom-in').click()
  await expect.poll(async () => Number(await scene.getAttribute('data-zoom'))).toBeCloseTo(Math.min(4, Number(initialZoom) * 1.25), 2)
  await clickGardenControl(page, 'garden-fullscreen')
  await expect(await ensureGardenControl(page, 'garden-fullscreen')).toHaveAttribute('aria-pressed', 'true')
  await clickGardenControl(page, 'garden-fullscreen')
  await expectInsetMap(page)
  await expectNoNativeFullscreen(page)
})

test('a map waiting for the neighboring garden can be restored before its data finishes loading', async ({ page }) => {
  await forbidNativeFullscreen(page)
  let release!: () => void
  const loading = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/gardens/meadow/memorials', async (route) => {
    await loading
    await route.fulfill({ json: [] })
  })
  try {
    await visitLocale(page, '/gardens?garden=hill', 'en')
    await clickGardenControl(page, 'garden-fullscreen')
    await expectWindowMap(page)
    await page.getByTestId('garden-next').click()
    await expect(page).toHaveURL(/\/gardens\?garden=meadow$/)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'loading')
    await expectRetainedPlacesBlocked(page)
    const restore = await ensureGardenControl(page, 'garden-fullscreen')
    await expect(restore).toHaveAccessibleName('Restore map size')
    await expect(restore).toBeEnabled()
    await expect(page.locator('.camera-toolbar button')).toHaveCount(1)
    await clickGardenControl(page, 'garden-fullscreen')
    await expectInsetMap(page)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'loading')
    await expectRetainedPlacesBlocked(page)
    await expect(page.locator('.camera-toolbar')).toHaveCount(0)
  } finally { release() }
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  await expectInsetMap(page)
  await expect(await ensureGardenControl(page, 'garden-fullscreen')).toHaveAccessibleName('Expand map to window')
  await expectNoNativeFullscreen(page)
})

test('a failed neighboring garden keeps window restoration available and retries in the inset view', async ({ page }) => {
  await forbidNativeFullscreen(page)
  let unavailable = true
  await page.route('**/api/gardens/meadow/memorials', route => route.fulfill(unavailable
    ? { status: 503, json: { statusMessage: 'Memorials unavailable' } }
    : { json: [] }))
  await visitLocale(page, '/gardens?garden=hill', 'en')
  await clickGardenControl(page, 'garden-fullscreen')
  await expectWindowMap(page)
  await page.getByTestId('garden-next').click()
  await expect(page).toHaveURL(/\/gardens\?garden=meadow$/)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'error')
  await expectRetainedPlacesBlocked(page)
  const restore = await ensureGardenControl(page, 'garden-fullscreen')
  await expect(restore).toHaveAccessibleName('Restore map size')
  await expect(restore).toBeEnabled()
  await expect(page.locator('.camera-toolbar button')).toHaveCount(1)
  await expect(page.getByTestId('garden-header')).toBeHidden()
  await clickGardenControl(page, 'garden-fullscreen')
  await expectInsetMap(page)
  await expect(page.locator('.camera-toolbar')).toHaveCount(0)
  unavailable = false
  await page.getByRole('alert').getByRole('button').click()
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  await expectInsetMap(page)
  await expect(await ensureGardenControl(page, 'garden-fullscreen')).toHaveAccessibleName('Expand map to window')
  await expectNoNativeFullscreen(page)
})

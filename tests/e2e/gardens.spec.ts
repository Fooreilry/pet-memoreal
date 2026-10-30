import { openMemorialStory } from './helpers/memorial'
import { visitLocale } from './helpers/locale'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

async function revealTarget(target: Locator) {
  // Focus also reveals a place after another interaction has moved the camera.
  await target.evaluate(element => { if (element instanceof HTMLElement) element.blur() })
  await target.focus()
  await expect(target).toBeInViewport()
}

async function chooseGarden(page: Page, id: string) {
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  const tile = page.getByTestId(`garden-choice-${id}`)
  if (await tile.isVisible()) {
    await tile.click()
  } else {
    await page.getByTestId('garden-switch').click()
    await page.getByTestId(`garden-${id}`).click()
  }
  await expect(page).toHaveURL(new RegExp(`[?&]garden=${id}(?:&|$)`))
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
}

test.beforeEach(async ({ page }) => {
  // Keep landscape/camera scenarios independent of concurrent real creations.
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
})

const gardens = ['meadow', 'lake', 'grove', 'hill'] as const

test('free places wait for a successful load and keyboard selection preserves the creation page through sign-in', async ({ page }, testInfo) => {
  let unavailable = true
  await page.route('**/api/gardens/meadow/memorials', route => route.fulfill(unavailable ? { status: 503, json: { statusMessage: 'Unavailable' } } : { json: [] }))
  await page.route('**/api/me', route => route.fulfill({ status: 401, json: { statusMessage: 'Unauthorized' } }))
  await visitLocale(page, '/gardens?garden=meadow', 'en')
  await expect(page.getByRole('alert')).toContainText('The garden could not be opened')
  await expect(page.getByRole('alert')).toContainText("Memorials aren't loading right now. Please try opening the garden again.")
  const empty = page.getByTestId('empty-meadow-3')
  await expect(empty).toHaveCount(0)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'error')
  unavailable = false
  await page.getByRole('alert').getByRole('button').click()
  await expect(empty).toBeEnabled()
  await expect(empty).not.toHaveAttribute('aria-haspopup', 'dialog')
  await revealTarget(empty)
  await empty.evaluate(element => (element as HTMLElement).blur())
  await empty.hover()
  await expect(empty).toHaveCSS('border-top-width', '0px')
  await expect(empty).toHaveCSS('outline-style', 'none')
  await expect(empty).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await page.mouse.move(0, 0)
  await page.screenshot({ path: testInfo.outputPath('garden-places.png'), animations: 'disabled' })
  await page.keyboard.press('Tab')
  await empty.focus()
  await expect(empty).toHaveCSS('outline-width', '2px')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  expect(new URL(page.url()).searchParams.get('redirect')).toBe('/memorials/new?garden=meadow&place=3')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const registration = page.locator('.auth-links').getByRole('link', { name: 'Create an account', exact: true })
  expect(new URL((await registration.getAttribute('href'))!, page.url()).searchParams.get('redirect')).toBe('/memorials/new?garden=meadow&place=3')
})

test('loading waits for every saved place before revealing the garden and its controls', async ({ page }, testInfo) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const id = '8bca0797-5d6c-4b68-b243-9c41c7fe0003'
  await page.route('**/api/gardens/lake/memorials', async (route) => {
    await gate
    await route.fulfill({ json: [{ id, gardenId: 'lake', place: 3, name: 'Patient friend', born: 2010, died: 2024, story: 'A memory loaded together with the garden.', source: 'saved', species: 'pet', creatorName: null, canEdit: false }] })
  })
  try {
    await visitLocale(page, '/gardens?garden=lake', 'en')
    const view = page.locator('.canvas-wrapper')
    await expect(view).toHaveAttribute('data-state', 'loading')
    await expect(view).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByTestId('garden-loading')).toContainText('Gathering stories')
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    await expect(page.locator('.canvas-host')).toBeHidden()
    await expect(page.locator('.memorial-hit, .camera-toolbar, .garden-hud')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('garden-loading.png'), animations: 'disabled' })
    release()
    await expect(view).toHaveAttribute('data-state', 'ready')
    await expect(view).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByTestId('garden-loading')).toHaveCount(0)
    await expect(page.getByTestId(`memorial-${id}`)).toBeVisible()
    await expect(page.getByTestId('empty-lake-3')).toHaveCount(0)
    await expect(page.locator('.memorial-hit')).toHaveCount(10)
    await expect(page.locator('.camera-toolbar')).toBeVisible()
  } finally { release() }
})

test('leaving a loading garden ignores its late places response when another garden is open', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let lakeSettled = false
  const isLake = (url: string) => new URL(url).pathname === '/api/gardens/lake/memorials'
  page.on('requestfinished', request => { if (isLake(request.url())) lakeSettled = true })
  page.on('requestfailed', request => { if (isLake(request.url())) lakeSettled = true })
  await page.route('**/api/gardens/lake/memorials', async (route) => {
    await gate
    if (!route.request().failure()) await route.fulfill({ json: [] })
  })
  try {
    await visitLocale(page, '/gardens', 'en')
    await page.getByTestId('garden-choice-lake').click()
    await expect(page).toHaveURL(/\/gardens\?garden=lake$/)
    await expect(page.getByTestId('garden-loading')).toContainText('Gathering stories')
    await page.goBack()
    await expect(page).toHaveURL(/\/gardens$/)
    await page.getByTestId('garden-choice-grove').click()
    await expect(page).toHaveURL(/\/gardens\?garden=grove$/)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
    release()
    await expect.poll(() => lakeSettled).toBe(true)
    await expect(page.getByTestId('memorial-grove-1')).toBeVisible()
    await expect(page.locator('.memorial-hit')).toHaveCount(16)
    await expect(page.getByTestId('garden-loading')).toHaveCount(0)
    await expect(page.locator('.garden-title')).toHaveText('Grove')
  } finally { release() }
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: camera buttons, keyboard, focused memorials and resize`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await visitLocale(page, `/gardens?garden=lake`, locale)
    const view = page.locator('.canvas-wrapper')
    await expect(view).toHaveAttribute('data-state', 'ready')
    const zoomIn = page.getByTestId('garden-zoom-in')
    const zoomOut = page.getByTestId('garden-zoom-out')
    await expect(zoomOut).toBeDisabled()
    await zoomIn.click()
    await expect(page.locator('.camera-toolbar output')).toHaveText('125%')
    await view.focus()
    await page.keyboard.press('+')
    await expect(page.locator('.camera-toolbar output')).toHaveText('156%')
    const before = await view.getAttribute('data-camera-x')
    await page.keyboard.press('ArrowRight')
    expect(await view.getAttribute('data-camera-x')).not.toBe(before)
    // A keyboard user can reach a stone outside the current camera view.
    const stone = page.getByTestId('memorial-lake-10')
    await stone.focus()
    await expect(stone).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('memorial-summary')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toContainText(locale === 'ru' ? 'Место 10' : 'Place 10')
    await page.keyboard.press('Escape')
    await expect(stone).toBeFocused()
    await page.setViewportSize({ width: 900, height: 700 })
    await expect(page.locator('.camera-toolbar output')).toHaveText('156%')
    await view.focus()
    await page.keyboard.press('Home')
    await expect(page.locator('.camera-toolbar output')).toHaveText('100%')
    for (let i = 0; i < 7; i++) await zoomIn.click()
    await expect(zoomIn).toBeDisabled()
    await expect(page.locator('.camera-toolbar output')).toHaveText('400%')
    await page.screenshot({ path: testInfo.outputPath('garden-zoom.png'), animations: 'disabled' })
    await chooseGarden(page, 'hill')
    await expect(page.locator('.camera-toolbar output')).toHaveText('100%')
    await zoomIn.click()
    await page.getByTestId('garden-camera-reset').click()
    await expect(zoomOut).toBeDisabled()
    await page.getByTestId('garden-switch').click()
    await page.getByTestId('garden-home').click()
    await expect(page.locator('.camera-toolbar')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

for (const locale of ['ru', 'en']) {
  test(`${locale}: compact camera controls and keyboard help stay readable in narrow and short windows`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width: 320, height: 568 })
    await visitLocale(page, '/gardens?garden=meadow', locale)
    const view = page.locator('.canvas-wrapper')
    await expect(view).toHaveAttribute('data-state', 'ready')
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 390 }, { width: 320, height: 450 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size)
      const scene = (await view.boundingBox())!
      const toolbar = page.locator('.camera-toolbar')
      await expect(toolbar).toBeInViewport()
      const controls = (await toolbar.boundingBox())!
      const heading = (await page.getByRole('heading', { level: 1 }).boundingBox())!
      const overlapsTitle = controls.x < heading.x + heading.width && controls.x + controls.width > heading.x
        && controls.y < heading.y + heading.height && controls.y + controls.height > heading.y
      expect(overlapsTitle).toBe(false)
      for (const id of ['garden-zoom-out', 'garden-zoom-in', 'garden-camera-reset', 'garden-fullscreen', 'garden-effects', 'garden-motion', 'garden-help']) {
        const button = page.getByTestId(id)
        await expect(button).toBeVisible()
        const box = (await button.boundingBox())!
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.x).toBeGreaterThanOrEqual(scene.x)
        expect(box.y).toBeGreaterThanOrEqual(scene.y)
        expect(box.x + box.width).toBeLessThanOrEqual(scene.x + scene.width + 1)
        expect(box.y + box.height).toBeLessThanOrEqual(scene.y + scene.height + 1)
      }
      const help = page.getByTestId('garden-help')
      await help.focus()
      await expect(help).toBeFocused()
      await expect(help).toHaveCSS('outline-width', '2px')
      await page.keyboard.press('Enter')
      await expect(help).toHaveAttribute('aria-expanded', 'true')
      const card = page.locator('.garden-help-card')
      await expect(card).toBeVisible()
      await expect(card).toContainText(locale === 'ru' ? 'Перетаскивайте сад' : 'Drag with a mouse or finger')
      // The portaled popover repositions while its opening animation settles.
      await expect.poll(async () => {
        const bounds = await card.boundingBox()
        if (!bounds) return Number.POSITIVE_INFINITY
        return Math.max(-bounds.x, -bounds.y, bounds.x + bounds.width - size.width, bounds.y + bounds.height - size.height)
      }).toBeLessThanOrEqual(1)
      for (const paragraph of await card.locator('p').all()) {
        expect(await paragraph.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`camera-help-${size.width}x${size.height}.png`), animations: 'disabled' })
      await page.keyboard.press('Escape')
      await expect(card).toHaveCount(0)
      await expect(help).toBeFocused()
      await expect(help).toHaveAttribute('aria-expanded', 'false')
    }
    expect(errors).toEqual([])
  })
}

test('wheel zoom stays at the pointer, dragging a stone pans without opening it, and bounds hold', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse and wheel scenario')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens?garden=lake', 'en')
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  const view = page.locator('.canvas-wrapper')
  await view.scrollIntoViewIfNeeded()
  const scene = (await view.boundingBox())!
  const candidates = await page.locator('.memorial-hit[data-monument-kind]').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect()
    return { id: element.getAttribute('data-testid')!, x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }))
  candidates.sort((a, b) => Math.hypot(a.x - scene.x - scene.width / 2, a.y - scene.y - scene.height / 2)
    - Math.hypot(b.x - scene.x - scene.width / 2, b.y - scene.y - scene.height / 2))
  const stone = page.getByTestId(candidates[0]!.id)
  const place = candidates[0]!.id.split('-').at(-1)!
  await revealTarget(stone)
  const initial = (await stone.boundingBox())!
  // WheelEvent client coordinates are integer CSS pixels, unlike DOM bounds.
  const anchor = { x: Math.round(initial.x + initial.width / 2), y: Math.round(initial.y + initial.height / 2) }
  const start = await view.evaluate(element => ({ x: Number((element as HTMLElement).dataset.cameraX), y: Number((element as HTMLElement).dataset.cameraY), zoom: Number((element as HTMLElement).dataset.zoom) }))
  await page.mouse.move(anchor.x, anchor.y)
  const scrollY = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, -160)
  await expect.poll(async () => Number(await view.getAttribute('data-zoom'))).toBeGreaterThan(1.5)
  await expect.poll(async () => (await stone.boundingBox())!.width).toBeGreaterThan(initial.width * 1.5)
  const zoomed = (await stone.boundingBox())!
  expect(zoomed.width).toBeGreaterThan(initial.width * 1.5)
  const projection = await view.evaluate(element => {
    const node = element as HTMLElement
    const scale = Number(node.dataset.projectionScale)
    return { zoom: Number(node.dataset.zoom), width: Number(node.dataset.worldWidth) * scale, height: Number(node.dataset.worldHeight) * scale,
      offsetX: Number(node.dataset.projectionOffsetX), offsetY: Number(node.dataset.projectionOffsetY) }
  })
  // data-zoom is rounded for the HUD; use the rendered transform for subpixel geometry checks.
  projection.zoom = await page.locator('.memorial-controls').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a)
  const ratio = projection.zoom / start.zoom
  const pointer = { x: anchor.x - scene.x - projection.offsetX, y: anchor.y - scene.y - projection.offsetY }
  const desired = { x: pointer.x - (pointer.x - start.x) * ratio, y: pointer.y - (pointer.y - start.y) * ratio }
  const constrain = (value: number, content: number, viewport: number, offset: number) => content * projection.zoom <= viewport
    ? content * (1 - projection.zoom) / 2
    : Math.max(viewport - offset - content * projection.zoom, Math.min(-offset, value))
  const expected = { x: constrain(desired.x, projection.width, scene.width, projection.offsetX), y: constrain(desired.y, projection.height, scene.height, projection.offsetY) }
  // An interior anchor stays fixed; near an edge the camera must honor its bounds.
  expect(Math.abs(zoomed.x + zoomed.width / 2 - anchor.x - (expected.x - desired.x))).toBeLessThan(2)
  expect(Math.abs(zoomed.y + zoomed.height / 2 - anchor.y - (expected.y - desired.y))).toBeLessThan(2)
  expect(Number(await view.getAttribute('data-camera-x'))).toBeCloseTo(expected.x, 0)
  expect(Number(await view.getAttribute('data-camera-y'))).toBeCloseTo(expected.y, 0)
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
  expect(projection.width * projection.zoom).toBeGreaterThan(scene.width)
  const previousX = Number(await view.getAttribute('data-camera-x'))
  const leftLimit = scene.width - projection.offsetX - projection.width * projection.zoom
  const rightLimit = -projection.offsetX
  const drag = previousX - leftLimit >= rightLimit - previousX ? -110 : 110
  await page.mouse.down()
  await page.mouse.move(anchor.x + drag, anchor.y - 70, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
  expect((Number(await view.getAttribute('data-camera-x')) - previousX) * Math.sign(drag)).toBeGreaterThan(80)
  const moved = (await stone.boundingBox())!
  // This is a new deliberate click after the drag's synthetic-click guard expires.
  await page.waitForTimeout(400)
  await page.mouse.click(moved.x + moved.width / 2, moved.y + moved.height / 2)
  await expect(page.getByTestId('memorial-summary')).toBeVisible()
  await expect(page.locator('.memorial-story-card[role="dialog"]')).toHaveCount(0)
  await page.getByTestId('memorial-summary').click()
  await expect(page.getByRole('dialog')).toContainText(`Place ${place}`)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(stone).toBeFocused()
  await view.focus()
  const viewportWidth = await view.evaluate(element => element.clientWidth)
  const contentWidth = await page.locator('.memorial-controls').evaluate(element => parseFloat(getComputedStyle(element).width))
  const offsetX = (viewportWidth - contentWidth) / 2
  const zoom = projection.zoom
  const stepsToEdge = Math.ceil((contentWidth * zoom - viewportWidth) / 100) + 2
  for (let i = 0; i < stepsToEdge; i++) await page.keyboard.press('Shift+ArrowRight')
  expect(Number(await view.getAttribute('data-camera-x'))).toBeCloseTo(viewportWidth - offsetX - contentWidth * zoom, 0)
  for (let i = 0; i < stepsToEdge; i++) await page.keyboard.press('Shift+ArrowLeft')
  expect(Number(await view.getAttribute('data-camera-x'))).toBeCloseTo(-offsetX, 0)
  await page.getByTestId('garden-camera-reset').click()
  await expect(view).toHaveAttribute('data-zoom', '1.000')
})

test('phone pinch, one-finger drag, cancellation and a tap on the transformed stone', async ({ page, context, isMobile }, testInfo) => {
  test.skip(!isMobile, 'Real touch input on the phone viewport')
  await visitLocale(page, '/gardens?garden=grove', 'en')
  const view = page.locator('.canvas-wrapper')
  await expect(view).toHaveAttribute('data-state', 'ready')
  await view.scrollIntoViewIfNeeded()
  const bounds = (await view.boundingBox())!
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  const scroll = await page.evaluate(() => window.scrollY)
  const input = await context.newCDPSession(page)
  const points = (distance: number) => [{ x: x - distance, y, id: 1 }, { x: x + distance, y, id: 2 }]
  await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(30) })
  for (const distance of [40, 50, 65]) await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(distance) })
  await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(async () => Number(await view.getAttribute('data-zoom'))).toBeGreaterThan(2)
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll)
  const target = page.getByTestId('memorial-grove-8')
  // Recenter through keyboard focus, then exercise actual touch events on that stone.
  await revealTarget(target)
  const marker = (await target.boundingBox())!
  const sx = marker.x + marker.width / 2
  const sy = marker.y + marker.height / 2
  const oldX = Number(await view.getAttribute('data-camera-x'))
  await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] })
  for (const delta of [10, 25, 50]) await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx - delta, y: sy - delta / 2, id: 1 }] })
  await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
  expect(Number(await view.getAttribute('data-camera-x'))).toBeLessThan(oldX - 30)
  await page.screenshot({ path: testInfo.outputPath('phone-camera.png'), animations: 'disabled' })
  await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
  await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 15, y, id: 1 }] })
  await input.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await revealTarget(target)
  await page.waitForTimeout(400)
  await target.tap()
  await expect(page.getByTestId('memorial-summary')).toBeVisible()
  await expect(page.locator('.memorial-story-card[role="dialog"]')).toHaveCount(0)
  await page.getByTestId('memorial-summary').tap()
  await expect(page.getByRole('dialog')).toContainText('Place 8')
  await page.keyboard.press('Escape')
  await page.getByTestId('garden-camera-reset').click()
  await expect(view).toHaveAttribute('data-zoom', '1.000')
  await expect(view).toHaveAttribute('data-camera-x', '0.00')
  await input.detach()
})

test('distinct landscapes preserve separate targets and reveal every fixed-world place at both viewport sizes', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens', 'ru')
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const garden of ['meadow', 'grove', 'hill']) {
      await chooseGarden(page, garden)
      await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
      const targets = page.locator('.memorial-hit')
      const count = garden === 'meadow' ? 12 : garden === 'grove' ? 16 : 14
      await expect(targets).toHaveCount(count)
      await expect(page.locator('.memorial-empty:disabled')).toHaveCount(0)
      await page.locator('canvas').scrollIntoViewIfNeeded()
      const positions = await targets.evaluateAll(elements => elements.map(element => {
        const { x, y, width, height } = element.getBoundingClientRect()
        return { x, y, width, height }
      }))
      for (const [index, position] of positions.entries()) {
        expect(position.width).toBeGreaterThanOrEqual(44)
        expect(position.height).toBeGreaterThanOrEqual(44)
        for (const other of positions.slice(index + 1)) {
          const overlap = position.x < other.x + other.width && position.x + position.width > other.x && position.y < other.y + other.height && position.y + position.height > other.y
          expect(overlap).toBe(false)
        }
      }
      await page.locator('canvas').screenshot({ path: testInfo.outputPath(`${garden}-${width}.png`) })
      await expect(page.locator('.memorial-empty')).toHaveCount(count - 4)
      await expect(page.locator('.memorial-hit:not(.memorial-empty)')).toHaveCount(4)
      for (const target of await targets.all()) {
        await revealTarget(target)
        await expect(target).toBeInViewport({ ratio: 0.99 })
      }
      for (const index of [0, Math.floor(count / 2) - 1, count - 1]) {
        await revealTarget(targets.nth(index))
        await openMemorialStory(page, targets.nth(index))
        const dialog = page.getByRole('dialog')
        await expect(dialog.locator('.memorial-location')).toContainText(`Место ${index + 1}`)
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(targets.nth(index)).toBeFocused()
      }
    }
  }
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: story card keeps long memories readable and controls reachable in a short viewport`, async ({ page }, testInfo) => {
    const ru = locale === 'ru'
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await visitLocale(page, `/gardens?garden=grove`, locale)
    const stone = page.getByTestId('memorial-grove-2')
    await revealTarget(stone)
    await openMemorialStory(page, stone)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toHaveAccessibleName(ru ? 'Луна' : 'Luna')
    await expect(dialog).toHaveAccessibleDescription(/2012 — 2024/)
    await expect(dialog.locator('.memorial-favorite')).toContainText(ru ? 'Любимые занятия' : 'Favorite things')
    await expect(dialog).toHaveCSS('animation-name', 'none')
    await page.screenshot({ path: testInfo.outputPath('warm-story-card.png'), animations: 'disabled' })

    await page.setViewportSize({ width: 360, height: 480 })
    // Stress the real card with a longer memory without altering demo fixtures.
    await dialog.locator('.memorial-story p').evaluate(element => { element.textContent = `${element.textContent} `.repeat(12) })
    const body = dialog.locator('[data-slot="body"]')
    expect(await body.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
    const bounds = (await dialog.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(360)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(480)
    const close = dialog.getByRole('button', { name: ru ? 'Закрыть историю' : 'Close story', exact: true })
    const back = dialog.getByRole('button', { name: ru ? 'Вернуться в сад' : 'Return to the garden', exact: true })
    for (const button of [close, back]) {
      await expect(button).toBeInViewport()
      const box = (await button.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
    await dialog.locator('.memorial-demo').scrollIntoViewIfNeeded()
    await expect(dialog.locator('.memorial-demo')).toBeInViewport()
    await close.focus()
    for (let index = 0; index < 4; index++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
    }
    await page.screenshot({ path: testInfo.outputPath('short-viewport-story.png'), animations: 'disabled' })
    await back.click()
    await expect(dialog).toHaveCount(0)
    await expect(stone).toBeFocused()
  })
}

test('ambient motion can pause, stays paused across gardens and respects device preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visitLocale(page, '/gardens?garden=grove', 'en')
  const scene = page.locator('.canvas-wrapper')
  const canvas = page.locator('canvas')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await canvas.scrollIntoViewIfNeeded()
  await expect(scene).toHaveAttribute('data-motion', 'running')
  const initial = await canvas.screenshot()
  await expect.poll(async () => Buffer.compare(initial, await canvas.screenshot())).not.toBe(0)
  const toggle = page.getByTestId('garden-motion')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  const paused = await canvas.screenshot()
  // Allow several animation frames to detect an accidentally running ticker.
  await page.waitForTimeout(250)
  expect(Buffer.compare(paused, await canvas.screenshot())).toBe(0)
  await chooseGarden(page, 'lake')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const stone = page.getByTestId('memorial-lake-1')
  await revealTarget(stone)
  await openMemorialStory(page, stone)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(toggle).toHaveCount(0)
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  await expect(scene).toHaveAttribute('data-motion', 'running')
})

test('butterflies, drifting leaves and grass stay calm when paused or motion is reduced', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visitLocale(page, '/gardens?garden=meadow', 'en')
  const scene = page.locator('.canvas-wrapper')
  const canvas = page.locator('canvas')
  const effects = [
    { garden: 'meadow', description: 'Butterflies and bees above the wildflowers' },
    { garden: 'grove', description: 'Leaves drifting through the grove' },
    { garden: 'hill', description: 'A gentle breeze in the grass' }
  ]
  for (const { garden, description } of effects) {
    await chooseGarden(page, garden)
    await expect(scene).toHaveAttribute('data-state', 'ready')
    await expect(canvas).toHaveAccessibleName(new RegExp(description))
    await canvas.scrollIntoViewIfNeeded()
    await expect(scene).toHaveAttribute('data-motion', 'running')
    const active = await canvas.screenshot()
    await expect.poll(async () => Buffer.compare(active, await canvas.screenshot())).not.toBe(0)
    const toggle = page.getByTestId('garden-motion')
    await toggle.click()
    await expect(scene).toHaveAttribute('data-motion', 'paused')
    const still = await canvas.screenshot({ path: testInfo.outputPath(`${garden}-life.png`) })
    await page.waitForTimeout(250)
    expect(Buffer.compare(still, await canvas.screenshot())).toBe(0)

    // New decoration follows the same camera and never intercepts a stone tap.
    await page.getByTestId('garden-zoom-in').click()
    const stone = page.getByTestId(`memorial-${garden}-1`)
    // Reveal the stone below the inset HUD before testing pointer stability.
    await stone.focus()
    const cameraBeforePress = await scene.evaluate(element => [element.dataset.cameraX, element.dataset.cameraY])
    await openMemorialStory(page, stone, isMobile)
    await expect(page.getByRole('dialog')).toContainText('Place 1')
    expect(await scene.evaluate(element => [element.dataset.cameraX, element.dataset.cameraY])).toEqual(cameraBeforePress)
    await page.keyboard.press('Escape')
    await page.getByTestId('garden-camera-reset').click()
    await toggle.click()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(scene).toHaveAttribute('data-motion', 'paused')
    await expect(toggle).toHaveCount(0)
    await canvas.scrollIntoViewIfNeeded()
    const reduced = await canvas.screenshot()
    await page.waitForTimeout(250)
    expect(Buffer.compare(reduced, await canvas.screenshot())).toBe(0)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(scene).toHaveAttribute('data-motion', 'running')
  }
  expect(errors).toEqual([])
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: memorial hover, full story, closing and keyboard access`, async ({ page, isMobile }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await visitLocale(page, `/gardens?garden=lake`, locale)
    const first = page.getByTestId('memorial-lake-1')
    const second = page.getByTestId('memorial-lake-2')
    await expect(page.locator('.memorial-hit')).toHaveCount(10)
    await revealTarget(first)
    // The stone only opens a summary; reading its card is a separate action.
    await first.evaluate(element => (element as HTMLElement).blur())
    await page.mouse.move(0, 0)
    await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
    const box = (await first.boundingBox())!
    // Interact at the actual stone position, including a real touch event on mobile.
    if (isMobile) {
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    } else {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await expect(first).toHaveAccessibleName(/2011 — 2023/)
      await expect(first).toHaveCSS('border-top-width', '0px')
      await expect(first).toHaveCSS('outline-style', 'none')
      await expect(first).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    }
    const summary = page.getByTestId('memorial-summary')
    await expect(summary).toContainText(locale === 'ru' ? 'Мило' : 'Milo')
    await expect(summary).toContainText('2011 — 2023')
    await expect(page.locator('.memorial-story-card[role="dialog"]')).toHaveCount(0)
    if (!isMobile) await summary.hover()
    await page.screenshot({ path: testInfo.outputPath('memorial-hover.png'), animations: 'disabled' })
    if (isMobile) await summary.tap()
    else await summary.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: locale === 'ru' ? 'Мило' : 'Milo', exact: true })).toBeVisible()
    await expect(dialog).toContainText(locale === 'ru' ? 'Наша история' : 'Our story')
    await expect(dialog).toContainText('2011 — 2023')
    await expect(dialog).toContainText(locale === 'ru' ? 'Мило встречал нас у двери' : 'Milo greeted us at the door')
    await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('memorial-story.png'), animations: 'disabled' })
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(first).toBeFocused()
    await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
    await second.focus()
    await page.keyboard.press('Enter')
    await expect(summary).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('heading', { name: locale === 'ru' ? 'Луна' : 'Luna', exact: true })).toBeVisible()
    await expect(dialog).toContainText('2012 — 2024')
    await dialog.getByRole('button', { name: locale === 'ru' ? 'Вернуться в сад' : 'Return to the garden', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(second).toBeFocused()
    await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
    await page.keyboard.press('Space')
    await expect(summary).toBeFocused()
    await page.keyboard.press('Space')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: locale === 'ru' ? 'Закрыть историю' : 'Close story', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(second).toBeFocused()
    await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(summary).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    const overlay = page.locator('[data-slot="overlay"][data-state="open"]')
    if (isMobile) await overlay.tap({ position: { x: 2, y: 2 } })
    else await overlay.click({ position: { x: 2, y: 2 } })
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
    if (!isMobile) {
      await page.mouse.move(0, 0)
      await second.hover()
      await expect(page.getByTestId('memorial-summary')).toContainText(locale === 'ru' ? 'Луна' : 'Luna')
      await page.mouse.move(0, 0)
      await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
    }
    expect(errors).toEqual([])
  })
}

test('memorial hit targets follow resize and old details disappear on garden navigation', async ({ page }) => {
  await visitLocale(page, '/gardens?garden=lake', 'ru')
  await chooseGarden(page, 'hill')
  await page.setViewportSize({ width: 390, height: 844 })
  const last = page.getByTestId('memorial-hill-14')
  await revealTarget(last)
  await openMemorialStory(page, last)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Место 14')
  await expect(dialog).toContainText('Буся')
  const bounds = (await dialog.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
  await dialog.getByRole('button', { name: 'Закрыть историю', exact: true }).click()
  await expect(last).toBeFocused()
  await openMemorialStory(page, last)
  await expect(dialog).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/garden=lake$/)
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
  await expect(page.locator('.memorial-hit')).toHaveCount(10)
  await page.getByTestId('garden-switch').click()
  await page.getByTestId('garden-home').click()
  await expect(page.locator('.memorial-hit')).toHaveCount(0)
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: enter the overview, switch all four gardens inside the scene and return home`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await visitLocale(page, `/gardens`, locale)
    await expect(page).toHaveURL(new RegExp(`/gardens$`))
    const canvas = page.locator('canvas')
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
    await expect(canvas).toHaveCount(1)
    await expect(canvas).toHaveAttribute('role', 'img')
    await page.screenshot({ path: testInfo.outputPath('garden-workspace.png') })

    for (const garden of gardens) {
      await chooseGarden(page, garden)
      await expect(page).toHaveURL(new RegExp(`garden=${garden}$`))
      await expect(canvas).toHaveAttribute('aria-label', locale === 'ru' ? /территория/ : /grounds/)
      if (garden === 'grove') await page.screenshot({ path: testInfo.outputPath('garden-territory.png') })
    }
    await page.getByTestId('garden-switch').click()
    await page.getByTestId('garden-home').click()
    await expect(page).toHaveURL(new RegExp(`/$`))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}

test('keyboard selection, direct links, history, locale switch and responsive canvas', async ({ page }) => {
  await visitLocale(page, '/gardens?garden=invalid', 'ru')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Четыре тихих сада')
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  await page.getByTestId('garden-choice-lake').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Озеро')
  await page.reload()
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Озеро')
  await page.getByTestId('garden-switch').click()
  await page.getByTestId('garden-hill').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Холм')
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Озеро')
  await page.getByTestId('garden-switch').click()
  await page.getByRole('link', { name: 'Switch to English' }).click()
  await expect(page).toHaveURL(/\/gardens\?garden=lake$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lake')
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /Lake garden/)
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator('canvas')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await chooseGarden(page, 'meadow')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Meadow')
  }
})

test('leaving and reopening the page keeps one functioning canvas', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await visitLocale(page, '/gardens', 'en')
  for (let i = 0; i < 3; i++) {
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
    await expect(page.locator('canvas')).toHaveCount(1)
    await page.getByTestId('garden-home').click()
    await expect(page.locator('canvas')).toHaveCount(0)
    await page.goBack()
  }
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  await chooseGarden(page, 'grove')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grove')
  expect(errors).toEqual([])
})

test('canvas initialization failure shows an error and can recover on retry', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined })
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof original
    window.addEventListener('restore-canvas', () => { HTMLCanvasElement.prototype.getContext = original })
  })
  await visitLocale(page, '/gardens', 'ru')
  await expect(page.getByRole('alert')).toContainText('Не удалось показать сад')
  await expect(page.getByRole('alert').getByRole('button')).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('restore-canvas')))
  await page.getByRole('alert').getByRole('button').click()
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('canvas')).toHaveCount(1)
})

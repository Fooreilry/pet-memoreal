import { expect, test } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'
import sharp from 'sharp'
import { getMemorialSceneLayout } from '../../app/utils/gardenMemorialScene'
import { getGardenProjection } from '../../app/utils/gardenProjection'
import { visitLocale } from './helpers/locale'
import { openMemorialStory } from './helpers/memorial'

const gardens = ['meadow', 'lake', 'grove', 'hill'] as const
type MotionSample = { phase: string | null, direction: string | null, scale: number, blur: number }

function gate() {
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  return { pending, release }
}

async function ready(page: Page, garden: string) {
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(scene).toHaveAttribute('data-transition', 'idle')
  await expect(scene).toHaveAttribute('data-displayed-garden', garden)
  await expect(scene).toHaveAttribute('data-requested-garden', garden)
  await expect(scene).toHaveAttribute('data-retained-frame', 'false')
  await expect(page.locator('canvas')).toHaveCount(1)
}

async function camera(page: Page) {
  return page.locator('.canvas-wrapper').evaluate(element => ['data-camera-x', 'data-camera-y', 'data-zoom'].map(attribute => element.getAttribute(attribute)))
}

async function drawingFrame(page: Page) {
  const geometry = await page.locator('.canvas-wrapper').evaluate((element) => {
    const host = element.querySelector<HTMLElement>('.canvas-host')!
    const canvas = host.querySelector('canvas')!
    const rect = (node: Element) => {
      const { x, y, width, height } = node.getBoundingClientRect()
      return { x, y, width, height }
    }
    const style = getComputedStyle(canvas)
    return {
      viewport: rect(element), canvas: rect(canvas),
      viewWidth: host.clientWidth, viewHeight: host.clientHeight,
      width: Number(element.getAttribute('data-drawing-width')),
      height: Number(element.getAttribute('data-drawing-height')),
      marginX: Number(element.getAttribute('data-drawing-margin-x')),
      marginY: Number(element.getAttribute('data-drawing-margin-y')),
      cssWidth: Number.parseFloat(style.width), cssHeight: Number.parseFloat(style.height),
      left: Number.parseFloat(style.left), top: Number.parseFloat(style.top),
      backingWidth: canvas.width, backingHeight: canvas.height,
      resolution: Math.min(window.devicePixelRatio || 1, 2)
    }
  })
  expect(geometry.marginX).toBeGreaterThan(0)
  expect(geometry.marginY).toBeGreaterThan(0)
  expect(geometry.width).toBe(geometry.viewWidth + geometry.marginX * 2)
  expect(geometry.height).toBe(geometry.viewHeight + geometry.marginY * 2)
  expect(geometry.cssWidth).toBe(geometry.width)
  expect(geometry.cssHeight).toBe(geometry.height)
  expect(geometry.left).toBe(-geometry.marginX)
  expect(geometry.top).toBe(-geometry.marginY)
  expect(Math.abs(geometry.backingWidth - geometry.width * geometry.resolution)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.backingHeight - geometry.height * geometry.resolution)).toBeLessThanOrEqual(1)
  // Only the drawing grows. The layout viewport and user camera retain their
  // logical dimensions, including while a presentation transform is active.
  expect(Math.abs(geometry.viewWidth - geometry.viewport.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.viewHeight - geometry.viewport.height)).toBeLessThanOrEqual(1)
  expect(geometry.canvas.x).toBeLessThan(geometry.viewport.x - 1)
  expect(geometry.canvas.y).toBeLessThan(geometry.viewport.y - 1)
  expect(geometry.canvas.x + geometry.canvas.width).toBeGreaterThan(geometry.viewport.x + geometry.viewport.width + 1)
  expect(geometry.canvas.y + geometry.canvas.height).toBeGreaterThan(geometry.viewport.y + geometry.viewport.height + 1)
  return geometry
}

async function coverageFixture(page: Page) {
  return page.addStyleTag({ content: `
    .canvas-wrapper { background: rgb(255, 0, 255) !important; }
    .canvas-host { filter: none !important; }
    .canvas-state::before { background: transparent !important; }
    .garden-hud, .camera-toolbar, [data-testid="garden-title"], .garden-choices,
    .memorial-controls, .memorial-detail-layer, .canvas-state > * { visibility: hidden !important; }
  ` })
}

async function withPullback(page: Page, capture: () => Promise<void>) {
  const original = await page.locator('.canvas-host').evaluate((host: HTMLElement) => {
    const saved = { value: host.style.getPropertyValue('transform'), priority: host.style.getPropertyPriority('transform') }
    host.style.setProperty('transform', `matrix(0.84, 0, 0, 0.84, ${host.clientWidth * .08}, ${host.clientHeight * .08})`, 'important')
    return saved
  })
  try { await capture() } finally {
    await page.locator('.canvas-host').evaluate((host: HTMLElement, saved) => {
      host.style.setProperty('transform', saved.value, saved.priority)
    }, original)
  }
}

async function expectSceneryAtEdges(page: Page, testInfo: TestInfo, name: string, skyAndGround = false) {
  const viewport = (await page.locator('.canvas-wrapper').boundingBox())!
  // Whole CSS pixels avoid fractional browser clipping differences. Samples
  // exclude the rounded stage corners and lie inside each exposed edge strip.
  const x = Math.ceil(viewport.x), y = Math.ceil(viewport.y)
  const width = Math.floor(viewport.x + viewport.width) - x
  const height = Math.floor(viewport.y + viewport.height) - y
  const frame = await page.screenshot({ path: testInfo.outputPath(`${name}.png`), clip: { x, y, width, height }, scale: 'css', animations: 'disabled', omitBackground: true })
  await testInfo.attach(name, { body: frame, contentType: 'image/png' })
  const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let count = 0, magenta = 0, cream = 0, minimumAlpha = 255
  const sides = Array.from({ length: 4 }, () => ({ count: 0, sum: [0, 0, 0] }))
  const sample = (xx: number, yy: number, side: number) => {
    const offset = (yy * info.width + xx) * info.channels
    const rgb = [data[offset]!, data[offset + 1]!, data[offset + 2]!]
    minimumAlpha = Math.min(minimumAlpha, data[offset + 3]!)
    if (Math.abs(rgb[0]! - 255) < 8 && rgb[1]! < 8 && Math.abs(rgb[2]! - 255) < 8) magenta++
    if ([250, 245, 235].every((channel, index) => Math.abs(rgb[index]! - channel) < 8)) cream++
    count++
    sides[side]!.count++
    for (let channel = 0; channel < 3; channel++) sides[side]!.sum[channel]! += rgb[channel]!
  }
  for (let depth = 2; depth < 6; depth++) {
    for (let xx = 24; xx < info.width - 24; xx++) {
      sample(xx, depth, 0)
      sample(xx, info.height - 1 - depth, 1)
    }
    for (let yy = 24; yy < info.height - 24; yy++) {
      sample(depth, yy, 2)
      sample(info.width - 1 - depth, yy, 3)
    }
  }
  expect(count).toBeGreaterThan(500)
  expect(minimumAlpha).toBe(255)
  expect(magenta / count, `${name}: transparent drawing must not expose the magenta sentinel`).toBeLessThan(.001)
  // Tiny pale petals are valid scenery; a cream margin across a side is not.
  expect(cream / count, `${name}: the page background must not fill the exposed gutter`).toBeLessThan(.02)
  if (skyAndGround) {
    const top = sides[0]!, bottom = sides[1]!
    const difference = Math.sqrt(top.sum.reduce((sum, value, channel) => sum + (value / top.count - bottom.sum[channel]! / bottom.count) ** 2, 0))
    expect(difference, `${name}: actual sky and ground must continue through the drawing gutter`).toBeGreaterThan(12)
  }
  return frame
}

async function expectCurrentProjection(page: Page) {
  const scene = page.locator('.canvas-wrapper')
  const size = await scene.locator('.canvas-host').evaluate((host: HTMLElement) => ({ width: host.clientWidth, height: host.clientHeight }))
  const expected = getGardenProjection(size.width, size.height, 1200, 1000, 16)
  await expect.poll(() => scene.evaluate(element => ({
    scale: Number(element.getAttribute('data-projection-scale')),
    offsetX: Number(element.getAttribute('data-projection-offset-x')),
    offsetY: Number(element.getAttribute('data-projection-offset-y'))
  }))).toEqual({ scale: expected.scale, offsetX: expected.offsetX, offsetY: expected.offsetY })
}

async function holdMainFrames(page: Page) {
  await page.evaluate(() => {
    const runtime = window as Window & { releaseOverscanFrames?: () => void }
    const request = window.requestAnimationFrame.bind(window)
    const cancel = window.cancelAnimationFrame.bind(window)
    const clock = Object.getOwnPropertyDescriptor(performance, 'now')
    const frozenTime = performance.now()
    Object.defineProperty(performance, 'now', { configurable: true, value: () => frozenTime })
    const queued = new Map<number, FrameRequestCallback>()
    let token = -1
    window.requestAnimationFrame = (callback) => {
      const id = token--
      queued.set(id, callback)
      return id
    }
    window.cancelAnimationFrame = (id) => {
      if (id < 0) queued.delete(id)
      else cancel(id)
    }
    runtime.releaseOverscanFrames = () => {
      window.requestAnimationFrame = request
      window.cancelAnimationFrame = cancel
      if (clock) Object.defineProperty(performance, 'now', clock)
      else Reflect.deleteProperty(performance, 'now')
      for (const callback of queued.values()) request(callback)
      queued.clear()
      delete runtime.releaseOverscanFrames
    }
  })
}

async function releaseMainFrames(page: Page) {
  await page.evaluate(() => (window as Window & { releaseOverscanFrames?: () => void }).releaseOverscanFrames?.())
}

async function observeMotion(page: Page) {
  await page.evaluate(() => {
    const runtime = window as Window & { overscanMotion?: MotionSample[] }
    const samples: MotionSample[] = []
    runtime.overscanMotion = samples
    const scene = document.querySelector('.canvas-wrapper')!
    new MutationObserver(() => {
      const host = scene.querySelector('.canvas-host')!
      const style = getComputedStyle(host)
      samples.push({
        phase: scene.getAttribute('data-transition'), direction: scene.getAttribute('data-transition-direction'),
        scale: new DOMMatrixReadOnly(style.transform).a,
        blur: Number.parseFloat(style.filter.match(/blur\(([\d.]+)px\)/)?.[1] ?? '0')
      })
    }).observe(scene, { attributes: true, childList: true, subtree: true })
  })
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
})

test('all four gardens extend their real drawing beyond the viewport without shifting logical markers or the camera', async ({ page }, testInfo) => {
  await visitLocale(page, '/gardens?garden=meadow', 'en')
  await ready(page, 'meadow')
  const original = await page.locator('canvas').elementHandle()
  for (const garden of gardens) {
    if (garden !== 'meadow') {
      await page.getByTestId('garden-switch').click()
      await page.getByTestId(`garden-${garden}`).click()
      await ready(page, garden)
    }
    const before = await camera(page)
    const geometry = await drawingFrame(page)
    const markerCenters = await page.locator('.memorial-hit').evaluateAll(elements => elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x: x + width / 2, y: y + height / 2 }
    }))
    expect(markerCenters.length).toBeGreaterThan(0)
    for (const center of markerCenters) {
      expect(center.x).toBeGreaterThan(geometry.viewport.x)
      expect(center.x).toBeLessThan(geometry.viewport.x + geometry.viewport.width)
      expect(center.y).toBeGreaterThan(geometry.viewport.y)
      expect(center.y).toBeLessThan(geometry.viewport.y + geometry.viewport.height)
    }
    const fixture = await coverageFixture(page)
    try {
      await withPullback(page, async () => {
        await drawingFrame(page)
        await expectSceneryAtEdges(page, testInfo, `${garden}-map-pullback-gutter`)
        expect(await camera(page)).toEqual(before)
      })
    } finally { await fixture.evaluate(element => element.remove()) }
    expect(await camera(page)).toEqual(before)
    expect(await original!.evaluate(element => element.isConnected)).toBe(true)
    await expect(page.locator('canvas')).toHaveCount(1)
  }
})

test('a real lateral pullback keeps scenery at every viewport edge while the next garden is still loading', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const loading = gate()
  await page.route('**/api/gardens/lake/memorials', async (route) => {
    await loading.pending
    if (!route.request().failure()) await route.fulfill({ json: [] })
  })
  try {
    await visitLocale(page, '/gardens?garden=meadow', 'en')
    await ready(page, 'meadow')
    const original = await page.locator('canvas').elementHandle()
    const before = await camera(page)
    await observeMotion(page)
    await page.getByTestId('garden-next').click()
    const scene = page.locator('.canvas-wrapper')
    await expect(scene).toHaveAttribute('data-transition', 'waiting')
    await expect(scene).toHaveAttribute('data-displayed-garden', 'meadow')
    await expect(scene).toHaveAttribute('data-requested-garden', 'lake')
    await expect(scene).toHaveAttribute('data-retained-frame', 'true')
    await expect(scene).toHaveAttribute('data-transition-scale', '0.86')
    const history = await page.evaluate(() => (window as Window & { overscanMotion?: MotionSample[] }).overscanMotion ?? [])
    const approach = history.filter(sample => sample.phase === 'approaching')
    expect(approach.length).toBeGreaterThan(1)
    expect(approach.every(sample => sample.direction === 'lateral' && sample.scale <= 1.001)).toBe(true)
    expect(Math.min(...approach.map(sample => sample.scale))).toBeLessThan(.9)
    expect(history.some(sample => sample.blur > 3)).toBe(true)
    expect(await scene.locator('.canvas-host').evaluate(element => Number.parseFloat(getComputedStyle(element).filter.match(/blur\(([\d.]+)px\)/)?.[1] ?? '0'))).toBeGreaterThan(3)
    const fixture = await coverageFixture(page)
    try {
      await drawingFrame(page)
      await expectSceneryAtEdges(page, testInfo, 'real-lateral-source-gutter')
      expect(await camera(page)).toEqual(before)
    } finally { await fixture.evaluate(element => element.remove()) }
    loading.release()
    await ready(page, 'lake')
    expect(await camera(page)).toEqual(before)
    expect(await original!.evaluate(element => element.isConnected)).toBe(true)
    await expect(page.locator('canvas')).toHaveCount(1)
  } finally { loading.release() }
})

test('a memorial close-up extends sky and ground through its gutter while its logical monument and return camera stay fixed', async ({ page, isMobile }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visitLocale(page, '/gardens?garden=lake', 'en')
  await ready(page, 'lake')
  const scene = page.locator('.canvas-wrapper')
  const original = await page.locator('canvas').elementHandle()
  await page.getByTestId('garden-motion').click()
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  await page.getByTestId('garden-zoom-in').click()
  await scene.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  const stone = page.getByTestId('memorial-lake-1')
  await stone.focus()
  const before = await camera(page)
  await openMemorialStory(page, stone, isMobile)
  await expect(scene).toHaveAttribute('data-detail-state', 'ready')
  await ready(page, 'lake')
  const geometry = await drawingFrame(page)
  const expected = getMemorialSceneLayout(geometry.viewWidth, geometry.viewHeight).monument
  const monument = await scene.evaluate(element => ({
    x: Number(element.getAttribute('data-detail-monument-x')),
    y: Number(element.getAttribute('data-detail-monument-y')),
    scale: Number(element.getAttribute('data-detail-monument-scale'))
  }))
  expect(monument.x).toBeCloseTo(expected.x, 5)
  expect(monument.y).toBeCloseTo(expected.y, 5)
  expect(monument.scale).toBeCloseTo(expected.scale, 5)
  const fixture = await coverageFixture(page)
  try {
    await withPullback(page, async () => {
      await drawingFrame(page)
      await expectSceneryAtEdges(page, testInfo, 'memorial-sky-ground-pullback-gutter', true)
      expect(await camera(page)).toEqual(before)
    })
  } finally { await fixture.evaluate(element => element.remove()) }
  await observeMotion(page)
  await page.getByTestId('memorial-detail-close').click()
  await ready(page, 'lake')
  const history = await page.evaluate(() => (window as Window & { overscanMotion?: MotionSample[] }).overscanMotion ?? [])
  expect(history.some(sample => sample.phase === 'approaching' && sample.direction === 'backward' && sample.scale < .9)).toBe(true)
  expect(await camera(page)).toEqual(before)
  await expect(stone).toBeFocused()
  await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
  expect(await original!.evaluate(element => element.isConnected)).toBe(true)
  await expect(page.locator('canvas')).toHaveCount(1)
})

test('cancelling a memorial after a resize restores the resized map projection and the same camera as an ordinary resize', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visitLocale(page, '/gardens?garden=lake&from=resize-cancel', 'en')
  await ready(page, 'lake')
  const scene = page.locator('.canvas-wrapper')
  const originalCanvas = await page.locator('canvas').elementHandle()
  const originalViewport = page.viewportSize()!
  const resizedViewport = { width: originalViewport.width >= 760 ? originalViewport.width - 112 : originalViewport.width + 24, height: originalViewport.height - 72 }
  const stone = page.getByTestId('memorial-lake-1')
  await page.getByTestId('garden-motion').click()
  const positionSource = async () => {
    await page.getByTestId('garden-camera-reset').click()
    await page.getByTestId('garden-zoom-in').click()
    await scene.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await stone.focus()
  }
  await positionSource()
  const originalCamera = await camera(page)

  // Record normal resize behavior instead of reproducing the camera's clamp
  // algorithm in the test. Recreate the exact source before the cancelled path.
  await page.setViewportSize(resizedViewport)
  await expectCurrentProjection(page)
  await ready(page, 'lake')
  const expectedCamera = await camera(page)
  await page.setViewportSize(originalViewport)
  await expectCurrentProjection(page)
  await ready(page, 'lake')
  await positionSource()
  expect(await camera(page)).toEqual(originalCamera)
  const originalUrl = page.url()
  const oldDrawingWidth = (await scene.getAttribute('data-drawing-width'))!
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('memorial-summary')).toBeFocused()
  await holdMainFrames(page)
  try {
    await page.keyboard.press('Enter')
    await expect(scene).toHaveAttribute('data-detail-state', 'preparing')
    await expect(scene).toHaveAttribute('data-transition', 'approaching')
    await page.setViewportSize(resizedViewport)
    // ResizeObserver must have resized the drawing before cancellation; the
    // pending memorial still owns the old map projection until it is restored.
    await expect(scene).not.toHaveAttribute('data-drawing-width', oldDrawingWidth)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('memorial-detail')).toHaveCount(0)
    await releaseMainFrames(page)
    await ready(page, 'lake')
    await expectCurrentProjection(page)
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect(scene).toHaveAttribute('data-detail-state', 'none')
    await expect(page.getByTestId('memorial-detail')).toHaveCount(0)
    await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
    await expect(stone).toBeFocused()
    expect(await camera(page)).toEqual(expectedCamera)
    expect(page.url()).toBe(originalUrl)
    await drawingFrame(page)
    const fixture = await coverageFixture(page)
    try { await expectSceneryAtEdges(page, testInfo, 'resized-cancelled-memorial-map') } finally { await fixture.evaluate(element => element.remove()) }
    expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true)
    await expect(page.locator('canvas')).toHaveCount(1)
  } finally { await releaseMainFrames(page) }
})

test('lake weather covers the newly exposed top and left gutters during a pullback', async ({ page }, testInfo) => {
  await visitLocale(page, '/gardens?garden=lake', 'en')
  await ready(page, 'lake')
  const scene = page.locator('.canvas-wrapper')
  const effects = page.getByTestId('garden-effects')
  await expect(scene).toHaveAttribute('data-motion', 'paused')
  await expect(scene).toHaveAttribute('data-weather', 'rain')
  const capture = async (name: string) => {
    const fixture = await coverageFixture(page)
    let frame!: Buffer
    try {
      await withPullback(page, async () => {
        await drawingFrame(page)
        frame = await expectSceneryAtEdges(page, testInfo, name)
      })
    } finally { await fixture.evaluate(element => element.remove()) }
    return frame
  }
  const on = await capture('lake-weather-on-pullback-gutters')
  await effects.click()
  await expect(scene).toHaveAttribute('data-weather', 'none')
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const off = await capture('lake-weather-off-pullback-gutters')
  const first = await sharp(on).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const second = await sharp(off).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  expect(second.info).toEqual(first.info)
  const { width, height, channels } = first.info
  const regions = [
    { name: 'top', left: 24, top: 2, right: width - 24, bottom: Math.floor(height * .08) - 4 },
    { name: 'left', left: 2, top: 24, right: Math.floor(width * .08) - 4, bottom: height - 24 }
  ]
  for (const region of regions) {
    let sampled = 0, changed = 0
    for (let y = region.top; y < region.bottom; y++) {
      for (let x = region.left; x < region.right; x++) {
        const offset = (y * width + x) * channels
        const contrast = Math.max(...[0, 1, 2].map(channel => Math.abs(first.data[offset + channel]! - second.data[offset + channel]!)))
        if (contrast > 3) changed++
        sampled++
      }
    }
    expect(sampled).toBeGreaterThan(300)
    // These strips lie outside the original viewport after a centered 0.84
    // pullback. A filter restricted to its former rectangle changes none of it.
    expect(changed / sampled, `${region.name}: weather must continue into newly exposed scenery`).toBeGreaterThan(.01)
  }
  await effects.click()
  await expect(scene).toHaveAttribute('data-weather', 'rain')
})

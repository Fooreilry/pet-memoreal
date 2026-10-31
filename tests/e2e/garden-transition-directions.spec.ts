import { expect, test } from '@playwright/test'
import type { ElementHandle, Page } from '@playwright/test'
import sharp from 'sharp'
import { visitLocale } from './helpers/locale'
import { openMemorialStory } from './helpers/memorial'

type MotionSample = {
  phase: string | null
  direction: string | null
  displayed: string | null
  requested: string | null
  scale: number
  actualScale: number
  blur: number
  opacity: number
  camera: string
}

function gate() {
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  return { pending, release }
}

async function ready(page: Page, garden: string) {
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-transition', 'idle')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(scene).toHaveAttribute('data-displayed-garden', garden)
  await expect(scene).toHaveAttribute('data-requested-garden', garden)
  await expect(scene).toHaveAttribute('data-transition-scale', '1')
  await expect(scene).toHaveAttribute('data-retained-frame', 'false')
}

async function camera(page: Page) {
  return page.locator('.canvas-wrapper').evaluate(element => ['data-camera-x', 'data-camera-y', 'data-zoom'].map(attribute => element.getAttribute(attribute)).join(':'))
}

async function layout(page: Page) {
  return page.evaluate(() => ['.garden-stage', '[data-testid="garden-header"]'].map((selector) => {
    const box = document.querySelector(selector)!.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  }))
}

async function observe(page: Page) {
  await page.evaluate(() => {
    const runtime = window as Window & { directionSamples?: MotionSample[], directionObserver?: MutationObserver }
    runtime.directionObserver?.disconnect()
    const samples: MotionSample[] = []
    const record = () => {
      const scene = document.querySelector('.canvas-wrapper')!
      const host = scene.querySelector('.canvas-host')!
      const veil = scene.querySelector('.canvas-state')
      const transform = getComputedStyle(host).transform.match(/matrix\(([^)]+)\)/)?.[1]?.split(',').map(Number)
      samples.push({
        phase: scene.getAttribute('data-transition'),
        direction: scene.getAttribute('data-transition-direction'),
        displayed: scene.getAttribute('data-displayed-garden'),
        requested: scene.getAttribute('data-requested-garden'),
        scale: Number(scene.getAttribute('data-transition-scale')),
        actualScale: transform?.[0] ?? 1,
        blur: Number.parseFloat(getComputedStyle(host).filter.match(/blur\(([\d.]+)px\)/)?.[1] ?? '0'),
        opacity: veil ? Number(getComputedStyle(veil, '::before').opacity) : 0,
        camera: ['data-camera-x', 'data-camera-y', 'data-zoom'].map(attribute => scene.getAttribute(attribute)).join(':')
      })
    }
    const observer = new MutationObserver(record)
    observer.observe(document.querySelector('.canvas-wrapper')!, { attributes: true, childList: true, subtree: true })
    runtime.directionObserver = observer
    runtime.directionSamples = samples
    record()
  })
}

async function samples(page: Page) {
  return page.evaluate(() => (window as Window & { directionSamples?: MotionSample[] }).directionSamples ?? [])
}

function expectOutward(history: MotionSample[], direction: 'backward' | 'lateral') {
  const approach = history.filter(sample => sample.phase === 'approaching')
  expect(approach.length).toBeGreaterThan(1)
  expect(approach.every(sample => sample.direction === direction)).toBe(true)
  expect(approach.every(sample => sample.actualScale <= 1.001)).toBe(true)
  expect(Math.min(...approach.map(sample => sample.actualScale))).toBeLessThan(.98)
  for (const sample of approach) expect(sample.actualScale).toBeCloseTo(sample.scale, 4)
}

async function assertSameCanvas(page: Page, original: ElementHandle<SVGElement | HTMLElement> | null) {
  await expect(page.locator('canvas')).toHaveCount(1)
  expect(await original!.evaluate(element => element.isConnected)).toBe(true)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
})

test('waiting shows visibly blurred source scenery through a translucent tint instead of a solid garden color', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const loading = gate()
  await page.route('**/api/gardens/lake/memorials', async (route) => {
    await loading.pending
    if (!route.request().failure()) await route.fulfill({ json: [] })
  })
  try {
    await visitLocale(page, '/gardens', 'en')
    await ready(page, 'overview')
    const original = await page.locator('canvas').elementHandle()
    await page.getByTestId('garden-choice-lake').click()
    await expect(page).toHaveURL(/\/gardens\?garden=lake$/)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition', 'waiting')
    await expect(page.getByTestId('garden-loading')).toBeVisible()
    const optics = await page.locator('.canvas-wrapper').evaluate((element) => {
      const host = element.querySelector('.canvas-host')!
      const veil = element.querySelector('.canvas-state')!
      return {
        blur: Number.parseFloat(getComputedStyle(host).filter.match(/blur\(([\d.]+)px\)/)?.[1] ?? '0'),
        opacity: Number(getComputedStyle(veil, '::before').opacity)
      }
    })
    expect(optics.blur).toBeGreaterThan(3)
    expect(optics.opacity).toBeLessThan(.4)
    await expect(page.locator('.canvas-host')).toBeVisible()
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-displayed-garden', 'overview')
    await expect(page.locator('.memorial-hit')).toHaveCount(0)

    const stage = (await page.locator('.garden-stage').boundingBox())!
    // This band is above the loader and below Cancel on both default viewports.
    // Spatial RGB variation proves the retained illustration is visible; the
    // loader itself must not make a flat green background pass this assertion.
    const frame = await page.screenshot({
      clip: { x: Math.ceil(stage.x + 24), y: Math.ceil(stage.y + 100), width: Math.floor(stage.width - 48), height: 64 },
      animations: 'disabled', scale: 'css'
    })
    const { data, info } = await sharp(frame).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const count = info.width * info.height
    const sums = [0, 0, 0], squares = [0, 0, 0]
    for (let offset = 0; offset < data.length; offset += info.channels) {
      for (let channel = 0; channel < 3; channel++) {
        const value = data[offset + channel]!
        sums[channel]! += value
        squares[channel]! += value * value
      }
    }
    const spatialDeviation = Math.sqrt(sums.reduce((total, sum, channel) => total + Math.max(0, squares[channel]! / count - (sum / count) ** 2), 0) / 3)
    expect(spatialDeviation).toBeGreaterThan(1.5)
    await testInfo.attach('blurred-source-scenery', { body: frame, contentType: 'image/png' })
    await page.screenshot({ path: testInfo.outputPath('visible-blur-waiting.png'), animations: 'disabled', scale: 'css' })
    await assertSameCanvas(page, original)
    loading.release()
    await ready(page, 'lake')
    await assertSameCanvas(page, original)
  } finally { loading.release() }
})

test('returning from a memorial and then from a garden zooms out while preserving the user camera and focus', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visitLocale(page, '/gardens?garden=lake&from=direction', 'en')
  await ready(page, 'lake')
  await page.getByTestId('garden-zoom-in').click()
  const stone = page.getByTestId('memorial-lake-1')
  await stone.focus()
  const savedCamera = await camera(page)
  const savedLayout = await layout(page)
  const original = await page.locator('canvas').elementHandle()
  const sourceUrl = page.url()
  await openMemorialStory(page, stone, isMobile)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-detail-state', 'ready')
  await ready(page, 'lake')
  await observe(page)
  await page.getByTestId('memorial-detail-return').click()
  await ready(page, 'lake')
  expectOutward(await samples(page), 'backward')
  expect(await camera(page)).toBe(savedCamera)
  expect(await layout(page)).toEqual(savedLayout)
  expect(page.url()).toBe(sourceUrl)
  await expect(stone).toBeFocused()
  await expect(page.getByTestId('memorial-summary')).toHaveCount(0)

  await page.getByTestId('garden-switch').click()
  await observe(page)
  await page.getByTestId('garden-overview').click()
  await expect.poll(() => new URL(page.url()).searchParams.has('garden')).toBe(false)
  await ready(page, 'overview')
  expectOutward(await samples(page), 'backward')
  expect(new URL(page.url()).searchParams.get('from')).toBe('direction')
  expect(await layout(page)).toEqual(savedLayout)
  await assertSameCanvas(page, original)
})

test('both neighboring arrows zoom out the source and zoom the destination in to its standard size', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visitLocale(page, '/gardens?garden=meadow&from=arrows', 'en')
  await ready(page, 'meadow')
  const original = await page.locator('canvas').elementHandle()
  const bounds = await layout(page)
  const initialZoom = (await page.locator('.canvas-wrapper').getAttribute('data-zoom'))!
  await page.getByTestId('garden-zoom-in').click()
  let sourceCamera = await camera(page)
  for (const [button, target] of [['garden-next', 'lake'], ['garden-previous', 'meadow']] as const) {
    await observe(page)
    await page.getByTestId(button).click()
    await expect.poll(() => new URL(page.url()).searchParams.get('garden')).toBe(target)
    await ready(page, target)
    const history = await samples(page)
    expectOutward(history, 'lateral')
    const approach = history.filter(sample => sample.phase === 'approaching')
    expect(approach.every(sample => sample.camera === sourceCamera)).toBe(true)
    const reveal = history.filter(sample => sample.phase === 'revealing' && sample.displayed === target)
    expect(reveal.length).toBeGreaterThan(1)
    expect(reveal.every(sample => sample.direction === 'lateral' && sample.actualScale <= 1.001)).toBe(true)
    expect(Math.min(...reveal.map(sample => sample.actualScale))).toBeLessThan(.98)
    expect(Math.max(...reveal.map(sample => sample.actualScale)) - Math.min(...reveal.map(sample => sample.actualScale))).toBeGreaterThan(.025)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-zoom', initialZoom)
    expect(new URL(page.url()).searchParams.get('from')).toBe('arrows')
    expect(await layout(page)).toEqual(bounds)
    await assertSameCanvas(page, original)
    sourceCamera = await camera(page)
  }
})

test('reduced motion keeps identity scale and a resized pending lateral transition can be cancelled without a stale scene', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const loading = gate()
  let settled = false
  page.on('requestfinished', request => { if (new URL(request.url()).pathname === '/api/gardens/grove/memorials') settled = true })
  page.on('requestfailed', request => { if (new URL(request.url()).pathname === '/api/gardens/grove/memorials') settled = true })
  await page.route('**/api/gardens/grove/memorials', async (route) => {
    await loading.pending
    if (!route.request().failure()) await route.fulfill({ json: [] })
  })
  try {
    await visitLocale(page, '/gardens?garden=lake&from=cancel', 'en')
    await ready(page, 'lake')
    const sourceUrl = page.url()
    const original = await page.locator('canvas').elementHandle()
    await page.getByTestId('garden-zoom-in').click()
    const sourceZoom = (await page.locator('.canvas-wrapper').getAttribute('data-zoom'))!
    await observe(page)
    await page.getByTestId('garden-next').click()
    await expect.poll(() => new URL(page.url()).searchParams.get('garden')).toBe('grove')
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition', 'waiting')
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition-direction', 'lateral')
    await page.setViewportSize({ width: 844, height: 390 })
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition-scale', '1')
    expect((await samples(page)).every(sample => sample.actualScale === 1 && sample.blur === 0)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(sourceUrl)
    await ready(page, 'lake')
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-zoom', sourceZoom)
    loading.release()
    await expect.poll(() => settled).toBe(true)
    await expect(page.getByTestId('memorial-lake-1')).toBeVisible()
    await expect(page.getByTestId('memorial-grove-1')).toHaveCount(0)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition-scale', '1')
    expect((await camera(page)).split(':').map(Number).every(Number.isFinite)).toBe(true)
    await assertSameCanvas(page, original)
  } finally { loading.release() }
})

test('Escape during the return from a full story skips the animation without restoring a phantom memorial', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visitLocale(page, '/gardens?garden=lake&from=skip-return', 'en')
  await ready(page, 'lake')
  await page.getByTestId('garden-zoom-in').click()
  const stone = page.getByTestId('memorial-lake-1')
  await stone.focus()
  const sourceCamera = await camera(page)
  const sourceUrl = page.url()
  const original = await page.locator('canvas').elementHandle()
  await openMemorialStory(page, stone, isMobile)
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-detail-state', 'ready')
  await ready(page, 'lake')

  await page.evaluate(() => {
    const runtime = window as Window & { skipReturnStarted?: Promise<{ direction: string | null, label: string }> }
    const scene = document.querySelector('.canvas-wrapper')!
    runtime.skipReturnStarted = new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (scene.getAttribute('data-transition') !== 'approaching') return
        observer.disconnect()
        resolve({ direction: scene.getAttribute('data-transition-direction'), label: scene.querySelector('[data-testid="scene-cancel"]')?.textContent?.trim() ?? '' })
      })
      observer.observe(scene, { attributes: true, attributeFilter: ['data-transition'] })
    })
  })
  await page.getByTestId('memorial-detail-return').click()
  const departure = await page.evaluate(() => (window as Window & { skipReturnStarted?: Promise<{ direction: string | null, label: string }> }).skipReturnStarted)
  expect(departure).toEqual({ direction: 'backward', label: 'Skip' })
  await page.keyboard.press('Escape')
  await ready(page, 'lake')
  await expect(scene).toHaveAttribute('data-detail-id', 'none')
  await expect(scene).toHaveAttribute('data-detail-state', 'none')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
  const controls = page.locator('.memorial-controls')
  await expect(controls).not.toHaveAttribute('aria-hidden', 'true')
  expect(await controls.evaluate(element => (element as HTMLElement).inert)).toBe(false)
  expect(await camera(page)).toBe(sourceCamera)
  expect(page.url()).toBe(sourceUrl)
  await expect(stone).toBeFocused()
  await assertSameCanvas(page, original)
})

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { visitLocale } from './helpers/locale'

function gate() {
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  return { pending, release }
}

async function blurAmount(host: Locator) {
  return host.evaluate(element => Number.parseFloat(getComputedStyle(element).filter.match(/blur\(([\d.]+)px\)/)?.[1] ?? '0'))
}

async function mapReady(page: Page) {
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition', 'idle')
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-retained-frame', 'false')
  await expect.poll(() => blurAmount(page.locator('.canvas-host'))).toBe(0)
}

async function expectTranslucentRetainedFrame(page: Page) {
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-retained-frame', 'true')
  const opacity = await page.getByTestId('scene-veil').evaluate(element => Number(getComputedStyle(element, '::before').opacity))
  expect(opacity).toBeCloseTo(.2, 2)
  expect(opacity).toBeLessThan(.4)
}

async function expectBlockedMap(page: Page) {
  const controls = page.locator('.memorial-controls')
  if (await controls.count()) {
    await expect(controls).toHaveAttribute('aria-hidden', 'true')
    expect(await controls.evaluate(element => (element as HTMLElement).inert)).toBe(true)
  }
  await expect(page.locator('.garden-hud, .camera-toolbar')).toHaveCount(0)
}

async function camera(page: Page) {
  return page.locator('.canvas-wrapper').evaluate(element => ({
    x: element.getAttribute('data-camera-x'), y: element.getAttribute('data-camera-y'), zoom: element.getAttribute('data-zoom')
  }))
}

async function monumentTransform(page: Page) {
  return page.locator('.canvas-wrapper').evaluate(element => ({
    x: Number(element.getAttribute('data-detail-monument-x')),
    y: Number(element.getAttribute('data-detail-monument-y')),
    scale: Number(element.getAttribute('data-detail-monument-scale'))
  }))
}

type RevealSnapshot = {
  busy: string | null
  controlsPresent: boolean
  controlsInert: boolean
  controlsHidden: string | null
  hudCount: number
  toolbarCount: number
}

async function observeMapReveal(page: Page) {
  await page.evaluate(() => {
    const runtime = window as Window & { gardenRevealSnapshots?: Promise<RevealSnapshot[]> }
    const scene = document.querySelector('.canvas-wrapper')!
    const samples: RevealSnapshot[] = []
    runtime.gardenRevealSnapshots = new Promise((resolve) => {
      const record = () => {
        const phase = scene.getAttribute('data-transition')
        if (phase === 'revealing') {
          const controls = document.querySelector<HTMLElement>('.memorial-controls')
          samples.push({
            busy: scene.getAttribute('aria-busy'),
            controlsPresent: !!controls,
            controlsInert: controls?.inert ?? false,
            controlsHidden: controls?.getAttribute('aria-hidden') ?? null,
            hudCount: document.querySelectorAll('.garden-hud').length,
            toolbarCount: document.querySelectorAll('.camera-toolbar').length
          })
        } else if (phase === 'idle' && samples.length) {
          observer.disconnect()
          resolve(samples)
        }
      }
      const observer = new MutationObserver(record)
      observer.observe(document.querySelector('.garden-stage')!, { attributes: true, childList: true, subtree: true })
      record()
    })
  })
}

async function expectBlockedReveal(page: Page) {
  const samples = await page.evaluate(() => (window as Window & { gardenRevealSnapshots?: Promise<RevealSnapshot[]> }).gardenRevealSnapshots)
  expect(samples?.length).toBeGreaterThan(0)
  expect(samples!.some(sample => sample.controlsPresent)).toBe(true)
  for (const sample of samples!) {
    expect(sample.busy).toBe('true')
    expect(sample.hudCount).toBe(0)
    expect(sample.toolbarCount).toBe(0)
    if (sample.controlsPresent) {
      expect(sample.controlsInert).toBe(true)
      expect(sample.controlsHidden).toBe('true')
    }
  }
}

async function holdMainFrames(page: Page) {
  await page.evaluate(() => {
    const runtime = window as Window & { releaseGardenTransitionFrames?: () => void }
    const request = window.requestAnimationFrame.bind(window)
    const cancel = window.cancelAnimationFrame.bind(window)
    const clock = Object.getOwnPropertyDescriptor(performance, 'now')
    const frozenTime = performance.now()
    // request() also publishes a synchronous clock update. Freeze its clock
    // with RAF so this fixture really holds the first, exact identity frame.
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
    runtime.releaseGardenTransitionFrames = () => {
      window.requestAnimationFrame = request
      window.cancelAnimationFrame = cancel
      if (clock) Object.defineProperty(performance, 'now', clock)
      else Reflect.deleteProperty(performance, 'now')
      for (const callback of queued.values()) request(callback)
      queued.clear()
      delete runtime.releaseGardenTransitionFrames
    }
  })
}

async function releaseMainFrames(page: Page) {
  await page.evaluate(() => (window as Window & { releaseGardenTransitionFrames?: () => void }).releaseGardenTransitionFrames?.())
}

async function failQueuedGpuDraws(page: Page) {
  await page.evaluate(() => {
    const runtime = window as Window & { failGardenGpuDraw?: boolean }
    runtime.failGardenGpuDraw = true
    for (const context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!context) continue
      const drawElements = context.prototype.drawElements
      const drawArrays = context.prototype.drawArrays
      context.prototype.drawElements = function (this: WebGLRenderingContext | WebGL2RenderingContext, mode: number, count: number, type: number, offset: number) {
        if (runtime.failGardenGpuDraw) throw new Error('Deferred garden render fixture')
        drawElements.call(this, mode, count, type, offset)
      }
      context.prototype.drawArrays = function (this: WebGLRenderingContext | WebGL2RenderingContext, mode: number, first: number, count: number) {
        if (runtime.failGardenGpuDraw) throw new Error('Deferred garden render fixture')
        drawArrays.call(this, mode, first, count)
      }
    }
  })
}

async function restoreGpuDraws(page: Page) {
  await page.evaluate(() => { (window as Window & { failGardenGpuDraw?: boolean }).failGardenGpuDraw = false })
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: choosing a garden retains its blurred overview until saved places and the first frame are ready`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const loading = gate()
    const id = '8bca0797-5d6c-4b68-b243-9c41c7fe0203'
    await page.route('**/api/gardens/lake/memorials', async (route) => {
      await loading.pending
      await route.fulfill({ json: [{ source: 'saved', id, gardenId: 'lake', place: 3, name: 'Patient friend', species: 'cat', born: 2010, died: 2024, story: 'A saved story loaded with the entire garden.', creatorName: null, canEdit: false }] })
    })
    try {
      await visitLocale(page, '/gardens', locale)
      await mapReady(page)
      const originalCanvas = await page.locator('canvas').elementHandle()
      await page.getByTestId('garden-choice-lake').click()
      await expect(page).toHaveURL(/\/gardens\?garden=lake$/)
      const scene = page.locator('.canvas-wrapper')
      await expect(scene).toHaveAttribute('data-transition', 'waiting')
      await expect(scene).toHaveAttribute('data-displayed-garden', 'overview')
      await expect(scene).toHaveAttribute('aria-busy', 'true')
      await expect(page.locator('.canvas-host')).toBeVisible()
      await expect.poll(() => blurAmount(page.locator('.canvas-host'))).toBeGreaterThan(0)
      await expect(page.locator('canvas')).toHaveCount(1)
      expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true)
      await expect(page.locator('.memorial-hit, .garden-hud, .camera-toolbar')).toHaveCount(0)
      const progress = page.getByRole('progressbar')
      await expect(progress).toHaveAttribute('aria-valuenow', '1')
      await expect(progress).toHaveAttribute('aria-valuemax', '3')
      await expect(page.getByTestId('garden-loading').locator('.garden-loading-stages li')).toHaveText(locale === 'ru' ? ['Пейзаж', 'Истории', 'Места памяти'] : ['Scenery', 'Stories', 'Memorials'])
      await page.screenshot({ path: testInfo.outputPath(`blurred-overview-${locale}.png`), animations: 'disabled', scale: 'css' })
      await observeMapReveal(page)
      loading.release()
      await mapReady(page)
      // Read each reveal's complete UI state in one browser turn. Sequential
      // driver calls can straddle the fixed 240ms reveal and observe idle.
      await expectBlockedReveal(page)
      await expect(page.getByTestId(`memorial-${id}`)).toBeVisible()
      await expect(page.getByTestId('empty-lake-3')).toHaveCount(0)
      await expect(page.locator('.memorial-hit')).toHaveCount(10)
      expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true)
      await expect(page.locator('canvas')).toHaveCount(1)
      await expect(page.getByTestId('garden-loading')).toHaveCount(0)
    } finally { loading.release() }
  })
}

test('a failed neighboring garden retains the previous scene and never exposes temporary free places while retrying', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let loading = gate()
  let unavailable = true
  await page.route('**/api/gardens/lake/memorials', async (route) => {
    await loading.pending
    await route.fulfill(unavailable ? { status: 503, json: { statusMessage: 'Memorials unavailable' } } : { json: [] })
  })
  try {
    await visitLocale(page, '/gardens?garden=meadow', 'en')
    await mapReady(page)
    const originalCanvas = await page.locator('canvas').elementHandle()
    await page.getByTestId('garden-next').click()
    await expect(page).toHaveURL(/\/gardens\?garden=lake$/)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition', 'waiting')
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-displayed-garden', 'meadow')
    await expect(page.locator('.canvas-host')).toBeVisible()
    await expect.poll(() => blurAmount(page.locator('.canvas-host'))).toBe(0)
    await expectTranslucentRetainedFrame(page)
    loading.release()
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'error')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.locator('.canvas-host')).toBeVisible()
    await expectBlockedMap(page)
    await expect(page.getByTestId('empty-lake-3')).toHaveCount(0)
    unavailable = false
    loading = gate()
    await page.getByRole('alert').getByRole('button').click()
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition', 'waiting')
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    await expect(page.locator('.canvas-host')).toBeVisible()
    await expect.poll(() => blurAmount(page.locator('.canvas-host'))).toBe(0)
    await expectTranslucentRetainedFrame(page)
    await expectBlockedMap(page)
    await page.screenshot({ path: testInfo.outputPath('blurred-garden-retry.png'), animations: 'disabled', scale: 'css' })
    loading.release()
    await mapReady(page)
    await expect(page.getByTestId('memorial-lake-1')).toBeVisible()
    expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true)
  } finally { loading.release() }
})

test('a late places response cannot replace the garden chosen after returning to the overview', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const loading = gate()
  let lakeSettled = false
  const lakeRequest = (url: string) => new URL(url).pathname === '/api/gardens/lake/memorials'
  page.on('requestfinished', request => { if (lakeRequest(request.url())) lakeSettled = true })
  page.on('requestfailed', request => { if (lakeRequest(request.url())) lakeSettled = true })
  await page.route('**/api/gardens/lake/memorials', async (route) => {
    await loading.pending
    if (!route.request().failure()) await route.fulfill({ json: [] })
  })
  try {
    await visitLocale(page, '/gardens', 'en')
    await mapReady(page)
    await page.getByTestId('garden-choice-lake').click()
    await expect(page).toHaveURL(/\/gardens\?garden=lake$/)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition', 'waiting')
    await page.goBack()
    await expect(page).toHaveURL(/\/gardens$/)
    await mapReady(page)
    await page.getByTestId('garden-choice-grove').click()
    await expect(page).toHaveURL(/\/gardens\?garden=grove$/)
    await mapReady(page)
    await expect(page.getByTestId('memorial-grove-1')).toBeVisible()
    loading.release()
    await expect.poll(() => lakeSettled).toBe(true)
    await expect(page).toHaveURL(/\/gardens\?garden=grove$/)
    await expect(page.locator('.memorial-hit')).toHaveCount(16)
    await expect(page.getByTestId('garden-loading')).toHaveCount(0)
    await expect(page.locator('.garden-title')).toHaveText('Grove')
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition', 'idle')
    await expect.poll(() => blurAmount(page.locator('.canvas-host'))).toBe(0)
  } finally { loading.release() }
})

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`${reducedMotion}: memorial preparation retains the garden and reveals a stationary monument without changing the URL or camera`, async ({ page, isMobile }, testInfo) => {
    await page.emulateMedia({ reducedMotion })
    await visitLocale(page, '/gardens?garden=lake', 'en')
    await mapReady(page)
    const scene = page.locator('.canvas-wrapper')
    const originalCanvas = await page.locator('canvas').elementHandle()
    await page.getByTestId('garden-zoom-in').click()
    const stone = page.getByTestId('memorial-lake-1')
    await stone.focus()
    if (isMobile) await stone.tap()
    else await stone.click()
    const summary = page.getByTestId('memorial-summary')
    await expect(summary).toBeVisible()
    const before = await camera(page)
    const url = page.url()
    await holdMainFrames(page)
    try {
      if (isMobile) await summary.tap()
      else await summary.click()
      await expect(scene).toHaveAttribute('data-detail-state', 'preparing')
      await expect(scene).toHaveAttribute('data-transition', reducedMotion === 'reduce' ? 'preparing' : 'approaching')
      await expect(scene).toHaveAttribute('aria-busy', 'true')
      await expect(page.locator('.canvas-host')).toBeVisible()
      // Held animation frames retain the beginning of the approach: no blur or
      // close-up geometry may jump ahead while the previous composition waits.
      await expect.poll(() => blurAmount(page.locator('.canvas-host'))).toBe(0)
      await expect(scene).toHaveAttribute('data-transition-scale', '1')
      await expect(scene).not.toHaveAttribute('data-detail-monument-scale')
      await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
      await expect(page.locator('canvas')).toHaveCount(1)
      expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true)
      expect(page.url()).toBe(url)
      expect(await camera(page)).toEqual(before)
      await releaseMainFrames(page)
      if (reducedMotion === 'no-preference') {
        // Observe the actual prepared geometry; the 240ms reveal itself may
        // finish between Playwright's polling intervals on a busy GPU.
        await expect(scene).toHaveAttribute('data-detail-monument-scale', /\d/)
        const initial = await monumentTransform(page)
        expect(Object.values(initial).every(Number.isFinite)).toBe(true)
        expect(initial.scale).toBeGreaterThan(0)
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
        expect(await monumentTransform(page)).toEqual(initial)
        await expect(scene).toHaveAttribute('data-detail-state', 'ready')
        expect(await monumentTransform(page)).toEqual(initial)
      } else await expect(scene).toHaveAttribute('data-detail-state', 'ready')
      await expect(scene).toHaveAttribute('aria-busy', 'false')
      await expect.poll(() => blurAmount(page.locator('.canvas-host'))).toBe(0)
      await expect(page.getByTestId('memorial-detail')).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`stationary-detail-${reducedMotion}.png`), animations: 'disabled', scale: 'css' })
      await page.getByTestId('memorial-detail-close').click()
      await expect(scene).toHaveAttribute('data-detail-state', 'none')
      await mapReady(page)
      expect(page.url()).toBe(url)
      expect(await camera(page)).toEqual(before)
      await expect(stone).toBeFocused()
      await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
      expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true)
    } finally { await releaseMainFrames(page) }
  })
}

test('Escape cancels a preparing memorial before its queued frames can reveal a ghost scene', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visitLocale(page, '/gardens?garden=lake', 'en')
  await mapReady(page)
  const scene = page.locator('.canvas-wrapper')
  await page.getByTestId('garden-zoom-in').click()
  const stone = page.getByTestId('memorial-lake-1')
  await stone.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('memorial-summary')).toBeFocused()
  const before = await camera(page)
  const url = page.url()
  await holdMainFrames(page)
  try {
    await page.keyboard.press('Enter')
    await expect(scene).toHaveAttribute('data-detail-state', 'preparing')
    await expect(scene).toHaveAttribute('data-transition', 'approaching')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('memorial-detail')).toHaveCount(0)
    await releaseMainFrames(page)
    await mapReady(page)
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect(scene).toHaveAttribute('data-detail-state', 'none')
    await expect(page.getByTestId('memorial-detail')).toHaveCount(0)
    await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
    await expect(stone).toBeFocused()
    expect(await camera(page)).toEqual(before)
    expect(page.url()).toBe(url)
    // A fresh activation still works after the cancelled preparation.
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('memorial-summary')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(scene).toHaveAttribute('data-detail-state', 'ready')
    await expect(page.getByTestId('memorial-detail')).toBeVisible()
    await page.keyboard.press('Escape')
    await mapReady(page)
    await expect(scene).toHaveAttribute('data-detail-state', 'none')
  } finally { await releaseMainFrames(page) }
})

test('a deferred GPU drawing failure while changing gardens stays recoverable and retry creates one working canvas', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens?garden=meadow', 'en')
  await mapReady(page)
  // Break actual WebGL drawing only after initialization has succeeded.
  await failQueuedGpuDraws(page)
  try {
    await page.getByTestId('garden-next').click()
    await expect(page).toHaveURL(/\/gardens\?garden=lake$/)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'error')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('The garden could not be displayed')
    await expect(alert.getByRole('button')).toBeEnabled()
    await expect(page.locator('.memorial-hit, .garden-hud, .camera-toolbar')).toHaveCount(0)
    await restoreGpuDraws(page)
    await alert.getByRole('button').click()
    await mapReady(page)
    await expect(page.getByTestId('memorial-lake-1')).toBeVisible()
    await expect(page.locator('.memorial-hit')).toHaveCount(10)
    await expect(page.locator('canvas')).toHaveCount(1)
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(errors).toEqual([])
  } finally { await restoreGpuDraws(page) }
})

test('a failed deferred return from a memorial clears its scene and can recover without reopening a ghost story', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens?garden=lake', 'en')
  await mapReady(page)
  const stone = page.getByTestId('memorial-lake-1')
  await stone.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('memorial-summary')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-detail-state', 'ready')
  await failQueuedGpuDraws(page)
  try {
    await page.getByTestId('memorial-detail-close').click()
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'error')
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(page.getByTestId('memorial-detail')).toHaveCount(0)
    await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
    await restoreGpuDraws(page)
    await alert.getByRole('button').click()
    await mapReady(page)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-detail-state', 'none')
    await expect(page.getByTestId('memorial-detail')).toHaveCount(0)
    await expect(page.locator('canvas')).toHaveCount(1)
    await stone.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('memorial-summary')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-detail-state', 'ready')
    await page.keyboard.press('Escape')
    await mapReady(page)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-detail-state', 'none')
    expect(errors).toEqual([])
  } finally { await restoreGpuDraws(page) }
})

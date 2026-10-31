import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { visitLocale } from './helpers/locale'

type Sample = {
  phase: string | null
  displayed: string | null
  requested: string | null
  token: string | null
  scale: number
  x: number
  y: number
  blur: number
  matrix: string
  at: number
  monument: string | null
  camera: string
  loader: boolean
}

function gate() {
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  return { pending, release }
}

async function observe(page: Page) {
  await page.evaluate(() => {
    const runtime = window as Window & { directedSamples?: Sample[], directedObserver?: MutationObserver }
    runtime.directedObserver?.disconnect()
    const samples: Sample[] = []
    const record = () => {
      const scene = document.querySelector('.canvas-wrapper')
      if (!scene) return
      samples.push({
        phase: scene.getAttribute('data-transition'),
        displayed: scene.getAttribute('data-displayed-garden'),
        requested: scene.getAttribute('data-requested-garden'),
        token: scene.getAttribute('data-transition-token'),
        scale: Number(scene.getAttribute('data-transition-scale')),
        x: Number(scene.getAttribute('data-transition-x')),
        y: Number(scene.getAttribute('data-transition-y')),
        blur: Number(scene.getAttribute('data-transition-blur')),
        matrix: getComputedStyle(scene.querySelector('.canvas-host')!).transform,
        at: Date.now(),
        monument: scene.hasAttribute('data-detail-monument-scale') ? ['data-detail-monument-x', 'data-detail-monument-y', 'data-detail-monument-scale'].map(attribute => scene.getAttribute(attribute)).join(':') : null,
        camera: ['data-camera-x', 'data-camera-y', 'data-zoom'].map(attribute => scene.getAttribute(attribute)).join(':'),
        loader: !!document.querySelector('[data-testid="garden-loading"]')
      })
    }
    const observer = new MutationObserver(record)
    observer.observe(document.querySelector('.canvas-wrapper')!, { attributes: true, subtree: true, childList: true })
    runtime.directedSamples = samples
    runtime.directedObserver = observer
    record()
  })
}

async function samples(page: Page) {
  return page.evaluate(() => (window as Window & { directedSamples?: Sample[] }).directedSamples ?? [])
}

async function ready(page: Page, garden: string) {
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-transition', 'idle')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(scene).toHaveAttribute('data-displayed-garden', garden)
  await expect(scene).toHaveAttribute('data-requested-garden', garden)
  await expect(scene).toHaveAttribute('aria-busy', 'false')
}

async function layout(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const bounds = document.querySelector(selector)!.getBoundingClientRect()
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
    }
    const host = document.querySelector<HTMLElement>('.canvas-host')!
    return { stage: box('.garden-stage'), header: box('[data-testid="garden-header"]'), host: { width: host.offsetWidth, height: host.offsetHeight } }
  })
}

async function camera(page: Page) {
  return page.locator('.canvas-wrapper').evaluate(element => ['data-camera-x', 'data-camera-y', 'data-zoom'].map(attribute => element.getAttribute(attribute)).join(':'))
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: a fast garden response keeps the overview through a directed approach before preparing the selected garden`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    let requestedAt = 0
    await page.route('**/api/gardens/lake/memorials', async (route) => {
      requestedAt = Date.now()
      await route.fulfill({ json: [] })
    })
    await visitLocale(page, '/gardens', locale)
    await ready(page, 'overview')
    const bounds = await layout(page)
    const originalCanvas = await page.locator('canvas').elementHandle()
    await observe(page)
    await page.getByTestId('garden-choice-lake').click()
    await expect(page).toHaveURL(/\/gardens\?garden=lake$/)
    await ready(page, 'lake')
    const history = await samples(page)
    const approach = history.filter(sample => sample.phase === 'approaching')
    expect(approach.length).toBeGreaterThan(1)
    expect(approach.every(sample => sample.displayed === 'overview' && sample.requested === 'lake')).toBe(true)
    expect(Math.max(...approach.map(sample => sample.scale))).toBeGreaterThan(1.05)
    expect(approach.some(sample => Math.abs(sample.x) + Math.abs(sample.y) > 5)).toBe(true)
    // Verify the actual compositor transform, not only controller diagnostics.
    for (const sample of approach) {
      const matrix = sample.matrix.match(/matrix\(([^)]+)\)/)?.[1]?.split(',').map(Number)
      expect(matrix).toBeDefined()
      expect(matrix![0]).toBeCloseTo(sample.scale, 4)
      expect(matrix![4]).toBeCloseTo(sample.x, 2)
      expect(matrix![5]).toBeCloseTo(sample.y, 2)
    }
    expect(approach.every(sample => !sample.loader)).toBe(true)
    const preparation = history.find(sample => sample.phase === 'preparing')!
    expect(preparation).toBeDefined()
    expect(preparation.at - approach[0]!.at).toBeGreaterThanOrEqual(240)
    expect(requestedAt).toBeGreaterThan(0)
    expect(requestedAt - approach[0]!.at).toBeLessThan(200)
    expect(requestedAt).toBeLessThanOrEqual(preparation.at)
    expect(history.some(sample => sample.phase === 'revealing')).toBe(true)
    expect(await layout(page)).toEqual(bounds)
    expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true)
    await expect(page.locator('canvas')).toHaveCount(1)
    await expect(page.getByTestId('memorial-lake-1')).toBeVisible()
    await expect(page.getByTestId('garden-loading')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`directed-lake-${locale}.png`), animations: 'disabled', scale: 'css' })
  })
}

test('slow data waits after the fixed approach, survives resize, and a subsequent error can retry without exposing empty places', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const loading = gate()
  let groveUnavailable = true
  await page.route('**/api/gardens/lake/memorials', async (route) => {
    await loading.pending
    if (!route.request().failure()) await route.fulfill({ json: [] })
  })
  await page.route('**/api/gardens/grove/memorials', route => route.fulfill(groveUnavailable ? { status: 503, json: { statusMessage: 'Memorials unavailable' } } : { json: [] }))
  try {
    await visitLocale(page, '/gardens', 'en')
    await ready(page, 'overview')
    const originalCanvas = await page.locator('canvas').elementHandle()
    await page.getByTestId('garden-choice-lake').click()
    const scene = page.locator('.canvas-wrapper')
    await expect(scene).toHaveAttribute('data-transition', 'approaching')
    await page.setViewportSize({ width: 844, height: 390 })
    await expect(scene).toHaveAttribute('data-transition', 'waiting')
    await expect(scene).toHaveAttribute('data-displayed-garden', 'overview')
    await expect(scene).toHaveAttribute('data-requested-garden', 'lake')
    await expect(scene).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByTestId('garden-loading')).toBeVisible()
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    await expect(page.locator('.memorial-hit')).toHaveCount(0)
    await expect(page.locator('.canvas-host')).toBeVisible()
    expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('directed-wait-after-resize.png'), animations: 'disabled', scale: 'css' })
    loading.release()
    await ready(page, 'lake')
    await page.getByTestId('garden-next').click()
    await expect(page).toHaveURL(/\/gardens\?garden=grove$/)
    await expect(scene).toHaveAttribute('data-transition', 'error')
    await expect(scene).toHaveAttribute('data-displayed-garden', 'lake')
    await expect(page.getByRole('alert')).toContainText('The garden could not be opened')
    await expect(page.locator('.memorial-controls')).toHaveAttribute('aria-hidden', 'true')
    expect(await page.locator('.memorial-controls').evaluate(element => (element as HTMLElement).inert)).toBe(true)
    await expect(page.getByTestId('memorial-grove-1')).toHaveCount(0)
    groveUnavailable = false
    await page.getByRole('alert').getByRole('button').click()
    await ready(page, 'grove')
    await expect(page.getByTestId('memorial-grove-1')).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(1)
    expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true)
  } finally { loading.release() }
})

test('Back and Escape cancel pending scenes and a later selection cannot be replaced by either stale request', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const lake = gate(), grove = gate()
  await page.route('**/api/gardens/lake/memorials', async (route) => {
    await lake.pending
    if (!route.request().failure()) await route.fulfill({ json: [] })
  })
  await page.route('**/api/gardens/grove/memorials', async (route) => {
    await grove.pending
    if (!route.request().failure()) await route.fulfill({ json: [] })
  })
  try {
    await visitLocale(page, '/gardens', 'en')
    await ready(page, 'overview')
    const originalCanvas = await page.locator('canvas').elementHandle()
    await page.getByTestId('garden-choice-lake').click()
    await expect(page).toHaveURL(/\/gardens\?garden=lake$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/gardens$/)
    await ready(page, 'overview')
    await page.getByTestId('garden-choice-grove').click()
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition', 'waiting')
    const cancelledToken = await page.locator('.canvas-wrapper').getAttribute('data-transition-token')
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/gardens$/)
    await ready(page, 'overview')
    await page.getByTestId('garden-choice-hill').click()
    await ready(page, 'hill')
    expect(await page.locator('.canvas-wrapper').getAttribute('data-transition-token')).not.toBe(cancelledToken)
    lake.release()
    grove.release()
    await expect(page.getByTestId('memorial-hill-1')).toBeVisible()
    await expect(page).toHaveURL(/\/gardens\?garden=hill$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/gardens$/)
    await ready(page, 'overview')
    await page.goForward()
    await expect(page).toHaveURL(/\/gardens\?garden=hill$/)
    await ready(page, 'hill')
    await expect(page.locator('canvas')).toHaveCount(1)
    expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true)
  } finally { lake.release(); grove.release() }
})

test('opening the full story zooms the source composition without moving its camera or flying the close-up monument', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await visitLocale(page, '/gardens?garden=lake&from=directed', 'en')
  await ready(page, 'lake')
  await page.getByTestId('garden-zoom-in').click()
  const stone = page.getByTestId('memorial-lake-1')
  await stone.focus()
  if (isMobile) await stone.tap()
  else await stone.click()
  const summary = page.getByTestId('memorial-summary')
  await expect(summary).toBeVisible()
  const before = await camera(page)
  const bounds = await layout(page)
  const url = page.url()
  const originalCanvas = await page.locator('canvas').elementHandle()
  await observe(page)
  if (isMobile) await summary.tap()
  else await summary.click()
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-detail-state', 'ready')
  await ready(page, 'lake')
  const history = await samples(page)
  const approach = history.filter(sample => sample.phase === 'approaching')
  expect(approach.length).toBeGreaterThan(1)
  expect(approach.every(sample => sample.monument === null)).toBe(true)
  expect(approach.some(sample => sample.scale > 1.05)).toBe(true)
  expect(history.every(sample => sample.camera === before)).toBe(true)
  const monumentScales = history.filter(sample => sample.monument !== null).map(sample => sample.monument)
  expect(monumentScales.length).toBeGreaterThan(0)
  expect(new Set(monumentScales).size).toBe(1)
  expect(await layout(page)).toEqual(bounds)
  expect(page.url()).toBe(url)
  await page.getByTestId('memorial-detail-return').click()
  await ready(page, 'lake')
  expect(await camera(page)).toBe(before)
  expect(page.url()).toBe(url)
  await expect(stone).toBeFocused()
  await expect(page.getByTestId('memorial-summary')).toHaveCount(0)
  await expect(page.locator('canvas')).toHaveCount(1)
  expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true)
})

test('a reduced-motion direct memorial link uses actual readiness and remains usable after phone rotation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const loading = gate()
  await page.route('**/api/gardens/lake/memorials', async (route) => {
    await loading.pending
    if (!route.request().failure()) await route.fulfill({ json: [] })
  })
  try {
    await visitLocale(page, '/gardens?garden=lake&memorial=lake-1&from=directed', 'en')
    const scene = page.locator('.canvas-wrapper')
    await expect(scene).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByTestId('garden-loading')).toBeVisible()
    await expect(scene).not.toHaveAttribute('data-transition', 'approaching')
    await expect(page.locator('.memorial-hit')).toHaveCount(0)
    loading.release()
    await expect(scene).toHaveAttribute('data-detail-state', 'ready')
    await ready(page, 'lake')
    const originalCanvas = await page.locator('canvas').elementHandle()
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size)
      await expect(scene).toHaveAttribute('data-detail-state', 'ready')
      await ready(page, 'lake')
      await expect(page.getByTestId('memorial-detail-return')).toBeInViewport()
      await expect(scene).toHaveAttribute('data-transition-scale', '1')
      await expect(page.locator('canvas')).toHaveCount(1)
      expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    }
    await expect(page).toHaveURL(/\/gardens\?garden=lake&memorial=lake-1&from=directed$/)
    await expect(page.getByTestId('memorial-detail').locator('.memorial-return')).toBeFocused()
  } finally { loading.release() }
})

test('Escape during the first reveal restores the source garden, exact user camera and unrelated query after target geometry has committed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const loading = gate()
  await page.route('**/api/gardens/grove/memorials', async (route) => {
    await loading.pending
    if (!route.request().failure()) await route.fulfill({ json: [] })
  })
  try {
    await visitLocale(page, '/gardens?garden=lake&from=cancel-test', 'en')
    await ready(page, 'lake')
    const scene = page.locator('.canvas-wrapper')
    const initialZoom = Number(await scene.getAttribute('data-zoom'))
    await page.getByTestId('garden-zoom-in').click()
    await expect.poll(async () => Number(await scene.getAttribute('data-zoom'))).toBeCloseTo(Math.min(4, initialZoom * 1.25), 2)
    const sourceZoom = (await scene.getAttribute('data-zoom'))!
    const sourceCamera = await camera(page)
    const sourceLayout = await layout(page)
    const sourceUrl = page.url()
    const originalCanvas = await page.locator('canvas').elementHandle()
    await page.getByTestId('garden-next').click()
    await expect(page).toHaveURL(/\/gardens\?garden=grove&from=cancel-test$/)
    await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-transition', 'waiting')
    await page.evaluate(() => {
      const runtime = window as Window & { firstDirectedReveal?: Promise<string | null> }
      const scene = document.querySelector('.canvas-wrapper')!
      runtime.firstDirectedReveal = new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          if (scene.getAttribute('data-transition') !== 'revealing' || scene.getAttribute('data-requested-garden') !== 'grove') return
          observer.disconnect()
          resolve(scene.getAttribute('data-displayed-garden'))
        })
        observer.observe(scene, { attributes: true, attributeFilter: ['data-transition'] })
      })
    })
    loading.release()
    // Resolve at the very first revealing mutation, before a polling interval
    // could miss the short phase. Grove's first frame is already committed.
    expect(await page.evaluate(() => (window as Window & { firstDirectedReveal?: Promise<string | null> }).firstDirectedReveal)).toBe('grove')
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(sourceUrl)
    await ready(page, 'lake')
    expect(await camera(page)).toBe(sourceCamera)
    expect(await layout(page)).toEqual(sourceLayout)
    await expect(scene).toHaveAttribute('data-zoom', sourceZoom)
    await expect(page.getByTestId('memorial-lake-1')).toBeVisible()
    await expect(page.getByTestId('memorial-grove-1')).toHaveCount(0)
    await expect(page.locator('canvas')).toHaveCount(1)
    expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true)
  } finally { loading.release() }
})

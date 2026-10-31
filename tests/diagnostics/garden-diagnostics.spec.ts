import { clickGardenControl } from '../e2e/helpers/garden-controls'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { GardenDiagnosticsReport, GardenDiagnosticsSnapshot } from '../../app/utils/gardenDiagnostics'
import { localeCookieName } from '../../shared/locale'
import { openMemorialStory } from '../e2e/helpers/memorial'
import { enterGarden } from './helpers'

type DiagnosticsApi = {
  ready: () => boolean
  snapshot: () => GardenDiagnosticsSnapshot
  report: () => GardenDiagnosticsReport
  download: (runId?: string) => void
  beginRun: (scenario: string) => string
  endRun: (reason?: string) => GardenDiagnosticsReport | undefined
  results: () => GardenDiagnosticsReport[]
  setMode: (mode: 'panel' | 'collect') => void
  setFpsLimit: (limit: 30 | 60) => void
  setPaused: (paused: boolean) => void
  camera: (view: { zoom: number, x: number, y: number }) => void
  navigateGarden: (id: string) => Promise<void>
}
type Runtime = Window & { __gardenDiagnostics?: DiagnosticsApi, diagnostic500msIntervals?: number }
const origin = 'http://127.0.0.1:4180'
const disabledOrigin = 'http://127.0.0.1:4181'
const privateName = 'diagnostics-private-pet-name'
const privateStory = 'diagnostics-private-story-content'
const privateCreator = 'diagnostics-private-creator'
const savedId = '8bca0797-5d6c-4b68-b243-9c41c7fe0203'

function gate() {
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  return { pending, release }
}

function savedMemorial(garden: string) {
  return { source: 'saved', id: savedId, gardenId: garden, place: 3, name: privateName, story: privateStory, creatorName: privateCreator, species: 'cat', born: 2010, died: 2024, canEdit: false }
}

async function fixtures(page: Page, base = origin) {
  await page.context().addCookies([
    { name: localeCookieName, value: 'en', url: base },
    { name: 'petmemoreal_garden_session', value: '424242', url: base }
  ])
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/me') return route.fulfill({ status: 401, json: { statusCode: 401, statusMessage: 'Unauthorized' } })
    if (pathname === '/api/auth/get-session') return route.fulfill({ json: null })
    const garden = pathname.match(/^\/api\/gardens\/(meadow|lake|grove|hill)\/memorials$/)?.[1]
    if (garden) return route.fulfill({ json: [savedMemorial(garden)] })
    return route.fulfill({ status: 404, json: { statusMessage: 'Unexpected diagnostic fixture request' } })
  })
}

async function ready(page: Page, garden = 'meadow') {
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(scene).toHaveAttribute('data-transition', 'idle')
  await expect(scene).toHaveAttribute('data-displayed-garden', garden)
  await expect(page.locator('canvas')).toHaveCount(1)
}

async function visit(page: Page, base = origin, options: { autoStart?: boolean, record?: boolean } = {}) {
  await fixtures(page, base)
  await enterGarden(page, `${base}/gardens?garden=meadow&diagnosticsMode=collect${options.autoStart ? '&diagnosticsAutoStart=1' : ''}`)
  await ready(page)
  if (base === origin) {
    await expect.poll(() => page.evaluate(() => !!(window as Runtime).__gardenDiagnostics?.ready())).toBe(true)
    if (!options.autoStart && options.record !== false) await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.beginRun('acceptance'))
  }
}

async function snapshot(page: Page) {
  return page.evaluate(() => (window as Runtime).__gardenDiagnostics!.snapshot())
}

async function report(page: Page) {
  return page.evaluate(() => (window as Runtime).__gardenDiagnostics!.report())
}

async function paused(page: Page, enabled: boolean) {
  await page.evaluate(value => (window as Runtime).__gardenDiagnostics!.setPaused(value), enabled)
  await expect.poll(async () => (await snapshot(page)).active).toBe(!enabled)
}

async function downloadedReport(page: Page, action: () => Promise<unknown>) {
  const downloaded = page.waitForEvent('download')
  await action()
  const file = await downloaded
  expect(file.suggestedFilename()).toMatch(/^garden-diagnostics-.+\.json$/)
  const path = await file.path()
  expect(path).not.toBeNull()
  return JSON.parse(await readFile(path!, 'utf8')) as GardenDiagnosticsReport
}

function safeReport(result: GardenDiagnosticsReport) {
  expect(result.schemaVersion).toBe(2)
  expect(result.runId).toBeTruthy()
  expect(result.capacity).toBeGreaterThan(0)
  expect(result.capacity).toBeLessThanOrEqual(2048)
  expect(result.context.browser).toBeTruthy()
  expect(result.context.viewport.width).toBeGreaterThan(0)
  expect(result.context.rendererWidth).toBeGreaterThanOrEqual(result.context.viewport.width)
  expect(result.context.dpr).toBeGreaterThan(0)
  expect(result.resources.totalNodes).toBeGreaterThan(0)
  expect(result.resources.atmospherePasses).toBeLessThanOrEqual(1)
  for (const samples of Object.values(result.raw)) expect(samples.length).toBeLessThanOrEqual(result.capacity)
  for (const value of [privateName, privateStory, privateCreator]) expect(JSON.stringify(result)).not.toContain(value)
  expect(result.measurements.cpu).toContain('GPU time is not measured')
  expect(result.measurements.rates).toContain('not display FPS')
}

test('flag off keeps the normal 30-tick scene without diagnostics globals, controls or polling', async ({ page }) => {
  await page.addInitScript(() => {
    const runtime = window as Runtime
    runtime.diagnostic500msIntervals = 0
    const interval = window.setInterval.bind(window)
    window.setInterval = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 500) runtime.diagnostic500msIntervals!++
      return interval(callback, delay, ...args)
    }) as typeof window.setInterval
  })
  await visit(page, disabledOrigin)
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-diagnostics', 'disabled')
  await expect(scene).toHaveAttribute('data-fps-limit', '30')
  await expect(page.getByTestId('diagnostics-toggle')).toHaveCount(0)
  const disabled = await page.evaluate(() => ({ global: Object.hasOwn(window, '__gardenDiagnostics'), intervals: (window as Runtime).diagnostic500msIntervals }))
  expect(disabled.global).toBe(false)
  expect(disabled.intervals).toBe(0)
  await page.getByTestId('garden-zoom-in').click()
  await expect(scene).toHaveAttribute('data-zoom', '1.250')
  expect(await page.evaluate(() => (window as Runtime).__gardenDiagnostics)).toBeUndefined()
})

test('collect mode gathers real animation and cold-ready timings, exports safe data and keeps one renderer', async ({ page }) => {
  await visit(page, origin, { autoStart: true })
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-diagnostics', 'collect')
  await expect(scene).toHaveAttribute('data-fps-limit', '30')
  await expect.poll(async () => (await snapshot(page)).counts.activeAutomaticRenders).toBeGreaterThan(3)
  const result = await report(page)
  safeReport(result)
  expect(result.mode).toBe('collect')
  expect(result.context.garden).toBe('meadow')
  expect(result.context.seed).toBe(424242)
  expect(result.context.memorialCount).toBeGreaterThan(0)
  expect(result.counts.ready).toBeGreaterThan(0)
  expect(result.generationMs.total).toBeGreaterThan(0)
  expect(result.totalReadyMs.total).toBeGreaterThan(0)
  expect(result.raw.updateCpu.length).toBeGreaterThan(0)
  expect(result.raw.renderCpu.length).toBeGreaterThan(0)
  expect(result.counts.renders).toBe(result.counts.automaticRenders + result.counts.manualRenders)
  const canvas = await page.locator('canvas').elementHandle()
  await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.navigateGarden('lake'))
  await ready(page, 'lake')
  expect(await canvas!.evaluate(element => element.isConnected)).toBe(true)
  const after = await report(page)
  safeReport(after)
  expect(after.context.garden).toBe('lake')
  expect(after.counts.generations).toBeGreaterThan(result.counts.generations)
  expect(after.counts.ready).toBeGreaterThan(result.counts.ready)
  const exported = await downloadedReport(page, () => page.evaluate(() => (window as Runtime).__gardenDiagnostics!.download()))
  safeReport(exported)
  expect(exported.runId).toBe(after.runId)
  expect(exported.mode).toBe('collect')
})

test('panel controls change collection mode and 30/60 limits while CPU timings retain real tick cadence', async ({ page }) => {
  await visit(page)
  await clickGardenControl(page, 'diagnostics-toggle')
  const panel = page.getByTestId('diagnostics-panel')
  await expect(panel).toBeVisible()
  await page.getByTestId('diagnostics-mode').click()
  await page.getByRole('option', { name: 'Live panel', exact: true }).click()
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-diagnostics', 'panel')
  await expect.poll(async () => (await snapshot(page)).mode).toBe('panel')
  await expect(panel.getByRole('table')).toBeVisible()
  await paused(page, true)
  await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.beginRun('limit-30'))
  await paused(page, false)
  await expect.poll(async () => (await snapshot(page)).tickIntervals.total).toBeGreaterThan(6)
  const thirty = await report(page)
  expect(thirty.context.fpsLimit).toBe(30)
  // Software-rendered browsers may run slower than either limit. Assert actual
  // intervals respect the ceiling rather than pretending every device reaches it.
  expect(Math.min(...thirty.raw.tickIntervals)).toBeGreaterThanOrEqual(1000 / 30 - 4)
  await page.getByTestId('diagnostics-fps').click()
  await page.getByRole('option', { name: /^60(?:\s|$)/ }).click()
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-fps-limit', '60')
  await paused(page, true)
  await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.beginRun('limit-60'))
  await paused(page, false)
  await expect.poll(async () => (await snapshot(page)).tickIntervals.total).toBeGreaterThan(6)
  const sixty = await report(page)
  expect(sixty.context.fpsLimit).toBe(60)
  expect(Math.min(...sixty.raw.tickIntervals)).toBeGreaterThanOrEqual(1000 / 60 - 4)
  await page.getByTestId('diagnostics-mode').click()
  await page.getByRole('option', { name: 'Collect only', exact: true }).click()
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-diagnostics', 'collect')
  await expect(panel.getByRole('table')).toHaveCount(0)
  const exported = await downloadedReport(page, () => page.getByTestId('diagnostics-export').click())
  safeReport(exported)
  expect(exported.mode).toBe('collect')
  expect(exported.context.fpsLimit).toBe(60)
})

test('pause preserves tick samples while manual camera renders remain visible and a new run resets counters', async ({ page }) => {
  await visit(page)
  await expect.poll(async () => (await snapshot(page)).counts.ticks).toBeGreaterThan(3)
  await paused(page, true)
  const before = await report(page)
  await page.waitForTimeout(300)
  const still = await report(page)
  expect(still.counts.ticks).toBe(before.counts.ticks)
  expect(still.activeMs).toBe(before.activeMs)
  expect(still.raw.tickIntervals).toEqual(before.raw.tickIntervals)
  const drawing = await page.locator('.canvas-wrapper').evaluate(element => [element.getAttribute('data-drawing-width'), element.getAttribute('data-drawing-height')])
  await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.camera({ zoom: 1.5, x: -30, y: -20 }))
  await expect.poll(async () => (await snapshot(page)).counts.manualRenders).toBeGreaterThan(before.counts.manualRenders)
  const camera = await report(page)
  expect(camera.counts.ticks).toBe(before.counts.ticks)
  expect(camera.renderCpu.total).toBe(before.renderCpu.total)
  expect(camera.allRenderCpu.total).toBeGreaterThan(before.allRenderCpu.total)
  expect(camera.raw.renders.at(-1)?.active).toBe(false)
  expect(camera.raw.renders.at(-1)?.path).toBe('manual')
  expect(await page.locator('.canvas-wrapper').evaluate(element => [element.getAttribute('data-drawing-width'), element.getAttribute('data-drawing-height')])).toEqual(drawing)
  expect(camera.resources.renderTextures).toBe(before.resources.renderTextures)
  await paused(page, false)
  await expect.poll(async () => (await snapshot(page)).counts.ticks).toBeGreaterThan(before.counts.ticks + 2)
  const resumed = await report(page)
  expect(resumed.raw.tickIntervals.at(-1)).toBeLessThan(300)
  await paused(page, true)
  await clickGardenControl(page, 'diagnostics-toggle')
  const previousId = (await snapshot(page)).runId
  await page.getByTestId('diagnostics-panel').getByRole('textbox').fill('acceptance-new-run')
  await page.getByTestId('diagnostics-start').click()
  const reset = await report(page)
  expect(reset.runId).not.toBe(previousId)
  expect(reset.scenario).toBe('acceptance-new-run')
  expect(reset.activeMs).toBe(0)
  expect(reset.counts.ticks).toBe(0)
  expect(reset.counts.renders).toBe(0)
  expect(reset.updateCpu.total).toBe(0)
  expect(reset.tickIntervals.retained).toBe(0)
  expect(reset.raw.renders).toEqual([])
})

test('enabled diagnostics remain idle until explicitly started and stopped reports retain their measured settings', async ({ page }) => {
  await visit(page, origin, { record: false })
  const idle = await report(page)
  expect(idle.schemaVersion).toBe(2)
  expect(idle.status).toBe('idle')
  expect(idle.recording).toBe(false)
  expect(idle.runId).toBe('')
  expect(idle.counts.ticks).toBe(0)
  await page.waitForTimeout(200)
  expect((await report(page)).counts.ticks).toBe(0)
  const id = await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.beginRun('explicit-v2'))
  await expect.poll(async () => (await snapshot(page)).counts.ticks).toBeGreaterThan(3)
  const ended = await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.endRun('manual'))
  expect(ended?.recording).toBe(false)
  expect(ended?.status).toBe('completed')
  expect(ended?.runId).toBe(id)
  expect(ended?.configuration?.fpsLimit).toBe(30)
  expect(ended?.rates.current.windowMs).toBeGreaterThan(0)
  expect(ended?.rates.average.ticksPerSecond).toBe(ended?.rates.ticksPerSecond)
  await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.setFpsLimit(60))
  await page.waitForTimeout(200)
  expect(await report(page)).toEqual(ended)
  const results = await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.results())
  expect(results).toHaveLength(1)
  expect(results[0]?.configuration?.fpsLimit).toBe(30)
  const nextId = await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.beginRun('explicit-60'))
  expect(nextId).not.toBe(id)
  expect((await snapshot(page)).configuration?.fpsLimit).toBe(60)
})

test('visibility gaps stop active accounting and never become a tick-interval sample', async ({ page }) => {
  await visit(page)
  await expect.poll(async () => (await snapshot(page)).tickIntervals.total).toBeGreaterThan(3)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(async () => (await snapshot(page)).active).toBe(false)
  const hidden = await report(page)
  await page.waitForTimeout(400)
  const after = await report(page)
  expect(after.counts.ticks).toBe(hidden.counts.ticks)
  expect(after.activeMs).toBe(hidden.activeMs)
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(async () => (await snapshot(page)).active).toBe(true)
  await expect.poll(async () => (await snapshot(page)).tickIntervals.total).toBeGreaterThan(hidden.tickIntervals.total + 1)
  const resumed = await report(page)
  expect(resumed.raw.tickIntervals.at(-1)).toBeLessThan(400)
  expect(resumed.activeMs - hidden.activeMs).toBeLessThan(resumed.elapsedMs - hidden.elapsedMs - 300)
})

test('first garden API timing is independent from preparation and is never reused by memorial, resize or return scenes', async ({ page }) => {
  const loading = gate()
  let requests = 0
  await fixtures(page)
  await page.route('**/api/gardens/*/memorials', async (route) => {
    requests++
    await loading.pending
    await route.fulfill({ json: [savedMemorial('meadow')] })
  })
  try {
    // Mount the renderer on overview first: a held useAsyncData call on first
    // client entry would otherwise suspend the page before its Canvas exists.
    await enterGarden(page, `${origin}/gardens`)
    await ready(page, 'overview')
    await expect.poll(() => page.evaluate(() => !!(window as Runtime).__gardenDiagnostics?.ready())).toBe(true)
    await page.evaluate(() => {
      const diagnostics = (window as Runtime).__gardenDiagnostics!
      diagnostics.beginRun('first-garden-preparation')
      return diagnostics.navigateGarden('meadow')
    })
    const scene = page.locator('.canvas-wrapper')
    await expect(scene).toHaveAttribute('data-transition', 'waiting')
    await expect.poll(() => requests).toBe(1)
    await expect.poll(() => page.evaluate(() => !!(window as Runtime).__gardenDiagnostics)).toBe(true)
    await page.evaluate(() => {
      const runtime = window as Runtime & { diagnosticPhases?: { phase: string, at: number }[], diagnosticPhaseObserver?: MutationObserver }
      runtime.diagnosticPhases = []
      const canvas = document.querySelector('.canvas-wrapper')!
      runtime.diagnosticPhaseObserver = new MutationObserver(() => {
        const phase = canvas.getAttribute('data-transition') ?? ''
        if (runtime.diagnosticPhases!.at(-1)?.phase !== phase && runtime.diagnosticPhases!.length < 64) runtime.diagnosticPhases!.push({ phase, at: performance.now() })
      })
      runtime.diagnosticPhaseObserver.observe(canvas, { attributes: true, attributeFilter: ['data-transition'] })
    })
    const heldAt = await page.evaluate(() => performance.now())
    await page.waitForTimeout(500)
    const releasedAt = await page.evaluate(() => performance.now())
    loading.release()
    await ready(page)
    const first = await report(page)
    expect(first.raw.ready).toHaveLength(1)
    const cold = first.raw.ready[0]!
    const phases = await page.evaluate(() => {
      const runtime = window as Runtime & { diagnosticPhases?: { phase: string, at: number }[], diagnosticPhaseObserver?: MutationObserver }
      runtime.diagnosticPhaseObserver?.disconnect()
      return runtime.diagnosticPhases!
    })
    const firstReveal = phases.find(sample => sample.phase === 'revealing')!
    const interactive = phases.find(sample => sample.phase === 'idle')!
    expect(firstReveal).toBeDefined()
    expect(interactive).toBeDefined()
    expect(cold.apiWaitMs).toBeGreaterThanOrEqual(releasedAt - heldAt - 2)
    expect(cold.totalMs).toBeGreaterThanOrEqual(cold.preparationMs)
    expect(cold.totalMs).toBeLessThanOrEqual(cold.atMs + 5)
    // The measured preparation ends at the first rendered frame. Its upper
    // bound comes from real phase timestamps, not a device-specific CPU budget.
    expect(cold.preparationMs).toBeLessThanOrEqual(firstReveal.at - releasedAt + 16)
    expect(interactive.at - firstReveal.at).toBeGreaterThan(180)
    expect(cold.totalMs - cold.preparationMs).toBeGreaterThanOrEqual(interactive.at - firstReveal.at - 20)
    expect(first.apiWaitMs.total).toBe(1)

    await openMemorialStory(page, page.getByTestId(`memorial-${savedId}`))
    await expect(scene).toHaveAttribute('data-detail-state', 'ready')
    await expect(scene).toHaveAttribute('data-transition', 'idle')
    const detail = await report(page)
    expect(detail.counts.ready).toBeGreaterThan(first.counts.ready)
    expect(detail.raw.ready.at(-1)?.kind).toBe('memorial')
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect.poll(async () => (await snapshot(page)).runId).not.toBe(detail.runId)
    await expect.poll(async () => (await snapshot(page)).counts.ready).toBe(1)
    await expect(scene).toHaveAttribute('data-detail-state', 'ready')
    await expect(scene).toHaveAttribute('data-transition', 'idle')
    const resized = await report(page)
    expect(resized.raw.ready).toHaveLength(1)
    expect(resized.raw.ready[0]?.kind).toBe('memorial')
    expect(resized.raw.ready[0]?.apiWaitMs).toBe(0)
    expect(resized.configuration?.viewport).toEqual(await scene.locator('.canvas-host').evaluate((host: HTMLElement) => ({ width: host.clientWidth, height: host.clientHeight })))
    const archived = await page.evaluate(id => (window as Runtime).__gardenDiagnostics!.results().find(result => result.runId === id), detail.runId)
    expect(archived).toBeDefined()
    expect(archived!.endReason).toBe('conditions:viewport')
    expect(archived!.recording).toBe(false)
    expect(archived!.configuration?.viewport).toEqual(detail.configuration?.viewport)
    expect(archived!.raw.ready).toEqual(detail.raw.ready)
    expect(archived!.raw.ready).toHaveLength(2)
    expect(archived!.raw.ready[0]!.apiWaitMs).toBe(cold.apiWaitMs)
    expect(archived!.raw.ready[1]!.apiWaitMs).toBe(0)
    await page.getByTestId('memorial-detail').locator('.memorial-return').click()
    await ready(page)
    const after = await report(page)
    expect(after.runId).toBe(resized.runId)
    expect(after.raw.ready).toHaveLength(2)
    expect(after.raw.ready.at(-1)?.kind).toBe('garden')
    for (const sample of after.raw.ready) expect(sample.apiWaitMs).toBe(0)
    expect(requests).toBe(1)
    safeReport(after)
  } finally { loading.release() }
})

test('resetting a run during API waiting discards the pending journey and records only the next garden journey', async ({ page }) => {
  const initial = gate(), future = gate()
  const requests: string[] = []
  await fixtures(page)
  await page.route('**/api/gardens/*/memorials', async (route) => {
    const garden = new URL(route.request().url()).pathname.split('/')[3]!
    requests.push(garden)
    await (garden === 'meadow' ? initial.pending : future.pending)
    await route.fulfill({ json: [savedMemorial(garden)] })
  })
  try {
    await enterGarden(page, `${origin}/gardens`)
    await ready(page, 'overview')
    await expect.poll(() => page.evaluate(() => !!(window as Runtime).__gardenDiagnostics?.ready())).toBe(true)
    await page.evaluate(() => {
      const diagnostics = (window as Runtime).__gardenDiagnostics!
      diagnostics.beginRun('pending-garden')
      return diagnostics.navigateGarden('meadow')
    })
    const scene = page.locator('.canvas-wrapper')
    await expect(scene).toHaveAttribute('data-transition', 'waiting')
    await expect.poll(() => page.evaluate(() => !!(window as Runtime).__gardenDiagnostics)).toBe(true)
    const oldId = (await snapshot(page)).runId
    const resetId = await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.beginRun('reset-during-api'))
    expect(resetId).not.toBe(oldId)
    expect((await report(page)).raw.ready).toEqual([])
    initial.release()
    await ready(page)
    const reset = await report(page)
    expect(reset.runId).toBe(resetId)
    expect(reset.counts.ready).toBe(0)
    expect(reset.raw.ready).toEqual([])
    expect(reset.totalReadyMs.total).toBe(0)
    expect(reset.apiWaitMs.total).toBe(0)

    await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.navigateGarden('lake'))
    await expect(scene).toHaveAttribute('data-transition', 'waiting')
    await expect.poll(() => requests.length).toBe(2)
    const heldAt = await page.evaluate(() => performance.now())
    await page.waitForTimeout(350)
    const releasedAt = await page.evaluate(() => performance.now())
    future.release()
    await ready(page, 'lake')
    const next = await report(page)
    expect(next.runId).toBe(resetId)
    expect(next.raw.ready).toHaveLength(1)
    expect(next.counts.ready).toBe(1)
    expect(next.totalReadyMs.total).toBe(1)
    expect(next.apiWaitMs.total).toBe(1)
    expect(next.raw.ready[0]!.kind).toBe('garden')
    expect(next.raw.ready[0]!.apiWaitMs).toBeGreaterThanOrEqual(releasedAt - heldAt - 2)
    expect(next.raw.ready[0]!.totalMs).toBeGreaterThanOrEqual(next.raw.ready[0]!.preparationMs)
    expect(next.scenario).toBe('reset-during-api')
    expect(requests).toEqual(['meadow', 'lake'])
  } finally { initial.release(); future.release() }
})

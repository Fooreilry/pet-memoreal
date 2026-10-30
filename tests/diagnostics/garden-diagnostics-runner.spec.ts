import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { GardenDiagnosticsReport } from '../../app/utils/gardenDiagnostics'
import { localeCookieName } from '../../shared/locale'
import { enterGarden } from './helpers'
import { pointerWheelMeasurement } from '../benchmarks/pointerInput'
import { validateGardenBenchmarkRun } from '../../app/utils/gardenBenchmarkProtocol'

type Runtime = Window & { __gardenDiagnostics?: {
  ready: () => boolean, report: () => GardenDiagnosticsReport, results: () => GardenDiagnosticsReport[],
  beginRun: (scenario: string) => string, endRun: (reason?: string) => GardenDiagnosticsReport | undefined,
  setMode: (mode: 'panel' | 'collect') => void,
  getInteractionInfo: () => { pointerMoves: number, wheels: number }
} }
const origin = 'http://127.0.0.1:4180'

async function visit(page: Page) {
  await page.context().addCookies([
    { name: localeCookieName, value: 'en', url: origin },
    { name: 'petmemoreal_garden_session', value: '424242', url: origin }
  ])
  await page.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.startsWith('/api/_nuxt_icon/')) return route.continue()
    if (pathname === '/api/me') return route.fulfill({ status: 401, json: { statusCode: 401, statusMessage: 'Unauthorized' } })
    if (pathname === '/api/auth/get-session') return route.fulfill({ json: null })
    if (/^\/api\/gardens\/(meadow|lake|grove|hill)\/memorials$/.test(pathname)) return route.fulfill({ json: [] })
    return route.fulfill({ status: 404, json: { statusMessage: 'Unexpected diagnostics runner fixture request' } })
  })
  await enterGarden(page, `${origin}/gardens?garden=lake`)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  await expect.poll(() => page.evaluate(() => !!(window as Runtime).__gardenDiagnostics?.ready())).toBe(true)
}

async function report(page: Page) { return page.evaluate(() => (window as Runtime).__gardenDiagnostics!.report()) }

async function open(page: Page) {
  await page.getByTestId('diagnostics-toggle').click()
  await expect(page.getByTestId('diagnostics-panel')).toBeVisible()
}

async function start(page: Page, scenario: string) {
  await page.getByTestId('diagnostics-panel').getByRole('textbox').fill(scenario)
  await page.getByTestId('diagnostics-start').click()
  await expect.poll(async () => (await report(page)).recording).toBe(true)
  await expect.poll(async () => (await report(page)).counts.ticks).toBeGreaterThan(2)
}

test('recording starts explicitly, survives closing the panel and stops into a frozen downloadable result', async ({ page }) => {
  await visit(page)
  const idle = await report(page)
  expect(idle.recording).toBe(false)
  expect(idle.status).toBe('idle')
  expect(idle.counts.ticks).toBe(0)
  await open(page)
  await expect(page.getByTestId('diagnostics-recording-status')).toHaveText('Not recording')
  await expect(page.getByTestId('diagnostics-stop')).toBeDisabled()
  await page.getByRole('button', { name: 'Close diagnostics', exact: true }).click()
  expect((await report(page)).recording).toBe(false)
  await open(page)
  await start(page, 'popup-independent-recording')
  const visible = await report(page)
  expect(visible.configuration!.panelVisible).toBe(true)
  await page.getByRole('button', { name: 'Close diagnostics', exact: true }).click()
  await expect(page.getByTestId('diagnostics-panel')).toHaveCount(0)
  // Panel visibility is a separate measurement condition. Collection continues
  // in a new run rather than mixing the panel's overhead into the previous run.
  await expect.poll(async () => (await report(page)).runId).not.toBe(visible.runId)
  await expect.poll(async () => (await report(page)).recording).toBe(true)
  await expect.poll(async () => (await report(page)).counts.ticks).toBeGreaterThan(2)
  const hidden = await report(page)
  expect(hidden.configuration!.panelVisible).toBe(false)
  await open(page)
  await expect.poll(async () => (await report(page)).runId).not.toBe(hidden.runId)
  await page.getByTestId('diagnostics-stop').click()
  await expect.poll(async () => (await report(page)).status).toBe('completed')
  const stopped = await report(page)
  expect(stopped.recording).toBe(false)
  await expect(page.getByTestId(`diagnostics-result-${stopped.runId}`)).toContainText('popup-independent-recording')
  await expect(page.getByTestId('diagnostics-stop')).toBeDisabled()
  const download = page.waitForEvent('download')
  await page.getByTestId(`diagnostics-result-export-${stopped.runId}`).click()
  const file = await download
  const downloaded = JSON.parse(await readFile((await file.path())!, 'utf8')) as GardenDiagnosticsReport
  expect(downloaded.schemaVersion).toBe(2)
  expect(downloaded.runId).toBe(stopped.runId)
  expect(downloaded.recording).toBe(false)
  expect(downloaded.status).toBe('completed')
  await page.getByRole('button', { name: 'Close diagnostics', exact: true }).click()
  await page.waitForTimeout(200)
  const after = await report(page)
  expect(after.recording).toBe(false)
  expect(after.runId).toBe(stopped.runId)
  expect(after.counts).toEqual(stopped.counts)
  expect(after.activeMs).toBe(stopped.activeMs)
  await open(page)
  expect((await report(page)).recording).toBe(false)
})

test('changing FPS separates recording conditions while collect mode retains archived results', async ({ page }) => {
  await visit(page)
  await open(page)
  await start(page, 'settings-separated-recording')
  const initial = await report(page)
  expect(initial.context.fpsLimit).toBe(30)
  await page.getByTestId('diagnostics-fps').click()
  await page.getByRole('option', { name: /^60(?:\s|$)/ }).click()
  await expect.poll(async () => (await report(page)).runId).not.toBe(initial.runId)
  await expect.poll(async () => (await report(page)).recording).toBe(true)
  await expect.poll(async () => (await report(page)).context.fpsLimit).toBe(60)
  const archived = page.getByTestId(`diagnostics-result-${initial.runId}`)
  await expect(archived).toHaveCount(1)
  await expect(archived).toContainText('settings-separated-recording')
  await expect(archived).toHaveAttribute('data-end-reason', /condition/)
  const fpsRun = await report(page)
  await page.getByTestId('diagnostics-mode').click()
  await page.getByRole('option', { name: 'Collect only', exact: true }).click()
  await expect.poll(async () => (await report(page)).runId).not.toBe(fpsRun.runId)
  expect((await report(page)).mode).toBe('collect')
  const splitRuns = await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.results())
  expect(splitRuns.find(result => result.runId === fpsRun.runId)!.mode).toBe('panel')
  await page.getByTestId('diagnostics-stop').click()
  await expect.poll(async () => (await report(page)).recording).toBe(false)
  await expect(page.getByTestId('diagnostics-panel').getByRole('table')).toHaveCount(0)
  await expect(page.getByTestId('diagnostics-results')).toBeVisible()
  await expect(archived).toHaveCount(1)
  await expect(page.getByTestId(`diagnostics-result-export-${initial.runId}`)).toBeEnabled()
  expect((await report(page)).recording).toBe(false)
})

test('controlled benchmark locks conflicting controls, cancels explicitly and cancels if its panel is closed', async ({ page }) => {
  await visit(page)
  await open(page)
  await expect(page.getByTestId('diagnostics-benchmark-scenario')).toContainText('Camera movement')
  await expect(page.getByTestId('diagnostics-benchmark-scope')).toContainText('Current garden')
  await page.getByTestId('diagnostics-benchmark-start').click()
  await expect(page.getByTestId('diagnostics-panel')).toHaveAttribute('data-runner-status', /warming|measuring|switching/)
  for (const id of ['diagnostics-start', 'diagnostics-stop', 'diagnostics-fps', 'diagnostics-mode', 'diagnostics-benchmark-scenario', 'diagnostics-benchmark-scope', 'diagnostics-benchmark-start']) await expect(page.getByTestId(id)).toBeDisabled()
  await expect(page.getByTestId('diagnostics-benchmark-cancel')).toBeEnabled()
  await page.getByTestId('diagnostics-benchmark-cancel').click()
  await expect(page.getByTestId('diagnostics-panel')).toHaveAttribute('data-runner-status', 'cancelled')
  await expect(page.getByTestId('diagnostics-runner-status')).toContainText('Cancelled')
  expect((await report(page)).recording).toBe(false)
  await expect(page.getByTestId('diagnostics-benchmark-start')).toBeEnabled()
  await page.getByTestId('diagnostics-benchmark-start').click()
  await expect(page.getByTestId('diagnostics-panel')).toHaveAttribute('data-runner-status', /warming|measuring|switching/)
  await page.getByRole('button', { name: 'Close diagnostics', exact: true }).click()
  await expect(page.getByTestId('diagnostics-panel')).toHaveCount(0)
  await open(page)
  await expect(page.getByTestId('diagnostics-panel')).toHaveAttribute('data-runner-status', 'cancelled')
  expect((await report(page)).recording).toBe(false)
})

test('camera benchmark completes three measured runs from the panel and restores stopped settings', async ({ page }) => {
  test.setTimeout(100000)
  await visit(page)
  await open(page)
  await page.getByTestId('diagnostics-benchmark-start').click()
  await expect(page.getByTestId('diagnostics-panel')).toHaveAttribute('data-runner-status', 'completed', { timeout: 85000 })
  const results = await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.results())
  expect(results).toHaveLength(3)
  for (const result of results) {
    expect(result.validation).toEqual({ valid: true, reasons: [] })
    expect(result.elapsedMs).toBeGreaterThanOrEqual(14900)
    expect(result.context.fpsLimit).toBe(30)
    expect(result.context.seed).toBe(424242)
    expect(result.observedContext.effects).toBe('rain')
    expect(result.recording).toBe(false)
  }
  expect(new Set(results.map(result => result.runId)).size).toBe(3)
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-diagnostics', 'panel')
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-zoom', '1.000')
  expect((await report(page)).recording).toBe(false)
  await expect(page.getByTestId('diagnostics-results')).toBeVisible()
})

test('pointer benchmark reaches the real handlers without dismissing its panel and retains cancelled input provenance', async ({ page }) => {
  await visit(page)
  await open(page)
  await page.getByTestId('diagnostics-benchmark-scenario').click()
  await page.getByRole('option', { name: 'Pointer and wheel input', exact: true }).click()
  await page.getByTestId('diagnostics-benchmark-start').click()
  await expect(page.getByTestId('diagnostics-panel')).toHaveAttribute('data-runner-status', 'measuring')
  await expect.poll(() => page.evaluate(() => (window as Runtime).__gardenDiagnostics!.getInteractionInfo().pointerMoves)).toBeGreaterThan(4)
  await expect.poll(() => page.evaluate(() => (window as Runtime).__gardenDiagnostics!.getInteractionInfo().wheels)).toBeGreaterThan(0)
  await expect(page.getByTestId('diagnostics-panel')).toBeVisible()
  await page.getByTestId('diagnostics-benchmark-cancel').click()
  await expect(page.getByTestId('diagnostics-panel')).toHaveAttribute('data-runner-status', 'cancelled')
  const results = await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.results())
  expect(results).toHaveLength(1)
  expect(results[0]!.validation).toEqual({ valid: false, reasons: ['cancelled'], inputKind: 'synthetic-events' })
  expect(results[0]!.counts.manualRenders).toBeGreaterThan(0)
  expect(results[0]!.recording).toBe(false)
})

test('trusted pointer input follows a wall-clock window without catching up missed driver events', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await visit(page)
  await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.setMode('collect'))
  const box = (await page.locator('.canvas-wrapper').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(3000)
  await page.evaluate(() => (window as Runtime).__gardenDiagnostics!.beginRun('trusted-input-acceptance'))
  await pointerWheelMeasurement(page, box)
  const { result, interactions } = await page.evaluate(() => {
    const api = (window as Runtime).__gardenDiagnostics!
    return { result: api.endRun('completed')!, interactions: api.getInteractionInfo() }
  })
  const validity = validateGardenBenchmarkRun(result, { kind: 'steady', scenario: 'pointer-wheel', garden: 'lake', seed: 424242, fpsLimit: 30, effects: true, durationMs: 15000, interactions, inputKind: 'trusted-playwright', errors })
  expect(validity).toEqual({ valid: true, reasons: [], inputKind: 'trusted-playwright' })
  expect(interactions.wheels).toBe(8)
  expect(interactions.pointerMoves).toBeGreaterThan(4)
})

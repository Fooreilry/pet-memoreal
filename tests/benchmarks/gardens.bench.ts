import { test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { cpus, platform, release, totalmem, arch } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GardenDiagnosticsReport, GardenDiagnosticsSnapshot } from '../../app/utils/gardenDiagnostics'
import { gardenBenchmarkProtocol, gardenBenchmarkScenarios, pointerAt, validateGardenBenchmarkRun } from '../../app/utils/gardenBenchmarkProtocol'
import type { GardenBenchmarkExpected, GardenBenchmarkValidity } from '../../app/utils/gardenBenchmarkProtocol'
import { pointerWheelMeasurement } from './pointerInput'
import type { GardenId } from '../../shared/gardens'
import { localeCookieName } from '../../shared/locale'

type BenchmarkApi = {
  snapshot: () => GardenDiagnosticsSnapshot
  report: () => GardenDiagnosticsReport
  beginRun: (scenario: string) => string
  endRun: (reason?: string) => GardenDiagnosticsReport | undefined
  startCameraMotion: (durationMs: number) => void
  stopCameraMotion: () => void
  getMotionInfo: () => { samples: number, changes: number }
  getInteractionInfo: () => { pointerMoves: number, wheels: number }
  setMode: (mode: 'panel' | 'collect') => void
  setFpsLimit: (limit: 30 | 60) => void
  setSeed: (seed: number) => void
  setEffects: (enabled: boolean) => void
  setPaused: (paused: boolean) => void
  camera: (camera: Camera) => void
  navigateGarden: (garden: GardenId) => Promise<void>
  ready: () => boolean
}
type DiagnosticWindow = Window & { __gardenDiagnostics?: BenchmarkApi }
type BenchmarkShell = HTMLElement & {
  __vue_app__?: { config: { globalProperties: {
    $router?: { isReady: () => Promise<void>, push: (path: string) => Promise<unknown> }
    $nuxt?: { isHydrating: boolean }
  } } }
}
type Camera = { zoom: number, x: number, y: number }
type RunKind = 'first-open' | 'steady' | 'transitions'
type SavedRun = {
  file: string
  kind: RunKind
  scenario: string
  garden: string
  repeat: number
  report: GardenDiagnosticsReport
  validity: GardenBenchmarkValidity
  inputDispatch?: Awaited<ReturnType<typeof pointerWheelMeasurement>>
  baseline?: GardenDiagnosticsSnapshot
  transitionSamples?: { cycle: number, garden: GardenId, snapshot: GardenDiagnosticsSnapshot }[]
}

const projectRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const baseURL = 'http://127.0.0.1:4175'
const gardens: GardenId[] = ['meadow', 'lake', 'grove', 'hill']
const { seed, warmupMs, repeats } = gardenBenchmarkProtocol
const measurementMs = gardenBenchmarkProtocol.durationMs
const fpsLimit = (Number(process.env.GARDEN_BENCH_FPS ?? 30)) as 30 | 60
const benchmarkRunId = `${new Date().toISOString().replace(/[:.]/g, '-')}-fps${fpsLimit}-${randomUUID().slice(0, 8)}`
// Keep comparison data outside Playwright's disposable test-results directory.
const outputDirectory = join(projectRoot, 'dev', 'benchmarks', 'results', benchmarkRunId)
const metricNames = ['tickIntervals', 'updateCpu', 'renderCpu', 'allRenderCpu', 'generationMs', 'preparationMs', 'apiWaitMs', 'totalReadyMs'] as const
const scenarios = gardenBenchmarkScenarios.filter(scenario => scenario.id !== 'switching')

async function environment(browser: Browser) {
  const packageJson = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
  const versions: Record<string, string> = {}
  for (const name of ['nuxt', 'vue', 'pixi.js', '@playwright/test']) {
    versions[name] = JSON.parse(await readFile(join(projectRoot, 'node_modules', name, 'package.json'), 'utf8')).version
  }
  let commit: string | null = null, dirty: boolean | null = null
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    dirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch { /* A downloaded source archive may have no Git metadata. */ }
  const lockfile = await readFile(join(projectRoot, 'pnpm-lock.yaml'))
  return {
    capturedAt: new Date().toISOString(), node: process.version, packageManager: packageJson.packageManager,
    versions, lockfileSha256: createHash('sha256').update(lockfile).digest('hex'),
    source: { commit, dirty },
    system: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? null, logicalCpus: cpus().length, totalMemoryBytes: totalmem() },
    browser: { version: browser.version(), headless: true, viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' },
    settings: { fpsLimit, seed, warmupMs, measurementMs, repeats, transitionCycles: 10, api: 'anonymous deterministic mocks', diagnosticsMode: 'collect' }
  }
}

async function openContext(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1,
    reducedMotion: 'no-preference', locale: 'en-US', colorScheme: 'light', serviceWorkers: 'block'
  })
  await context.addCookies([
    { name: 'petmemoreal_garden_session', value: String(seed), url: baseURL },
    { name: localeCookieName, value: 'en', url: baseURL }
  ])
  const unexpectedApi: string[] = []
  const errors: string[] = []
  await context.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    // Nuxt Icon serves installed Lucide SVG assets through this local route;
    // it is not a business/API fixture and must remain a real static response.
    if (path.startsWith('/api/_nuxt_icon/')) return route.continue()
    if (path === '/api/me') return route.fulfill({ status: 401, json: { statusCode: 401, statusMessage: 'Unauthorized' } })
    if (/^\/api\/gardens\/(meadow|lake|grove|hill)\/memorials$/.test(path)) return route.fulfill({ json: [] })
    if (path === '/api/auth/get-session') return route.fulfill({ json: null })
    unexpectedApi.push(`${route.request().method()} ${path}`)
    return route.fulfill({ status: 404, json: { statusMessage: 'Unexpected benchmark API request' } })
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  return { context, page, unexpectedApi, errors }
}

async function waitReady(page: Page, garden: GardenId) {
  await page.waitForFunction((id) => {
    const api = (window as DiagnosticWindow).__gardenDiagnostics
    const scene = document.querySelector('.canvas-wrapper')
    return api?.ready() && scene?.getAttribute('data-displayed-garden') === id
      && scene.getAttribute('data-requested-garden') === id && scene.getAttribute('data-transition') === 'idle'
  }, garden, { timeout: 60000 })
}

async function bootstrapGarden(page: Page, path: string) {
  // Server-internal auth requests cannot be intercepted by browser routing.
  // Enter the real client router from the public shell, where anonymous API
  // mocks apply. All Vue-container access stays in this test-only boundary.
  await page.goto(`${baseURL}/`)
  await page.waitForFunction(() => {
    const globals = (document.querySelector('#__nuxt') as BenchmarkShell | null)?.__vue_app__?.config.globalProperties
    return !!globals?.$router && globals.$nuxt?.isHydrating === false
  }, undefined, { timeout: 60000 })
  await page.evaluate(async (destination) => {
    const router = (document.querySelector('#__nuxt') as BenchmarkShell).__vue_app__!.config.globalProperties.$router!
    await router.isReady()
    await router.push(destination)
  }, path)
}

async function configure(page: Page, effects: boolean) {
  await page.evaluate(({ limit, fixedSeed, enabled }) => {
    const api = (window as DiagnosticWindow).__gardenDiagnostics!
    api.endRun('configuration')
    api.stopCameraMotion()
    api.setMode('collect')
    api.setFpsLimit(limit)
    api.setSeed(fixedSeed)
    api.setEffects(enabled)
    api.setPaused(false)
    api.camera({ zoom: 1, x: 0, y: 0 })
  }, { limit: fpsLimit, fixedSeed: seed, enabled: effects })
}

async function browserEnvironment(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const gl = canvas?.getContext('webgl2')
    const debug = gl?.getExtension('WEBGL_debug_renderer_info')
    return {
      userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGiB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      renderer: gl && debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null,
      vendor: gl && debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : null,
      webglVersion: gl ? String(gl.getParameter(gl.VERSION)) : null,
      visibilityState: document.visibilityState, devicePixelRatio: window.devicePixelRatio
    }
  })
}

async function finishMeasuredRun(page: Page) {
  return page.evaluate(() => {
    const api = (window as DiagnosticWindow).__gardenDiagnostics!
    const movement = api.getMotionInfo()
    const interactions = api.getInteractionInfo()
    api.stopCameraMotion()
    return { movement, interactions, report: api.endRun('completed') ?? api.report() }
  })
}

function describe(values: (number | null)[]) {
  const sorted = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b)
  return { count: sorted.length, min: sorted[0] ?? null, max: sorted.at(-1) ?? null, mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null, p50: sorted.length ? sorted[Math.ceil(sorted.length * .5) - 1]! : null }
}

function groupMetrics(allRuns: SavedRun[]) {
  const runs = allRuns.filter(run => run.validity.valid)
  return {
    runs: runs.length,
    invalidRuns: allRuns.filter(run => !run.validity.valid).map(run => ({ file: run.file, reasons: run.validity.reasons })),
    rates: { ticksPerSecond: describe(runs.map(run => run.report.rates.ticksPerSecond)), rendersPerSecond: describe(runs.map(run => run.report.rates.rendersPerSecond)) },
    metrics: Object.fromEntries(metricNames.map((metric) => {
      const samples = runs.flatMap(run => run.report.raw[metric]).sort((a, b) => a - b)
      const total = runs.reduce((sum, run) => sum + run.report[metric].total, 0)
      const mean = total ? runs.reduce((sum, run) => sum + (run.report[metric].mean ?? 0) * run.report[metric].total, 0) / total : null
      const minimums = runs.map(run => run.report[metric].min).filter((value): value is number => value !== null)
      const maximums = runs.map(run => run.report[metric].max).filter((value): value is number => value !== null)
      const percentile = (fraction: number) => samples.length ? samples[Math.ceil(samples.length * fraction) - 1]! : null
      return [metric, { total, retained: samples.length, mean, min: minimums.length ? Math.min(...minimums) : null, max: maximums.length ? Math.max(...maximums) : null, pooledRetainedP50: percentile(.5), pooledRetainedP95: percentile(.95), pooledRetainedP99: percentile(.99) }]
    })),
    counts: Object.fromEntries(['ticks', 'renders', 'activeRenders', 'automaticRenders', 'manualRenders', 'generations', 'ready'].map(key => [key, runs.reduce((sum, run) => sum + run.report.counts[key as keyof GardenDiagnosticsReport['counts']], 0)])),
    // The collector exposes run-local rebuilds; no previous run is subtracted.
    rebuilds: describe(runs.map(run => run.report.context.rebuilds)),
    resources: Object.fromEntries(['containers', 'graphics', 'texts', 'cacheNodes', 'renderTextures', 'atmospherePasses', 'totalNodes'].map(key => [key, describe(runs.map(run => run.report.resources[key as keyof GardenDiagnosticsReport['resources']]))])),
    files: runs.map(run => run.file)
  }
}

test('reproducible garden benchmark: first entries, repeated steady scenes and forty garden transitions', async ({ browser }, testInfo) => {
  if (fpsLimit !== 30 && fpsLimit !== 60) throw new Error('GARDEN_BENCH_FPS must be 30 or 60')
  await mkdir(outputDirectory, { recursive: true })
  const executionEnvironment = await environment(browser)
  let graphicsEnvironment: Awaited<ReturnType<typeof browserEnvironment>> | undefined
  const runs: SavedRun[] = []
  let currentContext: BrowserContext | undefined
  let completed = false
  const save = async (run: Omit<SavedRun, 'file' | 'validity'>, expected: GardenBenchmarkExpected) => {
    const validity = validateGardenBenchmarkRun(run.report, expected)
    const file = `${String(runs.length + 1).padStart(2, '0')}-${run.scenario.replace(/[^a-zA-Z0-9_-]/g, '-')}-${run.report.runId}.json`
    await writeFile(join(outputDirectory, file), JSON.stringify({ benchmarkSchemaVersion: 2, benchmarkRunId, environment: executionEnvironment, graphicsEnvironment, protocol: gardenBenchmarkProtocol, settings: { kind: run.kind, garden: run.garden, repeat: run.repeat, scenario: run.scenario }, expected, validity, inputDispatch: run.inputDispatch, baseline: run.baseline, transitionSamples: run.transitionSamples, diagnostics: run.report }, null, 2))
    runs.push({ ...run, file, validity })
    console.info(`[garden benchmark] ${runs.length}: ${run.scenario} -> ${file}`)
    if (!validity.valid) throw new Error(`Invalid benchmark run ${file}: ${validity.reasons.join(', ')}`)
  }
  try {
    for (const garden of gardens) {
      const { context, page, unexpectedApi, errors } = await openContext(browser)
      currentContext = context
      // The collector starts before the first Pixi renderer is initialized on
      // client entry. Shell SSR/network time is outside this initial run.
      await bootstrapGarden(page, `/gardens?garden=${garden}&diagnosticsScenario=opening-${garden}&diagnosticsFps=${fpsLimit}&diagnosticsMode=collect&diagnosticsAutoStart=1`)
      await waitReady(page, garden)
      // Readiness itself is already timed by the collector. Wait for the first
      // tick interval so condition validation can distinguish an inactive run.
      try {
        await page.waitForFunction(() => (window as DiagnosticWindow).__gardenDiagnostics!.snapshot().tickIntervals.total > 0, undefined, { timeout: 5000 })
      } catch { errors.push('No active tick interval was observed after first readiness') }
      const { report } = await finishMeasuredRun(page)
      graphicsEnvironment ??= await browserEnvironment(page)
      await save({ kind: 'first-open', scenario: `opening-${garden}`, garden, repeat: 1, report }, { kind: 'first-open', scenario: 'opening', garden, seed, fpsLimit, effects: true, errors: [...errors, ...unexpectedApi] })
      await context.close()
      currentContext = undefined
    }

    const { context, page, unexpectedApi, errors } = await openContext(browser)
    currentContext = context
    await bootstrapGarden(page, `/gardens?garden=meadow&diagnosticsFps=${fpsLimit}&diagnosticsMode=collect`)
    await waitReady(page, 'meadow')
    for (const garden of gardens) {
      await page.evaluate(id => (window as DiagnosticWindow).__gardenDiagnostics!.navigateGarden(id), garden)
      await waitReady(page, garden)
      for (const scenario of scenarios) {
        for (let repeat = 1; repeat <= repeats; repeat++) {
          await configure(page, scenario.effects)
          await waitReady(page, garden)
          await page.waitForTimeout(warmupMs)
          const name = `${garden}-${scenario.id}-${repeat}`
          const viewport = scenario.id === 'pointer-wheel' ? (await page.locator('.canvas-wrapper').boundingBox())! : undefined
          if (viewport) {
            const point = pointerAt(0, measurementMs)
            await page.mouse.move(viewport.x + point.x * viewport.width, viewport.y + point.y * viewport.height)
          }
          const baseline = await page.evaluate(({ label, cameraMotion, duration }) => {
            const api = (window as DiagnosticWindow).__gardenDiagnostics!
            api.beginRun(label)
            const baseline = api.snapshot()
            if (cameraMotion) api.startCameraMotion(duration)
            return baseline
          }, { label: name, cameraMotion: scenario.id === 'camera', duration: measurementMs })
          // Static and API-camera windows have no driver reads. The separate
          // input scenario intentionally includes trusted Playwright gestures.
          const inputDispatch = viewport ? await pointerWheelMeasurement(page, viewport) : undefined
          if (!viewport) await page.waitForTimeout(measurementMs)
          const { report, movement, interactions } = await finishMeasuredRun(page)
          await save({ kind: 'steady', scenario: name, garden, repeat, report, baseline, ...(inputDispatch ? { inputDispatch } : {}) }, { kind: 'steady', scenario: scenario.id, garden, seed, fpsLimit, effects: scenario.effects, durationMs: measurementMs, ...(scenario.id === 'camera' ? { movement } : {}), ...(scenario.id === 'pointer-wheel' ? { interactions, inputKind: 'trusted-playwright' as const } : {}), errors: [...errors, ...unexpectedApi] })
        }
      }
    }

    await page.evaluate(() => (window as DiagnosticWindow).__gardenDiagnostics!.navigateGarden('hill'))
    await waitReady(page, 'hill')
    await configure(page, true)
    await waitReady(page, 'hill')
    await page.waitForTimeout(warmupMs)
    const baseline = await page.evaluate(() => {
      const api = (window as DiagnosticWindow).__gardenDiagnostics!
      api.beginRun('garden-transitions-10-cycles')
      return api.snapshot()
    })
    const transitionSamples: NonNullable<SavedRun['transitionSamples']> = []
    for (let cycle = 1; cycle <= 10; cycle++) {
      for (const garden of gardens) {
        await page.evaluate(id => (window as DiagnosticWindow).__gardenDiagnostics!.navigateGarden(id), garden)
        await waitReady(page, garden)
        const snapshot = await page.evaluate(() => (window as DiagnosticWindow).__gardenDiagnostics!.snapshot())
        transitionSamples.push({ cycle, garden, snapshot })
      }
      console.info(`[garden benchmark] transition cycle ${cycle}/10 complete`)
    }
    const { report } = await finishMeasuredRun(page)
    await save({ kind: 'transitions', scenario: 'garden-transitions-10-cycles', garden: 'all', repeat: 1, report, baseline, transitionSamples }, { kind: 'transitions', scenario: 'switching', garden: 'hill', seed, fpsLimit, effects: true, expectedReadyCount: 40, expectedGenerationCount: 40, errors: [...errors, ...unexpectedApi] })
    completed = true
  } finally {
    await currentContext?.close()
    const steadyGroups = Object.fromEntries(gardens.flatMap(garden => scenarios.map(scenario => [`${garden}/${scenario.id}`, groupMetrics(runs.filter(run => run.kind === 'steady' && run.garden === garden && run.scenario.startsWith(`${garden}-${scenario.id}-`)))])))
    const transitions = runs.find(run => run.kind === 'transitions')
    const resourceHistory = Object.fromEntries(gardens.map(garden => [garden, transitions?.validity.valid ? transitions.transitionSamples?.filter(sample => sample.garden === garden).map(sample => ({ cycle: sample.cycle, rebuilds: sample.snapshot.context.rebuilds, resources: sample.snapshot.resources, rendererWidth: sample.snapshot.context.rendererWidth, rendererHeight: sample.snapshot.context.rendererHeight })) ?? [] : []]))
    const valid = runs.filter(run => run.validity.valid)
    const summary = {
      benchmarkSchemaVersion: 2, benchmarkRunId, completed,
      environment: executionEnvironment, graphicsEnvironment, protocol: gardenBenchmarkProtocol,
      measurementProtocol: {
        warmupExcludedFromSteady: true, warmupMs, steadyMeasurementMs: measurementMs,
        api: 'mocked deterministic responses',
        steadyPreparation: 'completed before beginRun; readiness/API/generation metrics contain no preparation samples',
        camera: 'continuous cameraAt trajectory driven by the existing Pixi ticker; no extra RAF or timer',
        pointerWheel: 'trusted Playwright input follows shared pointerAt by actual wall clock at up to 30Hz; missed move slots are skipped; eight wheel deadlines; only an in-flight command may overshoot the 15s window',
        firstOpen: 'first client entry from the hydrated public shell in a fresh context; includes first renderer initialization, mock API wait, generation, preparation and ready paint; excludes shell SSR/network time',
        transitions: 'includes forty complete preparation/readiness cycles'
      },
      expected: { firstOpen: 4, steady: 48, transitions: 40, reports: 53 },
      actual: {
        firstOpen: valid.filter(run => run.kind === 'first-open').length,
        steady: valid.filter(run => run.kind === 'steady').length,
        transitions: transitions?.validity.valid ? transitions.transitionSamples?.length ?? 0 : 0,
        savedReports: runs.length, invalidReports: runs.length - valid.length
      },
      invalidRuns: runs.filter(run => !run.validity.valid).map(run => ({ file: run.file, reasons: run.validity.reasons })),
      firstOpen: groupMetrics(runs.filter(run => run.kind === 'first-open')), steadyGroups,
      firstOpenByGarden: Object.fromEntries(gardens.map(garden => [garden, groupMetrics(runs.filter(run => run.kind === 'first-open' && run.garden === garden))])),
      transitions: transitions ? { ...groupMetrics([transitions]), resourceHistory } : null,
      limitations: [
        'CPU timings measure JavaScript/renderer submission, not GPU completion.',
        'Pooled percentiles use bounded retained samples; weighted means use complete run totals.',
        'Only valid runs contribute to aggregated performance metrics. Failed condition checks are not achieved FPS thresholds.',
        'The browser runner uses synthetic pointer events; this external input scenario uses trusted Playwright input and labels that provenance.',
        'Headless Chromium results describe the recorded machine and graphics backend; no universal performance threshold is applied.'
      ]
    }
    await writeFile(join(outputDirectory, 'summary.json'), JSON.stringify(summary, null, 2))
    console.info(`[garden benchmark] ${completed ? 'complete' : 'partial'} summary: ${join(outputDirectory, 'summary.json')}`)
    testInfo.annotations.push({ type: 'benchmark-report', description: join(outputDirectory, 'summary.json') })
  }
})

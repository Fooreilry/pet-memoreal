export type GardenDiagnosticResources = {
  containers: number
  graphics: number
  texts: number
  cacheNodes: number
  renderTextures: number
  atmospherePasses: number
  totalNodes: number
}

export type GardenDiagnosticContext = {
  garden: string
  seed: number
  zoom: number
  dpr: number
  renderResolution: number
  rendererWidth: number
  rendererHeight: number
  viewport: { width: number, height: number }
  fpsLimit: 30 | 60
  effects: string
  animation: string
  memorialCount: number
  chunks: { visible: number, total: number }
  rebuilds: number
  resources: GardenDiagnosticResources
  browser: string
  panelVisible?: boolean
}

export type GardenDiagnosticMode = 'panel' | 'collect'
export type GardenDiagnosticRenderPath = 'automatic' | 'manual'
export type GardenDiagnosticReady = { kind: string, generationMs: number, preparationMs: number, apiWaitMs: number, totalMs: number }
export type GardenDiagnosticConfiguration = {
  panelVisible?: boolean
  mode: GardenDiagnosticMode
  fpsLimit: 30 | 60
  seed: number
  effects: string
  dpr: number
  viewport: { width: number, height: number }
  renderResolution: number
}
export type GardenDiagnosticRates = {
  current: { ticksPerSecond: number | null, rendersPerSecond: number | null, windowMs: number }
  average: { ticksPerSecond: number | null, rendersPerSecond: number | null }
  /** Compatibility aliases for the complete run's average active rates. */
  ticksPerSecond: number | null
  rendersPerSecond: number | null
}
export type GardenDiagnosticMetric = {
  unit: 'ms'
  total: number
  retained: number
  mean: number | null
  min: number | null
  max: number | null
  p50: number | null
  p95: number | null
  p99: number | null
}

type GenerationSample = { kind: string, ms: number, atMs: number }
type ReadySample = GardenDiagnosticReady & { atMs: number }
type RenderSample = { cpuMs: number, active: boolean, path: GardenDiagnosticRenderPath, atMs: number }
type MetricName = 'tickIntervals' | 'updateCpu' | 'renderCpu' | 'allRenderCpu' | 'generationMs' | 'preparationMs' | 'apiWaitMs' | 'totalReadyMs'
type Counts = {
  ticks: number
  renders: number
  activeRenders: number
  automaticRenders: number
  manualRenders: number
  activeAutomaticRenders: number
  activeManualRenders: number
  generations: number
  ready: number
}

export type GardenDiagnosticsSnapshot = Record<MetricName, GardenDiagnosticMetric> & {
  schemaVersion: 2
  runId: string
  scenario: string
  mode: GardenDiagnosticMode
  buildId: string
  startedAt: string
  capturedAt: string
  elapsedMs: number
  activeMs: number
  active: boolean
  recording: boolean
  status: 'idle' | 'recording' | 'completed'
  endedAt?: string
  endReason?: string
  configuration?: GardenDiagnosticConfiguration
  disposed: boolean
  context: GardenDiagnosticContext
  resources: GardenDiagnosticResources
  rates: GardenDiagnosticRates
  counts: Counts
}

export type GardenDiagnosticsReport = GardenDiagnosticsSnapshot & {
  observedContext: GardenDiagnosticContext
  validation?: { valid: boolean, reasons: string[], inputKind?: 'trusted-playwright' | 'synthetic-events' }
  capacity: number
  retained: { generations: number, ready: number, renders: number }
  measurements: { cpu: string, rates: string, percentiles: string }
  raw: Record<MetricName, number[]> & { generations: GenerationSample[], ready: ReadySample[], renders: RenderSample[] }
}

export type GardenDiagnosticsOptions = {
  now: () => number
  getContext: () => GardenDiagnosticContext
  buildId?: string
  capacity?: number
}

const metricNames: MetricName[] = ['tickIntervals', 'updateCpu', 'renderCpu', 'allRenderCpu', 'generationMs', 'preparationMs', 'apiWaitMs', 'totalReadyMs']
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback
const positive = (value: number) => Math.max(0, finite(value))
const count = (value: number) => Math.floor(positive(value))
const label = (value: string, max: number) => typeof value === 'string' ? value.slice(0, max) : ''
let collectorSequence = 0

function ring<T>(capacity: number) {
  const values: T[] = []
  let cursor = 0
  return {
    push(value: T) {
      if (values.length < capacity) values.push(value)
      else { values[cursor] = value; cursor = (cursor + 1) % capacity }
    },
    values: () => cursor ? [...values.slice(cursor), ...values.slice(0, cursor)] : [...values],
    clear() { values.length = 0; cursor = 0 }
  }
}

function metric(capacity: number) {
  const samples = ring<number>(capacity)
  let total = 0, sum = 0, min = Infinity, max = -Infinity
  return {
    push(ms: number) {
      if (!Number.isFinite(ms) || ms < 0) return
      samples.push(ms)
      total++
      sum += ms
      min = Math.min(min, ms)
      max = Math.max(max, ms)
    },
    clear() { samples.clear(); total = 0; sum = 0; min = Infinity; max = -Infinity },
    values: samples.values,
    snapshot(): GardenDiagnosticMetric {
      const sorted = samples.values().sort((a, b) => a - b)
      // Nearest rank over retained samples; min/max/mean and total cover the run.
      const percentile = (p: number) => sorted.length ? sorted[Math.ceil(sorted.length * p) - 1]! : null
      return { unit: 'ms', total, retained: sorted.length, mean: total ? sum / total : null, min: total ? min : null, max: total ? max : null, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99) }
    }
  }
}

function rateWindow(capacity: number) {
  const values: (number | undefined)[] = []
  let head = 0, size = 0
  function expire(cutoff: number) {
    while (size && values[head]! <= cutoff) {
      values[head] = undefined
      head = (head + 1) % capacity
      size--
    }
  }
  return {
    push(time: number, cutoff: number) {
      expire(cutoff)
      if (size === capacity) { head = (head + 1) % capacity; size-- }
      values[(head + size) % capacity] = time
      size++
    },
    count(cutoff: number, time: number) {
      expire(cutoff)
      let result = 0
      for (let index = 0; index < size; index++) if (values[(head + index) % capacity]! <= time) result++
      return result
    },
    clear() { values.length = 0; head = 0; size = 0 }
  }
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function resourceCounts(source?: GardenDiagnosticResources): GardenDiagnosticResources {
  return {
    containers: count(source?.containers ?? 0), graphics: count(source?.graphics ?? 0), texts: count(source?.texts ?? 0),
    cacheNodes: count(source?.cacheNodes ?? 0), renderTextures: count(source?.renderTextures ?? 0), atmospherePasses: count(source?.atmospherePasses ?? 0), totalNodes: count(source?.totalNodes ?? 0)
  }
}

function contextFields(source: GardenDiagnosticContext): GardenDiagnosticContext {
  // Explicit fields prevent accidental export of memorial content, auth or URLs.
  return {
    garden: label(source.garden, 32), seed: finite(source.seed), zoom: positive(source.zoom), dpr: positive(source.dpr),
    renderResolution: positive(source.renderResolution), rendererWidth: count(source.rendererWidth), rendererHeight: count(source.rendererHeight),
    viewport: { width: count(source.viewport?.width), height: count(source.viewport?.height) }, fpsLimit: source.fpsLimit === 30 ? 30 : 60,
    effects: label(source.effects, 80), animation: label(source.animation, 80), memorialCount: count(source.memorialCount),
    chunks: { visible: count(source.chunks?.visible), total: count(source.chunks?.total) }, rebuilds: count(source.rebuilds),
    resources: resourceCounts(source.resources), browser: label(source.browser, 512), panelVisible: source.panelVisible === true
  }
}

const emptyCounts = (): Counts => ({ ticks: 0, renders: 0, activeRenders: 0, automaticRenders: 0, manualRenders: 0, activeAutomaticRenders: 0, activeManualRenders: 0, generations: 0, ready: 0 })

/** Passive CPU/animation diagnostics. The owner supplies lifecycle and its real performance clock. */
export function createGardenDiagnostics(options: GardenDiagnosticsOptions) {
  const capacity = Math.min(2048, Math.max(1, Math.floor(finite(options.capacity ?? 2048, 2048))))
  const metrics = Object.fromEntries(metricNames.map(name => [name, metric(capacity)])) as Record<MetricName, ReturnType<typeof metric>>
  const generations = ring<GenerationSample>(capacity), readySamples = ring<ReadySample>(capacity), renders = ring<RenderSample>(capacity)
  const tickRates = rateWindow(2048), renderRates = rateWindow(2048)
  const instanceId = `${Date.now().toString(36)}-${++collectorSequence}`
  let run = 0, runId = '', scenario = '', mode: GardenDiagnosticMode = 'panel'
  let active = false, recording = false, disposed = false, clock = 0, started = 0, activeStarted = 0, activeElapsed = 0
  let startedAt = '', counts = emptyCounts(), previousTick: number | undefined
  let latestResources: GardenDiagnosticResources | undefined
  let configuration: GardenDiagnosticConfiguration | undefined
  let completed: GardenDiagnosticsReport | undefined

  function now() {
    if (!disposed) clock = Math.max(clock, positive(options.now()))
    return clock
  }

  function beginRun(nextScenario: string) {
    if (disposed) return runId
    started = now()
    activeElapsed = 0
    activeStarted = started
    previousTick = undefined
    startedAt = new Date().toISOString()
    scenario = label(nextScenario, 120)
    runId = `garden-${instanceId}-${++run}`
    counts = emptyCounts()
    const context = contextFields(options.getContext())
    configuration = { mode, panelVisible: context.panelVisible, fpsLimit: context.fpsLimit, seed: context.seed, effects: context.effects, dpr: context.dpr, viewport: { ...context.viewport }, renderResolution: context.renderResolution }
    completed = undefined
    recording = true
    for (const name of metricNames) metrics[name].clear()
    generations.clear(); readySamples.clear(); renders.clear()
    tickRates.clear(); renderRates.clear()
    return runId
  }

  function setActive(enabled: boolean) {
    if (disposed || active === enabled) return
    const time = now()
    if (active && recording) activeElapsed += time - activeStarted
    active = enabled
    activeStarted = time
    previousTick = undefined
    tickRates.clear(); renderRates.clear()
  }

  function tick(start: number, cpuMs: number) {
    if (disposed || !recording || !active) return
    counts.ticks++
    metrics.updateCpu.push(cpuMs)
    if (!Number.isFinite(start) || start < 0 || (previousTick !== undefined && start <= previousTick)) return
    if (previousTick !== undefined) metrics.tickIntervals.push(start - previousTick)
    previousTick = start
    if (start >= activeStarted) tickRates.push(start, Math.max(activeStarted, start - 2000))
  }

  function render(cpuMs: number, isActive: boolean, path: GardenDiagnosticRenderPath) {
    if (disposed || !recording) return
    const time = now(), activeRender = active && isActive
    counts.renders++
    counts[path === 'manual' ? 'manualRenders' : 'automaticRenders']++
    metrics.allRenderCpu.push(cpuMs)
    if (activeRender) {
      counts.activeRenders++
      counts[path === 'manual' ? 'activeManualRenders' : 'activeAutomaticRenders']++
      metrics.renderCpu.push(cpuMs)
      renderRates.push(time, Math.max(activeStarted, time - 2000))
    }
    if (Number.isFinite(cpuMs) && cpuMs >= 0) renders.push({ cpuMs, active: activeRender, path, atMs: time - started })
  }

  function generation(kind: string, ms: number) {
    if (disposed || !recording || !Number.isFinite(ms) || ms < 0) return
    counts.generations++
    metrics.generationMs.push(ms)
    generations.push({ kind: label(kind, 40), ms, atMs: now() - started })
  }

  function ready(sample: GardenDiagnosticReady) {
    if (disposed || !recording) return
    counts.ready++
    // These wall durations can overlap. totalMs is measured by the owner, not summed.
    metrics.preparationMs.push(sample.preparationMs)
    metrics.apiWaitMs.push(sample.apiWaitMs)
    metrics.totalReadyMs.push(sample.totalMs)
    readySamples.push({ kind: label(sample.kind, 40), generationMs: positive(sample.generationMs), preparationMs: positive(sample.preparationMs), apiWaitMs: positive(sample.apiWaitMs), totalMs: positive(sample.totalMs), atMs: now() - started })
  }

  function snapshot(): GardenDiagnosticsSnapshot {
    if (completed) {
      const { raw: _raw, capacity: _capacity, measurements: _measurements, retained: _retained, validation: _validation, observedContext: _observedContext, ...result } = completed
      return copy(result)
    }
    const time = now(), activeMs = activeElapsed + (recording && active ? time - activeStarted : 0)
    const context = contextFields(options.getContext())
    const resources = latestResources ? { ...latestResources } : { ...context.resources }
    context.resources = { ...resources }
    const average = { ticksPerSecond: activeMs > 0 ? counts.ticks * 1000 / activeMs : null, rendersPerSecond: activeMs > 0 ? counts.activeRenders * 1000 / activeMs : null }
    const windowMs = recording && active ? Math.min(2000, Math.max(0, time - activeStarted)) : 0
    const cutoff = time - windowMs
    const current = {
      ticksPerSecond: windowMs > 0 ? tickRates.count(cutoff, time) * 1000 / windowMs : null,
      rendersPerSecond: windowMs > 0 ? renderRates.count(cutoff, time) * 1000 / windowMs : null,
      windowMs
    }
    return {
      ...Object.fromEntries(metricNames.map(name => [name, metrics[name].snapshot()])) as Record<MetricName, GardenDiagnosticMetric>,
      schemaVersion: 2, runId, scenario, mode: configuration?.mode ?? mode, buildId: label(options.buildId ?? '', 120), startedAt, capturedAt: new Date().toISOString(),
      elapsedMs: run ? time - started : 0, activeMs, active: recording && active, recording, status: recording ? 'recording' : 'idle',
      configuration: configuration ? copy(configuration) : undefined, disposed, context, resources,
      rates: { current, average, ...average },
      counts: { ...counts }
    }
  }

  function report(): GardenDiagnosticsReport {
    if (completed) return copy(completed)
    const current = snapshot()
    const observedContext = copy(current.context)
    if (configuration) {
      // Operational snapshots describe the current scene. Exported runs retain
      // their measured settings even if an external reactive ref changed first.
      const { fpsLimit, seed, dpr, viewport, renderResolution } = configuration
      // Theme names follow the displayed garden during an intentional opening
      // or switching run. The initial theme remains in configuration.
      Object.assign(current.context, { fpsLimit, seed, dpr, viewport: { ...viewport }, renderResolution })
    }
    const generationEvents = generations.values(), readyEvents = readySamples.values(), renderEvents = renders.values()
    return {
      ...current, observedContext, capacity,
      retained: { generations: generationEvents.length, ready: readyEvents.length, renders: renderEvents.length },
      measurements: { cpu: 'Synchronous JavaScript CPU durations; GPU time is not measured.', rates: 'Active animation ticks/renders per second; not display FPS. Current uses the latest contiguous active window up to 2000ms; average and compatibility aliases cover the complete run. Paused and hidden time is excluded.', percentiles: 'Nearest rank over each bounded retained sample window; totals, min, max and mean cover the complete run.' },
      raw: {
        ...Object.fromEntries(metricNames.map(name => [name, metrics[name].values()])) as Record<MetricName, number[]>,
        generations: generationEvents.map(sample => ({ ...sample })), ready: readyEvents.map(sample => ({ ...sample })), renders: renderEvents.map(sample => ({ ...sample }))
      }
    }
  }

  function endRun(reason = 'manual'): GardenDiagnosticsReport | undefined {
    if (!recording || disposed) return
    const result = report()
    result.recording = false
    result.active = false
    result.status = 'completed'
    result.endedAt = result.capturedAt
    result.endReason = label(reason, 120)
    recording = false
    previousTick = undefined
    completed = result
    return copy(result)
  }

  function dispose() {
    if (disposed) return
    const wasRecording = recording
    endRun('disposed')
    now()
    disposed = true
    if (wasRecording && completed) completed.disposed = true
  }

  return { get recording() { return recording }, tick, render, setActive, generation, ready, resources: (value: GardenDiagnosticResources) => { if (!disposed) latestResources = resourceCounts(value) }, beginRun, endRun, snapshot, report, setMode: (value: GardenDiagnosticMode) => { if (!disposed) mode = value }, dispose }
}

export type GardenDiagnostics = ReturnType<typeof createGardenDiagnostics>
export type GardenDiagnosticSnapshot = GardenDiagnosticsSnapshot

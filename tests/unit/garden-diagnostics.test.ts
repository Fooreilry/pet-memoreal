import assert from 'node:assert/strict'
import test from 'node:test'
import { createGardenDiagnostics } from '../../app/utils/gardenDiagnostics'
import type { GardenDiagnosticContext, GardenDiagnosticResources } from '../../app/utils/gardenDiagnostics'

const resources: GardenDiagnosticResources = { containers: 12, graphics: 24, texts: 4, cacheNodes: 6, renderTextures: 1, atmospherePasses: 1, totalNodes: 40 }
const context = (): GardenDiagnosticContext => ({
  garden: 'meadow', seed: 1234, zoom: 1.5, dpr: 2, renderResolution: 1.5, rendererWidth: 1440, rendererHeight: 900,
  viewport: { width: 1200, height: 800 }, fpsLimit: 60, effects: 'sun', animation: 'active', memorialCount: 12,
  chunks: { visible: 3, total: 12 }, rebuilds: 2, resources: { ...resources }, browser: 'test-browser'
})

function fixture(capacity?: number) {
  let now = 0
  const metadata = context()
  const collector = createGardenDiagnostics({ now: () => now, getContext: () => metadata, capacity, buildId: 'unit-build' })
  return { collector, metadata, time: (ms: number) => { now = ms } }
}

test('active animation rates exclude pauses and hidden time without bridging tick intervals', () => {
  const { collector, time } = fixture()
  collector.beginRun('active-clock')
  assert.equal(collector.snapshot().rates.ticksPerSecond, null)
  time(100)
  collector.setActive(true)
  collector.tick(100, 2)
  collector.render(3, true, 'automatic')
  time(200)
  collector.tick(200, 4)
  collector.render(5, true, 'automatic')
  time(300)
  collector.setActive(false)
  time(10000)
  collector.tick(10000, 100)
  collector.render(100, false, 'manual')
  collector.render(200, true, 'manual')
  const paused = collector.snapshot()
  assert.equal(paused.activeMs, 200)
  assert.equal(paused.elapsedMs, 10000)
  assert.equal(paused.rates.ticksPerSecond, 10)
  assert.equal(paused.rates.rendersPerSecond, 10)
  assert.equal(paused.renderCpu.p95, 5, 'paused manual work never pollutes active render CPU percentiles')
  assert.equal(paused.allRenderCpu.p95, 200)
  assert.equal(paused.counts.manualRenders, 2)
  assert.equal(paused.counts.activeManualRenders, 0)
  time(10100)
  collector.setActive(true)
  collector.tick(10100, 1)
  collector.render(2, true, 'manual')
  time(10200)
  collector.tick(10200, 3)
  time(10300)
  const resumed = collector.report()
  assert.equal(resumed.activeMs, 400)
  assert.equal(resumed.rates.ticksPerSecond, 10)
  assert.equal(resumed.rates.rendersPerSecond, 7.5)
  assert.deepEqual(resumed.raw.tickIntervals, [100, 100])
  assert.deepEqual(resumed.counts, { ticks: 4, renders: 5, activeRenders: 3, automaticRenders: 2, manualRenders: 3, activeAutomaticRenders: 2, activeManualRenders: 1, generations: 0, ready: 0 })
})

test('nearest-rank percentiles use bounded retained windows while aggregates cover the full run', () => {
  const { collector, time } = fixture(4)
  collector.beginRun('percentiles')
  collector.setActive(true)
  for (let value = 1; value <= 7; value++) {
    time(value * 10)
    collector.tick(value * 10, value)
    collector.render(value * 2, true, 'automatic')
    collector.generation('garden', value * 3)
    collector.ready({ kind: 'garden', generationMs: value * 3, preparationMs: value * 4, apiWaitMs: value * 5, totalMs: value * 6 })
  }
  const report = collector.report()
  assert.deepEqual(report.raw.updateCpu, [4, 5, 6, 7])
  assert.deepEqual(report.updateCpu, { unit: 'ms', total: 7, retained: 4, mean: 4, min: 1, max: 7, p50: 5, p95: 7, p99: 7 })
  assert.deepEqual(report.raw.tickIntervals, [10, 10, 10, 10])
  assert.equal(report.tickIntervals.total, 6)
  assert.equal(report.counts.generations, 7)
  assert.equal(report.counts.ready, 7)
  assert.equal(report.counts.renders, 7)
  assert.deepEqual(report.retained, { generations: 4, ready: 4, renders: 4 })
  assert.deepEqual(report.raw.generations.map(sample => sample.ms), [12, 15, 18, 21])
  assert.deepEqual(report.raw.ready.map(sample => sample.totalMs), [24, 30, 36, 42])
  assert.equal(report.totalReadyMs.p95, 42)
  assert.notEqual(report.raw.ready[0]!.totalMs, report.raw.ready[0]!.generationMs + report.raw.ready[0]!.preparationMs + report.raw.ready[0]!.apiWaitMs, 'overlapping phases must not be summed into ready duration')
  assert.equal(report.raw.renders.length, 4)
  assert.match(report.measurements.cpu, /GPU time is not measured/)
  assert.match(report.measurements.rates, /not display FPS/)
  assert.match(report.measurements.percentiles, /Nearest rank/)
})

test('sample capacity is clamped per metric and rings retain chronological order across wraps', () => {
  for (const capacity of [-3, 2, 10000]) {
    const { collector } = fixture(capacity)
    collector.beginRun('capacity')
    collector.setActive(true)
    const limit = Math.max(1, Math.min(2048, capacity))
    for (let value = 0; value < limit * 2 + 3; value++) {
      collector.tick(value * 16, value)
      collector.render(value, true, 'manual')
      collector.generation('memorial', value)
      collector.ready({ kind: 'memorial', generationMs: value, preparationMs: value, apiWaitMs: value, totalMs: value })
    }
    const report = collector.report()
    assert.equal(report.capacity, limit)
    for (const samples of Object.values(report.raw)) {
      assert.ok(samples.length <= limit)
      assert.ok(samples.length <= 2048)
    }
    assert.equal(report.raw.updateCpu[0], limit + 3)
    assert.equal(report.raw.updateCpu.at(-1), limit * 2 + 2)
    assert.equal(report.updateCpu.total, limit * 2 + 3)
  }
})

test('a new run resets buffers and active time while preserving mode, context and resource measurements', () => {
  const { collector, metadata, time } = fixture()
  collector.setMode('collect')
  collector.beginRun('initial-run')
  collector.setActive(true)
  collector.tick(0, 3)
  collector.generation('garden', 15)
  collector.render(10, true, 'manual')
  collector.ready({ kind: 'garden', generationMs: 15, preparationMs: 20, apiWaitMs: 50, totalMs: 55 })
  collector.resources({ ...resources, totalNodes: 100 })
  time(1000)
  const previous = collector.snapshot()
  const runId = collector.beginRun('garden-pan')
  assert.notEqual(runId, previous.runId)
  const fresh = collector.report()
  assert.equal(fresh.scenario, 'garden-pan')
  assert.equal(fresh.mode, 'collect')
  assert.equal(fresh.active, true)
  assert.equal(fresh.activeMs, 0)
  assert.equal(fresh.elapsedMs, 0)
  assert.equal(fresh.counts.ticks, 0)
  assert.equal(fresh.updateCpu.p50, null)
  assert.equal(fresh.generationMs.total, 0)
  assert.equal(fresh.resources.totalNodes, 100)
  assert.equal(fresh.context.garden, 'meadow')
  assert.ok(Object.values(fresh.raw).every(samples => samples.length === 0))
  metadata.garden = 'lake'
  metadata.zoom = 2
  time(1100)
  collector.tick(1100, 1)
  const current = collector.report()
  assert.equal(current.context.garden, 'lake')
  assert.equal(current.context.zoom, 2)
  assert.equal(current.activeMs, 100)
  assert.equal(current.tickIntervals.total, 0, 'the previous run cannot establish the new run interval')
})

test('reports explicitly select safe metadata and return detached JSON-serializable values', () => {
  const { collector, metadata } = fixture()
  collector.beginRun('privacy')
  Object.assign(metadata, { memorials: [{ name: 'private-pet-name', history: 'private-history' }], token: 'private-token', url: 'private-url' })
  Object.assign(metadata.resources, { secret: 'private-resource' })
  collector.setActive(true)
  collector.tick(1, 2)
  collector.generation('garden', 20)
  collector.render(3, true, 'manual')
  const report = collector.report()
  const json = JSON.stringify(report)
  assert.ok(!json.includes('private-'))
  assert.equal(JSON.parse(json).schemaVersion, 2)
  assert.equal(report.buildId, 'unit-build')
  assert.equal(report.context.browser, 'test-browser')
  assert.ok(Number.isFinite(Date.parse(report.startedAt)))
  assert.ok(Number.isFinite(Date.parse(report.capturedAt)))
  report.context.viewport.width = 1
  report.context.chunks.visible = 999
  report.context.resources.graphics = 999
  report.resources.totalNodes = 999
  report.raw.updateCpu[0] = 999
  report.raw.generations[0]!.ms = 999
  report.raw.renders[0]!.cpuMs = 999
  report.counts.ticks = 999
  const next = collector.report()
  assert.equal(next.context.viewport.width, 1200)
  assert.equal(next.context.chunks.visible, 3)
  assert.equal(next.context.resources.graphics, 24)
  assert.equal(next.resources.totalNodes, 40)
  assert.deepEqual(next.raw.updateCpu, [2])
  assert.equal(next.raw.generations[0]!.ms, 20)
  assert.equal(next.raw.renders[0]!.cpuMs, 3)
  assert.equal(next.counts.ticks, 1)
})

test('invalid samples and backward clocks do not contaminate metrics or extend active duration', () => {
  const { collector, metadata, time } = fixture()
  collector.beginRun('invalid-samples')
  collector.setActive(true)
  collector.tick(100, 1)
  collector.tick(90, Number.NaN)
  collector.tick(Infinity, -10)
  collector.tick(150, 2)
  collector.generation('garden', Infinity)
  collector.generation('garden', -1)
  collector.render(Number.NaN, true, 'automatic')
  time(200)
  const first = collector.report()
  assert.deepEqual(first.raw.tickIntervals, [50])
  assert.deepEqual(first.raw.updateCpu, [1, 2])
  assert.equal(first.generationMs.total, 0)
  assert.equal(first.renderCpu.total, 0)
  time(100)
  assert.equal(collector.snapshot().activeMs, 200)
  Object.assign(metadata, { seed: Number.NaN, dpr: Infinity, rendererWidth: -3, zoom: -1 })
  collector.resources({ ...resources, totalNodes: Infinity, graphics: -2 })
  const safe = collector.snapshot()
  assert.equal(safe.context.seed, 0)
  assert.equal(safe.context.dpr, 0)
  assert.equal(safe.context.rendererWidth, 0)
  assert.equal(safe.context.zoom, 0)
  assert.equal(safe.resources.totalNodes, 0)
  assert.equal(safe.resources.graphics, 0)
  assert.ok(!JSON.stringify(safe).includes('NaN'))
})

test('dispose freezes measurements and remains safe after repeated lifecycle calls without any scheduler', () => {
  const { collector, time } = fixture()
  collector.beginRun('dispose')
  collector.setActive(true)
  collector.tick(0, 2)
  time(500)
  collector.dispose()
  const disposed = collector.report()
  assert.equal(disposed.activeMs, 500)
  assert.equal(disposed.active, false)
  assert.equal(disposed.disposed, true)
  time(15000)
  collector.dispose()
  collector.setActive(true)
  collector.setMode('collect')
  collector.tick(15000, 500)
  collector.render(500, true, 'manual')
  collector.generation('garden', 500)
  collector.ready({ kind: 'garden', generationMs: 500, preparationMs: 500, apiWaitMs: 500, totalMs: 500 })
  assert.equal(collector.beginRun('ignored'), disposed.runId)
  const next = collector.report()
  assert.equal(next.activeMs, disposed.activeMs)
  assert.equal(next.elapsedMs, disposed.elapsedMs)
  assert.deepEqual(next.counts, disposed.counts)
  assert.deepEqual(next.raw, disposed.raw)
  assert.equal(next.mode, 'panel')
})

test('an idle collector never auto-starts and ignores measurements until an explicit run begins', () => {
  const { collector, time } = fixture()
  collector.setActive(true)
  time(1000)
  collector.tick(1000, 12)
  collector.render(15, true, 'automatic')
  collector.generation('garden', 100)
  collector.ready({ kind: 'garden', generationMs: 100, preparationMs: 200, apiWaitMs: 300, totalMs: 400 })
  const idle = collector.report()
  assert.equal(collector.recording, false)
  assert.equal(idle.recording, false)
  assert.equal(idle.status, 'idle')
  assert.equal(idle.runId, '')
  assert.equal(idle.elapsedMs, 0)
  assert.equal(idle.activeMs, 0)
  assert.equal(idle.configuration, undefined)
  assert.equal(idle.counts.renders, 0)
  assert.ok(Object.values(idle.raw).every(samples => samples.length === 0))
  assert.deepEqual(idle.rates.current, { ticksPerSecond: null, rendersPerSecond: null, windowMs: 0 })
  assert.equal(collector.endRun(), undefined)
  collector.beginRun('explicit-start')
  assert.equal(collector.recording, true)
  assert.equal(collector.snapshot().active, true, 'app activity remembered before recording starts')
  time(1100)
  collector.tick(1100, 2)
  collector.render(3, true, 'automatic')
  assert.equal(collector.snapshot().activeMs, 100)
  assert.equal(collector.snapshot().counts.ticks, 1)
})

test('ending a run freezes a detached report, including configuration, context, mode and stop-window rates', () => {
  const { collector, metadata, time } = fixture()
  collector.setMode('collect')
  collector.setActive(true)
  const runId = collector.beginRun('freeze')
  for (let frame = 1; frame <= 60; frame++) {
    time(frame * 1000 / 60)
    collector.tick(frame * 1000 / 60, 2)
    collector.render(3, true, 'automatic')
  }
  const ended = collector.endRun('settings-changed')!
  assert.equal(collector.recording, false)
  assert.equal(ended.recording, false)
  assert.equal(ended.status, 'completed')
  assert.equal(ended.endReason, 'settings-changed')
  assert.equal(ended.runId, runId)
  assert.ok(Number.isFinite(Date.parse(ended.endedAt!)))
  assert.equal(ended.active, false)
  assert.equal(ended.activeMs, 1000)
  assert.equal(ended.rates.current.ticksPerSecond, 60)
  assert.equal(ended.rates.current.rendersPerSecond, 60)
  const original = collector.report()
  metadata.seed = 9876
  metadata.fpsLimit = 30
  metadata.effects = 'rain'
  metadata.viewport.width = 500
  metadata.animation = 'paused'
  collector.setMode('panel')
  collector.setActive(false)
  collector.resources({ ...resources, totalNodes: 1 })
  time(5000)
  collector.tick(5000, 100)
  collector.render(100, false, 'manual')
  collector.generation('garden', 100)
  collector.ready({ kind: 'garden', generationMs: 100, preparationMs: 100, apiWaitMs: 100, totalMs: 100 })
  ended.raw.updateCpu[0] = 999
  ended.context.seed = 999
  ended.configuration!.viewport.width = 999
  assert.deepEqual(collector.report(), original)
  const frozenSnapshot = collector.snapshot()
  assert.equal(frozenSnapshot.mode, 'collect')
  assert.equal(frozenSnapshot.context.seed, 1234)
  assert.equal(frozenSnapshot.context.animation, 'active')
  assert.equal(frozenSnapshot.configuration!.fpsLimit, 60)
  assert.equal(frozenSnapshot.configuration!.viewport.width, 1200)
  frozenSnapshot.configuration!.viewport.width = 1
  assert.equal(collector.snapshot().configuration!.viewport.width, 1200)
  assert.equal(collector.endRun('duplicate-stop'), undefined)
  const nextId = collector.beginRun('new-settings')
  assert.notEqual(nextId, runId)
  const next = collector.report()
  assert.equal(next.mode, 'panel')
  assert.equal(next.configuration!.fpsLimit, 30)
  assert.equal(next.configuration!.seed, 9876)
  assert.equal(next.configuration!.effects, 'rain')
  assert.equal(next.configuration!.viewport.width, 500)
  assert.equal(next.active, false)
  assert.equal(next.counts.renders, 0)
  assert.equal(next.endedAt, undefined)
})

test('configuration stays fixed at run start while context reflects the final measured scene', () => {
  const { collector, metadata } = fixture()
  collector.beginRun('configuration')
  metadata.fpsLimit = 30
  metadata.seed = 3456
  metadata.effects = 'rain'
  metadata.dpr = 1
  metadata.viewport = { width: 500, height: 700 }
  metadata.renderResolution = 1
  metadata.garden = 'lake'
  collector.setMode('collect')
  const live = collector.snapshot()
  assert.deepEqual(live.configuration, { mode: 'panel', panelVisible: false, fpsLimit: 60, seed: 1234, effects: 'sun', dpr: 2, viewport: { width: 1200, height: 800 }, renderResolution: 1.5 })
  assert.equal(live.mode, 'panel')
  assert.equal(live.context.garden, 'lake')
  assert.equal(live.context.fpsLimit, 30)
  const ended = collector.endRun()!
  assert.deepEqual(ended.configuration, live.configuration)
  assert.equal(ended.context.garden, 'lake')
  assert.equal(ended.context.fpsLimit, 60, 'exports use the fixed measured configuration, not a later external ref value')
  assert.equal(ended.context.seed, 1234)
  assert.equal(ended.context.effects, 'rain', 'garden-specific weather follows the final scene; initial theme remains in configuration')
  assert.equal(ended.observedContext.fpsLimit, 30, 'independent final conditions remain visible for benchmark validation')
  assert.equal(ended.observedContext.seed, 3456)
  assert.equal(ended.observedContext.effects, 'rain')
  assert.equal(ended.observedContext.dpr, 1)
  assert.equal(ended.endReason, 'manual')
})

test('current rates follow the last two active seconds rather than a long-run average', () => {
  const { collector, time } = fixture(4)
  collector.setActive(true)
  collector.beginRun('long-rate-change')
  for (let frame = 1; frame <= 36000; frame++) {
    const at = frame * 1000 / 60
    time(at)
    collector.tick(at, 1)
    collector.render(2, true, 'automatic')
  }
  for (let frame = 1; frame <= 300; frame++) {
    const at = 600000 + frame * 1000 / 30
    time(at)
    collector.tick(at, 1)
    collector.render(2, true, 'automatic')
  }
  const result = collector.report()
  assert.deepEqual(result.rates.current, { ticksPerSecond: 30, rendersPerSecond: 30, windowMs: 2000 })
  assert.ok(Math.abs(result.rates.average.ticksPerSecond! - 59.508) < .001)
  assert.equal(result.rates.ticksPerSecond, result.rates.average.ticksPerSecond)
  assert.equal(result.rates.rendersPerSecond, result.rates.average.rendersPerSecond)
  assert.equal(result.raw.updateCpu.length, 4, 'sample retention capacity does not distort current-rate timestamps')
  time(611000)
  assert.equal(collector.snapshot().rates.current.ticksPerSecond, 15)
  time(612001)
  assert.equal(collector.snapshot().rates.current.ticksPerSecond, 0, 'old timestamps expire by wall time without requiring another tick')
  const stopped = collector.endRun()!
  time(700000)
  assert.deepEqual(collector.report().rates, stopped.rates, 'rates remain frozen after stop')
})

test('current windows reset on pause or hidden state and never bridge inactive gaps', () => {
  const { collector, time } = fixture()
  collector.beginRun('contiguous-window')
  collector.setActive(true)
  for (let frame = 1; frame <= 60; frame++) {
    time(frame * 1000 / 60)
    collector.tick(frame * 1000 / 60, 1)
    collector.render(1, true, 'automatic')
  }
  assert.equal(collector.snapshot().rates.current.ticksPerSecond, 60)
  collector.setActive(false)
  assert.deepEqual(collector.snapshot().rates.current, { ticksPerSecond: null, rendersPerSecond: null, windowMs: 0 })
  time(10000)
  collector.render(100, false, 'manual')
  collector.setActive(true)
  for (let frame = 1; frame <= 15; frame++) {
    time(10000 + frame * 1000 / 30)
    collector.tick(10000 + frame * 1000 / 30, 1)
    collector.render(1, true, 'automatic')
  }
  const result = collector.report()
  assert.deepEqual(result.rates.current, { ticksPerSecond: 30, rendersPerSecond: 30, windowMs: 500 })
  assert.equal(result.activeMs, 1500)
  assert.equal(result.rates.average.ticksPerSecond, 50)
  assert.equal(result.tickIntervals.max! < 40, true)
  assert.equal(result.counts.manualRenders, 1)
  assert.equal(result.counts.activeManualRenders, 0)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { cameraAt, pointerAt, gardenBenchmarkProtocol, gardenBenchmarkScenarios, gardenBenchmarkWheelSteps, validateGardenBenchmarkRun } from '../../app/utils/gardenBenchmarkProtocol'
import type { GardenBenchmarkExpected, GardenBenchmarkReportConditions } from '../../app/utils/gardenBenchmarkProtocol'

function report(): GardenBenchmarkReportConditions {
  return {
    schemaVersion: 2, mode: 'collect', recording: false, status: 'completed', elapsedMs: 15000, activeMs: 15000, disposed: false,
    context: { garden: 'meadow', seed: 424242, fpsLimit: 30, effects: 'sun', animation: 'running' },
    observedContext: { garden: 'meadow', seed: 424242, fpsLimit: 30, effects: 'sun', animation: 'running' },
    counts: { ticks: 450, renders: 450, manualRenders: 0, generations: 0, ready: 0 },
    tickIntervals: { total: 449 }, updateCpu: { total: 450 }, renderCpu: { total: 450 }, allRenderCpu: { total: 450 },
    preparationMs: { total: 0 }, apiWaitMs: { total: 0 }, totalReadyMs: { total: 0 }
  }
}

const expected: GardenBenchmarkExpected = { kind: 'steady', scenario: 'steady-effects-on', garden: 'meadow', seed: 424242, fpsLimit: 30, effects: true, durationMs: 15000 }

test('shared scenario names and timings keep the browser runner and harness on the same protocol', () => {
  assert.deepEqual(gardenBenchmarkScenarios.map(scenario => scenario.id), ['steady-effects-on', 'steady-effects-off', 'camera', 'pointer-wheel', 'switching'])
  assert.equal(gardenBenchmarkProtocol.warmupMs, 3000)
  assert.equal(gardenBenchmarkProtocol.durationMs, 15000)
  assert.equal(gardenBenchmarkProtocol.repeats, 3)
  assert.equal(gardenBenchmarkProtocol.seed, 424242)
  assert.equal(gardenBenchmarkWheelSteps.length, 8)
  assert.ok(gardenBenchmarkWheelSteps.every((step, index, steps) => step.at >= 0 && step.at < 1 && (index === 0 || step.at > steps[index - 1]!.at)))
})

test('continuous camera motion is deterministic, bounded, smooth and closed without frame-rate input', () => {
  const duration = 15000
  let previous = cameraAt(0, duration)
  let changes = 0
  for (let elapsed = 1; elapsed <= duration; elapsed += 17) {
    const current = cameraAt(elapsed, duration)
    assert.deepEqual(current, cameraAt(elapsed, duration))
    assert.ok(current.zoom >= 1.2 && current.zoom <= 1.8)
    assert.ok(Math.abs(current.x - (1 - current.zoom) / 2) <= .100001)
    assert.ok(Math.abs(current.y - (1 - current.zoom) / 2) <= .080001)
    assert.ok(Math.abs(current.zoom - previous.zoom) < .01)
    assert.ok(Math.abs(current.x - previous.x) < .01)
    assert.ok(Math.abs(current.y - previous.y) < .01)
    if (current.zoom !== previous.zoom) changes++
    previous = current
  }
  assert.ok(changes > 800)
  const first = cameraAt(0, duration), last = cameraAt(duration, duration)
  for (const key of ['zoom', 'x', 'y'] as const) assert.ok(Math.abs(first[key] - last[key]) < 1e-12)
  assert.deepEqual(cameraAt(-100, duration), first)
  assert.deepEqual(cameraAt(Infinity, NaN), first)
  assert.deepEqual(cameraAt(duration * 2, duration), last)
})

test('pointer motion stays away from overlay controls and repeats the same logical path', () => {
  for (let elapsed = 0; elapsed <= 15000; elapsed += 50) {
    const point = pointerAt(elapsed)
    assert.ok(point.x >= .35 && point.x <= .65)
    assert.ok(point.y >= .38 && point.y <= .62)
    assert.deepEqual(point, pointerAt(elapsed))
  }
  assert.deepEqual(pointerAt(-1), pointerAt(0))
  assert.ok(Math.abs(pointerAt(15000).x - pointerAt(0).x) < 1e-12)
})

test('validation checks experimental conditions rather than an achieved FPS or CPU budget', () => {
  const slow = report()
  slow.counts.ticks = 2
  slow.counts.renders = 2
  slow.tickIntervals.total = 1
  slow.updateCpu.total = 2
  slow.renderCpu.total = 2
  slow.allRenderCpu.total = 2
  slow.elapsedMs = 14900
  slow.activeMs = 14900
  assert.deepEqual(validateGardenBenchmarkRun(slow, expected), { valid: true, reasons: [] })
})

test('every mismatched condition is retained as an invalid reason', () => {
  const invalid = report()
  invalid.schemaVersion = 1
  invalid.context = { garden: 'lake', seed: 1, fpsLimit: 60, effects: 'none', animation: 'paused' }
  invalid.mode = 'panel'
  invalid.recording = true
  invalid.status = 'cancelled'
  invalid.elapsedMs = 14899
  invalid.disposed = true
  invalid.counts.ticks = 0
  invalid.counts.renders = 0
  invalid.counts.generations = 1
  invalid.preparationMs.total = 1
  const result = validateGardenBenchmarkRun(invalid, { ...expected, errors: ['Unexpected request'] })
  assert.equal(result.valid, false)
  for (const reason of ['schema-version', 'garden', 'seed', 'fps-limit', 'effects', 'animation-not-running', 'mode-not-collect', 'recording-state', 'run-not-completed', 'collector-disposed', 'measurement-too-short', 'missing-tick-samples', 'missing-render-samples', 'steady-scene-rebuilt', 'steady-preparation-samples', 'runtime-error: Unexpected request']) assert.ok(result.reasons.includes(reason), reason)
})

test('weather validation follows each garden theme and the disabled state', () => {
  for (const [garden, theme] of Object.entries({ meadow: 'sun', lake: 'rain', grove: 'canopy', hill: 'clouds' })) {
    const sample = report()
    sample.context.garden = garden
    sample.context.effects = theme
    sample.observedContext = { ...sample.context }
    const settings = { ...expected, garden: garden as GardenBenchmarkExpected['garden'] }
    assert.equal(validateGardenBenchmarkRun(sample, settings).valid, true)
    sample.context.effects = 'none'
    sample.observedContext.effects = 'none'
    assert.equal(validateGardenBenchmarkRun(sample, { ...settings, effects: false }).valid, true)
  }
})

test('immutable requested settings cannot hide an unavailable shader or changed end conditions', () => {
  const sample = report()
  sample.observedContext!.effects = 'none'
  assert.deepEqual(validateGardenBenchmarkRun(sample, expected).reasons, ['observed-effects'])
  sample.observedContext = undefined
  assert.equal(validateGardenBenchmarkRun(sample, expected).valid, true, 'structural fixtures can use their current context directly')
  sample.activeMs = 12000
  assert.deepEqual(validateGardenBenchmarkRun(sample, expected).reasons, ['active-measurement-too-short'])
})

test('camera and input scenarios require consumed movement and preserve its provenance', () => {
  const sample = report()
  assert.equal(validateGardenBenchmarkRun(sample, { ...expected, scenario: 'camera', movement: { samples: 5, changes: 5 } }).valid, true)
  assert.ok(validateGardenBenchmarkRun(sample, { ...expected, scenario: 'camera', movement: { samples: 5, changes: 4 } }).reasons.includes('camera-did-not-move-continuously'))
  const input = { ...expected, scenario: 'pointer-wheel' as const, interactions: { pointerMoves: 5, wheels: 8 }, inputKind: 'trusted-playwright' as const }
  assert.deepEqual(validateGardenBenchmarkRun(sample, input), { valid: true, reasons: [], inputKind: 'trusted-playwright' })
  assert.equal(validateGardenBenchmarkRun(sample, { ...input, inputKind: 'synthetic-events' }).valid, true)
  assert.ok(validateGardenBenchmarkRun(sample, { ...input, interactions: { pointerMoves: 0, wheels: 0 } }).reasons.includes('input-not-consumed'))
  assert.ok(validateGardenBenchmarkRun(sample, { ...input, interactions: { pointerMoves: 20, wheels: 7 } }).reasons.includes('input-not-consumed'))
})

test('pointer input accepts automatic-only rendering but still requires enough completed main draws', () => {
  const sample = report()
  const input: GardenBenchmarkExpected = {
    ...expected, scenario: 'pointer-wheel', interactions: { pointerMoves: 5, wheels: 8 }, inputKind: 'trusted-playwright'
  }
  assert.equal(sample.counts.manualRenders, 0)
  assert.deepEqual(validateGardenBenchmarkRun(sample, input), { valid: true, reasons: [], inputKind: 'trusted-playwright' })
  // A consumed input timeline and CPU samples do not replace actual main draws.
  sample.counts.renders = 4
  assert.deepEqual(validateGardenBenchmarkRun(sample, input).reasons, ['input-did-not-render'])
  sample.counts.renders = 0
  assert.ok(validateGardenBenchmarkRun(sample, input).reasons.includes('missing-render-samples'))
  assert.ok(validateGardenBenchmarkRun(sample, input).reasons.includes('input-did-not-render'))
})

test('opening and switching require preparation samples and exact requested transition counts', () => {
  const sample = report()
  const settings = { ...expected, kind: 'transitions' as const, scenario: 'switching' as const, durationMs: undefined, expectedReadyCount: 40, expectedGenerationCount: 40 }
  assert.equal(validateGardenBenchmarkRun(sample, settings).valid, false)
  sample.counts.generations = 40
  sample.counts.ready = 40
  sample.preparationMs.total = 40
  sample.totalReadyMs.total = 40
  assert.equal(validateGardenBenchmarkRun(sample, settings).valid, true)
  assert.equal(validateGardenBenchmarkRun(sample, { ...settings, requireRecording: true, requireCompleted: false }).valid, false)
  sample.recording = true
  sample.status = 'recording'
  assert.equal(validateGardenBenchmarkRun(sample, { ...settings, requireRecording: true, requireCompleted: false }).valid, true)
})

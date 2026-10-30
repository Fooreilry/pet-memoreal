import assert from 'node:assert/strict'
import test from 'node:test'
import { createGardenDiagnostics } from '../../app/utils/gardenDiagnostics'
import type { GardenDiagnosticContext } from '../../app/utils/gardenDiagnostics'
import { createGardenDiagnosticRuns } from '../../app/utils/gardenDiagnosticRuns'

function fixture(limit?: number) {
  let now = 0
  const context: GardenDiagnosticContext = {
    garden: 'meadow', seed: 123, zoom: 1, dpr: 1, renderResolution: 1, rendererWidth: 1440, rendererHeight: 900,
    viewport: { width: 1200, height: 800 }, fpsLimit: 30, effects: 'sun', animation: 'running', memorialCount: 4,
    chunks: { visible: 4, total: 12 }, rebuilds: 1, resources: { containers: 3, graphics: 5, texts: 1, cacheNodes: 2, renderTextures: 0, atmospherePasses: 1, totalNodes: 9 }, browser: 'unit-browser'
  }
  const collector = createGardenDiagnostics({ now: () => now, getContext: () => context })
  collector.setMode('collect')
  collector.setActive(true)
  const runs = createGardenDiagnosticRuns(collector, limit)
  const frame = (at: number, cpuMs = 1) => { now = at; collector.tick(at, cpuMs); collector.render(cpuMs, true, 'automatic') }
  return { collector, runs, context, frame, time: (at: number) => { now = at } }
}

test('idle sessions never create warming or empty completed records without an explicit start', () => {
  const { collector, runs, context, frame } = fixture()
  frame(100)
  assert.equal(runs.stop(), undefined)
  assert.deepEqual(runs.reports(), [])
  runs.change('fps-limit', () => { context.fpsLimit = 60 })
  assert.equal(collector.recording, false)
  assert.deepEqual(runs.reports(), [])
  assert.equal(runs.find('missing'), undefined)
  const id = runs.start('explicit-session')
  assert.equal(collector.recording, true)
  frame(200)
  const finished = runs.stop()!
  assert.equal(finished.runId, id)
  assert.equal(finished.configuration!.fpsLimit, 60)
  assert.equal(finished.counts.ticks, 1)
  assert.equal(finished.status, 'completed')
  assert.equal(finished.endReason, 'manual')
  assert.equal(collector.recording, false)
  assert.equal(runs.stop(), undefined)
  assert.equal(runs.reports().length, 1)
})

test('restarting archives the previous session before giving the new run a fresh identifier and samples', () => {
  const { collector, runs, frame } = fixture()
  const firstId = runs.start('first')
  frame(100, 3)
  const secondId = runs.start('second')
  assert.notEqual(secondId, firstId)
  const archived = runs.find(firstId)!
  assert.equal(archived.scenario, 'first')
  assert.equal(archived.endReason, 'restarted')
  assert.equal(archived.counts.ticks, 1)
  assert.equal(archived.updateCpu.p50, 3)
  assert.equal(collector.recording, true)
  assert.equal(collector.snapshot().scenario, 'second')
  assert.equal(collector.snapshot().counts.ticks, 0)
  frame(200, 8)
  const second = runs.stop('completed')!
  assert.equal(second.runId, secondId)
  assert.equal(second.counts.ticks, 1)
  assert.equal(second.updateCpu.p50, 8)
  assert.deepEqual(runs.reports().map(report => report.runId), [firstId, secondId])
})

test('setting changes end and archive old conditions before applying new FPS, mode and seed', () => {
  const { collector, runs, context, frame, time } = fixture()
  const firstId = runs.start('same-scenario')
  frame(100, 2)
  time(200)
  runs.change('fps-changed', () => {
    assert.equal(collector.recording, false)
    assert.equal(runs.reports().length, 1)
    assert.equal(runs.find(firstId)!.context.fpsLimit, 30)
    context.fpsLimit = 60
  })
  const secondId = collector.snapshot().runId
  assert.notEqual(secondId, firstId)
  assert.equal(collector.snapshot().configuration!.fpsLimit, 60)
  assert.equal(collector.snapshot().scenario, 'same-scenario')
  assert.equal(collector.snapshot().counts.ticks, 0)
  frame(300, 5)
  time(400)
  runs.change('mode-changed', () => { collector.setMode('panel'); context.seed = 456; context.effects = 'rain' })
  const thirdId = collector.snapshot().runId
  frame(500, 9)
  const third = runs.stop()!
  const [first, second] = runs.reports()
  assert.deepEqual([first!.runId, second!.runId, third.runId], [firstId, secondId, thirdId])
  assert.equal(first!.configuration!.fpsLimit, 30)
  assert.equal(first!.context.fpsLimit, 30)
  assert.equal(first!.mode, 'collect')
  assert.equal(first!.endReason, 'fps-changed')
  assert.equal(second!.configuration!.fpsLimit, 60)
  assert.equal(second!.configuration!.seed, 123)
  assert.equal(second!.mode, 'collect')
  assert.equal(second!.endReason, 'mode-changed')
  assert.equal(third.mode, 'panel')
  assert.equal(third.configuration!.seed, 456)
  assert.equal(third.configuration!.effects, 'rain')
  assert.deepEqual(runs.reports().map(report => report.counts.ticks), [1, 1, 1])
  assert.deepEqual(runs.reports().map(report => report.updateCpu.p50), [2, 5, 9])
})

test('results and individual reports are detached, frozen in time and bounded to the latest sessions', () => {
  const { runs, context, frame, time } = fixture(2)
  const ids: string[] = []
  for (let index = 0; index < 3; index++) {
    ids.push(runs.start(`run-${index}`))
    frame((index + 1) * 100, index + 1)
    runs.stop()
  }
  const reports = runs.reports()
  assert.deepEqual(reports.map(report => report.runId), ids.slice(1))
  assert.equal(runs.find(ids[0]!), undefined)
  const original = runs.find(ids[1]!)!
  reports[0]!.context.garden = 'hill'
  reports[0]!.configuration!.viewport.width = 1
  reports[0]!.raw.updateCpu[0] = 999
  reports.pop()
  const separate = runs.find(ids[1]!)!
  separate.raw.updateCpu[0] = 1000
  context.fpsLimit = 60
  time(600000)
  assert.deepEqual(runs.find(ids[1]!), original)
  assert.equal(runs.reports().length, 2)
})

test('validation receives a detached stopped report and cannot mutate archived measurement data', () => {
  const { collector, runs, frame } = fixture()
  runs.start('validated')
  frame(100)
  const reasons = ['duration-too-short']
  const report = runs.stop('completed', (candidate) => {
    assert.equal(collector.recording, false)
    assert.equal(candidate.status, 'completed')
    candidate.context.seed = 999
    candidate.raw.updateCpu[0] = 999
    return { valid: false, reasons }
  })!
  assert.deepEqual(report.validation, { valid: false, reasons: ['duration-too-short'] })
  assert.equal(report.context.seed, 123)
  assert.deepEqual(report.raw.updateCpu, [1])
  reasons.push('mutated-after-stop')
  report.validation!.reasons.push('mutated-result')
  assert.deepEqual(runs.find(report.runId)!.validation, { valid: false, reasons: ['duration-too-short'] })
  runs.start('object-validation')
  frame(200)
  assert.deepEqual(runs.stop('completed', { valid: true, reasons: [] })!.validation, { valid: true, reasons: [] })
})

test('a failed setting application leaves the old run archived and does not start under incomplete conditions', () => {
  const { collector, runs, frame } = fixture()
  const id = runs.start('before-error')
  frame(100)
  assert.throws(() => runs.change('setting-error', () => { throw new Error('fixture setting failed') }), /fixture setting failed/)
  assert.equal(collector.recording, false)
  assert.equal(runs.find(id)!.endReason, 'setting-error')
  assert.equal(runs.reports().length, 1)
})

test('archive limits cannot exceed twelve complete run reports', () => {
  for (const limit of [undefined, 1000, Number.NaN]) {
    const { runs, frame } = fixture(limit)
    for (let index = 0; index < 14; index++) { runs.start(`run-${index}`); frame(index + 1); runs.stop() }
    assert.equal(runs.reports().length, 12)
    assert.equal(runs.reports()[0]!.scenario, 'run-2')
    assert.equal(runs.reports().at(-1)!.scenario, 'run-13')
  }
})

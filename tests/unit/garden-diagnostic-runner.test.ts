import assert from 'node:assert/strict'
import test from 'node:test'
import { createGardenDiagnosticRunner } from '../../app/utils/gardenDiagnosticRunner'
import type { GardenDiagnosticRunnerAdapter, GardenDiagnosticRunnerOptions, GardenDiagnosticRunnerState } from '../../app/utils/gardenDiagnosticRunner'
import { createGardenDiagnostics } from '../../app/utils/gardenDiagnostics'
import type { GardenDiagnosticContext } from '../../app/utils/gardenDiagnostics'
import { createGardenDiagnosticRuns } from '../../app/utils/gardenDiagnosticRuns'
import type { GardenId } from '../../shared/gardens'

function fixture(options: GardenDiagnosticRunnerOptions = {}) {
  let now = 0, garden: GardenId = 'meadow', mode: 'panel' | 'collect' = 'panel', effects = false
  let camera = false, input = false, failure = false
  let movement = { samples: 0, changes: 0 }, interactions = { pointerMoves: 0, wheels: 0 }
  const events: string[] = [], states: GardenDiagnosticRunnerState[] = []
  const context: GardenDiagnosticContext = {
    garden, seed: 123, zoom: 1, dpr: 1, renderResolution: 1, rendererWidth: 1440, rendererHeight: 900,
    viewport: { width: 1200, height: 800 }, fpsLimit: 30, effects: 'none', animation: 'running', memorialCount: 4,
    chunks: { visible: 4, total: 12 }, rebuilds: 1, resources: { containers: 3, graphics: 5, texts: 1, cacheNodes: 2, renderTextures: 0, atmospherePasses: 1, totalNodes: 9 }, browser: 'unit-browser'
  }
  const collector = createGardenDiagnostics({ now: () => now, getContext: () => context })
  collector.setActive(true)
  const sessions = createGardenDiagnosticRuns(collector)
  let onSleep: ((recording: boolean) => void) | undefined
  const advance = (ms: number) => {
    for (let frame = 0; frame < 6; frame++) {
      now += ms / 6
      collector.tick(now, 1)
      collector.render(2, true, 'automatic')
      if (camera) { movement.samples++; movement.changes++ }
      if (input) { interactions.pointerMoves++; interactions.wheels = 8; collector.render(3, true, 'manual') }
    }
  }
  const adapter: GardenDiagnosticRunnerAdapter = {
    getGarden: () => garden,
    navigate: async id => {
      events.push(`navigate:${id}:${collector.recording}`)
      garden = id; context.garden = id
      context.effects = effects ? { meadow: 'sun', lake: 'rain', grove: 'canopy', hill: 'clouds' }[id] : 'none'
      advance(60)
      collector.generation('garden', 5)
      collector.ready({ kind: 'garden', generationMs: 5, preparationMs: 10, apiWaitMs: 2, totalMs: 30 })
    },
    waitReady: async signal => { if (signal.aborted) throw new Error('aborted'); if (failure) { failure = false; throw new Error('ready fixture failed') } },
    configure: settings => { events.push('configure'); context.seed = settings.seed; context.fpsLimit = settings.fpsLimit; mode = settings.mode; effects = settings.effects; collector.setMode(mode) },
    begin: scenario => { events.push(`begin:${scenario}`); return sessions.start(scenario) },
    end: (reason, validate) => { events.push(`end:${reason}`); return sessions.stop(reason, validate) },
    snapshot: collector.snapshot,
    startCamera: () => { camera = true; movement = { samples: 0, changes: 0 } }, stopCamera: () => { camera = false }, motionInfo: () => ({ ...movement }),
    startInput: () => { input = true; interactions = { pointerMoves: 0, wheels: 0 } }, stopInput: () => { input = false }, inputInfo: () => ({ ...interactions }),
    saveState: () => ({ garden, mode, effects, context: structuredClone(context) }),
    restoreState: async value => {
      assert.equal(collector.recording, false, 'restoration must follow endRun')
      events.push('restore')
      const saved = value as { garden: GardenId, mode: 'panel' | 'collect', effects: boolean, context: GardenDiagnosticContext }
      garden = saved.garden; mode = saved.mode; effects = saved.effects
      Object.assign(context, structuredClone(saved.context)); collector.setMode(mode)
    },
    publish: state => states.push({ ...state })
  }
  const runner = createGardenDiagnosticRunner(adapter, {
    warmupMs: 10, durationMs: 60, repeats: 3, transitionCycles: 2,
    sleep: async (ms, signal) => {
      advance(ms)
      onSleep?.(collector.recording)
      if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    }, ...options
  })
  return { runner, collector, sessions, adapter, events, states, context, setSleep: (callback: (recording: boolean) => void) => { onSleep = callback }, failReady: () => { failure = true } }
}

test('steady protocol excludes warmup, repeats measurements and restores settings after completed reports freeze', async () => {
  const fixtureRun = fixture()
  const reports = await fixtureRun.runner.run({ scenario: 'steady-effects-on', scope: 'current' }, 60)
  assert.equal(reports.length, 3)
  assert.ok(reports.every(report => report.validation?.valid))
  assert.ok(reports.every(report => report.elapsedMs >= 59.999 && report.elapsedMs <= 60.001))
  assert.ok(reports.every(report => report.counts.ready === 0 && report.counts.generations === 0))
  assert.ok(reports.every(report => report.context.fpsLimit === 60 && report.mode === 'collect'))
  assert.equal(fixtureRun.context.seed, 123)
  assert.equal(fixtureRun.context.fpsLimit, 30)
  assert.equal(fixtureRun.context.effects, 'none')
  assert.equal(fixtureRun.collector.recording, false)
  assert.equal(fixtureRun.runner.isRunning, false)
  assert.equal(fixtureRun.states.at(-1)!.status, 'completed')
  assert.equal(fixtureRun.states.at(-1)!.completed, 3)
  assert.ok(fixtureRun.events.lastIndexOf('end:completed') < fixtureRun.events.lastIndexOf('restore'))
})

test('camera motion and synthetic pointer/wheel runs use the shared validator and preserve input provenance', async () => {
  for (const scenario of ['camera', 'pointer-wheel'] as const) {
    const sample = fixture({ repeats: 1 })
    const [report] = await sample.runner.run({ scenario, scope: 'current' }, 30)
    assert.equal(report!.validation!.valid, true, report!.validation!.reasons.join(','))
    if (scenario === 'pointer-wheel') {
      assert.equal(report!.validation!.inputKind, 'synthetic-events')
      assert.ok(report!.counts.manualRenders > 4)
    }
  }
})

test('switching visits all four gardens for the specified cycles and validates exact preparation counts', async () => {
  const sample = fixture()
  const [report] = await sample.runner.run({ scenario: 'switching', scope: 'current' }, 30)
  assert.equal(report!.validation!.valid, true, report!.validation!.reasons.join(','))
  assert.equal(report!.counts.ready, 8)
  assert.equal(report!.counts.generations, 8)
  assert.equal(report!.context.garden, 'hill')
  assert.deepEqual(sample.events.filter(event => /navigate:.*:true/.test(event)), ['meadow', 'lake', 'grove', 'hill', 'meadow', 'lake', 'grove', 'hill'].map(garden => `navigate:${garden}:true`))
})

test('UI opening is a ready rebuild with navigation away before recording starts', async () => {
  const sample = fixture()
  const [report] = await sample.runner.run({ scenario: 'opening', scope: 'current' }, 30)
  assert.equal(report!.validation!.valid, true, report!.validation!.reasons.join(','))
  assert.equal(report!.counts.ready, 1)
  assert.equal(report!.counts.generations, 1)
  assert.ok(sample.events.indexOf('navigate:lake:false') < sample.events.findIndex(event => event.startsWith('begin:')))
  assert.ok(sample.events.includes('navigate:meadow:true'))
})

test('suite covers the shared five scenarios across all gardens without repeating switching per garden', async () => {
  const sample = fixture({ repeats: 1, transitionCycles: 1 })
  const reports = await sample.runner.run({ scenario: 'suite', scope: 'all' }, 30)
  assert.equal(reports.length, 17)
  assert.ok(reports.every(report => report.validation!.valid), reports.filter(report => !report.validation!.valid).map(report => report.validation!.reasons.join(',')).join(';'))
  assert.equal(sample.states.at(-1)!.completed, 17)
  assert.equal(sample.states.at(-1)!.total, 17)
  assert.equal(sample.sessions.reports().length, 12)
})

test('warmup cancellation restores the original scene without creating a measurement report', async () => {
  const sample = fixture()
  sample.setSleep(recording => { if (!recording) sample.runner.cancel('user-cancelled') })
  const reports = await sample.runner.run({ scenario: 'camera', scope: 'current' }, 60)
  assert.equal(reports.length, 0)
  assert.equal(sample.sessions.reports().length, 0)
  assert.equal(sample.collector.recording, false)
  assert.equal(sample.context.seed, 123)
  assert.equal(sample.states.at(-1)!.status, 'cancelled')
  assert.equal(sample.runner.isRunning, false)
})

test('cancellation during measurement freezes an explicitly invalid run before restoration', async () => {
  const sample = fixture()
  sample.setSleep(recording => { if (recording) sample.runner.cancel('user-cancelled') })
  const [report] = await sample.runner.run({ scenario: 'steady-effects-off', scope: 'current' }, 60)
  assert.equal(report!.validation!.valid, false)
  assert.deepEqual(report!.validation!.reasons, ['cancelled'])
  assert.equal(report!.endReason, 'user-cancelled')
  assert.equal(report!.context.fpsLimit, 60)
  assert.equal(report!.context.effects, 'none')
  assert.equal(sample.context.fpsLimit, 30)
  assert.equal(sample.states.at(-1)!.status, 'cancelled')
})

test('readiness errors restore the scene and leave the runner reusable with recording stopped', async () => {
  const sample = fixture({ repeats: 1 })
  sample.failReady()
  assert.deepEqual(await sample.runner.run({ scenario: 'camera', scope: 'current' }, 60), [])
  assert.equal(sample.states.at(-1)!.status, 'error')
  assert.equal(sample.states.at(-1)!.error, 'ready fixture failed')
  assert.equal(sample.collector.recording, false)
  assert.equal(sample.context.seed, 123)
  assert.equal(sample.runner.isRunning, false)
  assert.equal((await sample.runner.run({ scenario: 'camera', scope: 'current' }, 60))[0]!.validation!.valid, true)
})

test('cancelled synthetic input retains its provenance on the invalid completed report', async () => {
  const sample = fixture({ repeats: 1 })
  sample.setSleep(recording => { if (recording) sample.runner.cancel() })
  const [report] = await sample.runner.run({ scenario: 'pointer-wheel', scope: 'current' }, 30)
  assert.deepEqual(report!.validation, { valid: false, reasons: ['cancelled'], inputKind: 'synthetic-events' })
})

test('overlapping benchmark requests are rejected and cancelling preparation releases the active runner', async () => {
  const sample = fixture({ sleep: async () => new Promise<void>(() => {}) })
  const active = sample.runner.run({ scenario: 'camera', scope: 'current' }, 30)
  assert.equal(sample.runner.isRunning, true)
  await assert.rejects(sample.runner.run({ scenario: 'camera', scope: 'current' }, 60), /already running/)
  sample.runner.cancel()
  assert.deepEqual(await active, [])
  assert.equal(sample.runner.isRunning, false)
  assert.equal(sample.collector.recording, false)
})

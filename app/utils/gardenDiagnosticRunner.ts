import { gardenIds } from '../../shared/gardens'
import type { GardenId } from '../../shared/gardens'
import { gardenBenchmarkProtocol, gardenBenchmarkScenarios, validateGardenBenchmarkRun } from './gardenBenchmarkProtocol'
import type { GardenBenchmarkExpected, GardenBenchmarkRequest, GardenBenchmarkValidity } from './gardenBenchmarkProtocol'
import type { GardenDiagnosticMode, GardenDiagnosticsReport, GardenDiagnosticsSnapshot } from './gardenDiagnostics'

export type GardenDiagnosticRunnerState = {
  status: 'idle' | 'warming' | 'measuring' | 'switching' | 'completed' | 'cancelled' | 'error'
  scenario: string
  repeat: number
  total: number
  completed: number
  garden?: GardenId
  error?: string
}
export type GardenDiagnosticRunnerAdapter = {
  getGarden: () => GardenId | undefined
  navigate: (id: GardenId) => Promise<void>
  waitReady: (signal: AbortSignal) => Promise<void>
  configure: (settings: { seed: number, fpsLimit: 30 | 60, effects: boolean, mode: GardenDiagnosticMode }) => void
  begin: (scenario: string) => string
  end: (reason: string, validator?: GardenBenchmarkValidity | ((report: GardenDiagnosticsReport) => GardenBenchmarkValidity)) => GardenDiagnosticsReport | undefined
  snapshot: () => GardenDiagnosticsSnapshot
  startCamera: (durationMs: number) => void
  stopCamera: () => void
  motionInfo: () => { samples: number, changes: number }
  startInput: (durationMs: number) => void
  stopInput: () => void
  inputInfo: () => { pointerMoves: number, wheels: number }
  saveState: () => unknown
  restoreState: (value: unknown) => Promise<void>
  publish: (state: GardenDiagnosticRunnerState) => void
}
export type GardenDiagnosticRunnerOptions = {
  warmupMs?: number
  durationMs?: number
  repeats?: number
  transitionCycles?: number
  sleep?: (durationMs: number, signal: AbortSignal) => Promise<void>
}
type Task = { scenario: Exclude<GardenBenchmarkRequest['scenario'], 'suite'>, garden: GardenId, repeat: number }

const cancelled = () => Object.assign(new Error('Benchmark cancelled'), { name: 'AbortError' })
const check = (signal: AbortSignal) => { if (signal.aborted) throw cancelled() }

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    // The adapter may synchronously cancel while creating this promise. Consume
    // its rejection even when the cancellation race has already finished.
    void promise.catch(() => undefined)
    return Promise.reject(cancelled())
  }
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(cancelled()) }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value) }, error => { signal.removeEventListener('abort', abort); reject(error) })
  })
}

function delay(durationMs: number, signal: AbortSignal): Promise<void> {
  check(signal)
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(cancelled()) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, durationMs)
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** Runs the shared benchmark protocol through the existing scene/ticker controls. */
export function createGardenDiagnosticRunner(adapter: GardenDiagnosticRunnerAdapter, options: GardenDiagnosticRunnerOptions = {}) {
  const number = (value: number | undefined, fallback: number, minimum = 0) => Number.isFinite(value) ? Math.max(minimum, value!) : fallback
  const warmupMs = number(options.warmupMs, gardenBenchmarkProtocol.warmupMs)
  const durationMs = number(options.durationMs, gardenBenchmarkProtocol.durationMs, 1)
  const repeats = Math.floor(number(options.repeats, gardenBenchmarkProtocol.repeats, 1))
  const cycles = Math.floor(number(options.transitionCycles, gardenBenchmarkProtocol.transitionCycles, 1))
  const sleep = options.sleep ?? delay
  let controller: AbortController | undefined
  let cancelReason = 'cancelled'

  async function run(request: GardenBenchmarkRequest, fpsLimit: 30 | 60) {
    if (controller) throw new Error('Benchmark already running')
    if (fpsLimit !== 30 && fpsLimit !== 60) throw new Error('Unsupported benchmark tick limit')
    if (!['current', 'all'].includes(request.scope) || !['suite', 'opening', ...gardenBenchmarkScenarios.map(scenario => scenario.id)].includes(request.scenario)) throw new Error('Unsupported benchmark request')
    const current = adapter.getGarden() ?? gardenIds[0]
    const gardens = request.scope === 'all' ? [...gardenIds] : [current]
    const scenarios = request.scenario === 'suite' ? gardenBenchmarkScenarios.map(scenario => scenario.id) : [request.scenario]
    const tasks = scenarios.flatMap<Task>(scenario => scenario === 'switching' ? [{ scenario, garden: gardenIds[3], repeat: 1 }] : gardens.flatMap(garden => Array.from({ length: scenario === 'opening' ? 1 : repeats }, (_, index) => ({ scenario, garden, repeat: index + 1 }))))
    const abort = new AbortController()
    controller = abort
    cancelReason = 'cancelled'
    const reports: GardenDiagnosticsReport[] = []
    let saved: unknown, savedState = false
    let state: GardenDiagnosticRunnerState = { status: 'warming', scenario: request.scenario, repeat: 0, total: tasks.length, completed: 0 }
    let outcome: 'completed' | 'cancelled' | 'error' = 'completed'
    let failure: string | undefined
    const publish = (value: Partial<GardenDiagnosticRunnerState>) => { state = { ...state, ...value }; adapter.publish({ ...state }) }
    const invalid = (reason: string): GardenBenchmarkValidity => ({ valid: false, reasons: [reason], ...(state.scenario === 'pointer-wheel' ? { inputKind: 'synthetic-events' as const } : {}) })
    const wait = async (ms: number) => { check(abort.signal); await abortable(sleep(ms, abort.signal), abort.signal); check(abort.signal) }
    const navigate = async (garden: GardenId) => { check(abort.signal); await abortable(adapter.navigate(garden), abort.signal); await abortable(adapter.waitReady(abort.signal), abort.signal); check(abort.signal) }
    const retain = (report: GardenDiagnosticsReport | undefined) => { if (report) reports.push(report) }
    try {
      saved = adapter.saveState()
      savedState = true
      if (adapter.snapshot().recording) adapter.end('benchmark-started')
      for (const task of tasks) {
        check(abort.signal)
        publish({ status: 'warming', scenario: task.scenario, garden: task.garden, repeat: task.repeat })
        const effects = task.scenario !== 'steady-effects-off'
        adapter.configure({ seed: gardenBenchmarkProtocol.seed, fpsLimit, effects, mode: 'collect' })
        adapter.stopCamera(); adapter.stopInput()
        if (task.scenario === 'opening') {
          const away = gardenIds.find(garden => garden !== task.garden)!
          await navigate(away)
        } else await navigate(task.scenario === 'switching' ? gardenIds[3] : task.garden)
        await wait(warmupMs)
        check(abort.signal)
        adapter.begin(`${task.garden}-${task.scenario}-${task.repeat}`)
        publish({ status: task.scenario === 'switching' ? 'switching' : 'measuring' })
        let expected: GardenBenchmarkExpected
        if (task.scenario === 'switching') {
          for (let cycle = 0; cycle < cycles; cycle++) for (const garden of gardenIds) await navigate(garden)
          // Include a tick interval after the final reveal, independently of the
          // renderer speed. Its wait belongs to the transition experiment.
          await wait(Math.max(100, 3000 / fpsLimit))
          expected = { kind: 'transitions', scenario: 'switching', garden: gardenIds[3], seed: gardenBenchmarkProtocol.seed, fpsLimit, effects: true, expectedReadyCount: cycles * gardenIds.length, expectedGenerationCount: cycles * gardenIds.length }
        } else if (task.scenario === 'opening') {
          await navigate(task.garden)
          await wait(Math.max(100, 3000 / fpsLimit))
          expected = { kind: 'first-open', scenario: 'opening', garden: task.garden, seed: gardenBenchmarkProtocol.seed, fpsLimit, effects: true, expectedReadyCount: 1, expectedGenerationCount: 1 }
        } else {
          if (task.scenario === 'camera') adapter.startCamera(durationMs)
          if (task.scenario === 'pointer-wheel') adapter.startInput(durationMs)
          await wait(durationMs)
          expected = { kind: 'steady', scenario: task.scenario, garden: task.garden, seed: gardenBenchmarkProtocol.seed, fpsLimit, effects, durationMs, movement: adapter.motionInfo(), interactions: adapter.inputInfo(), ...(task.scenario === 'pointer-wheel' ? { inputKind: 'synthetic-events' as const } : {}) }
        }
        check(abort.signal)
        retain(adapter.end('completed', report => validateGardenBenchmarkRun(report, expected)))
        adapter.stopCamera(); adapter.stopInput()
        publish({ completed: state.completed + 1 })
      }
    } catch (error) {
      outcome = abort.signal.aborted ? 'cancelled' : 'error'
      failure = outcome === 'error' ? error instanceof Error ? error.message : 'Benchmark failed' : undefined
      if (adapter.snapshot().recording) retain(adapter.end(outcome === 'cancelled' ? cancelReason : 'runner-error', invalid(outcome === 'cancelled' ? 'cancelled' : 'runner-error')))
    } finally {
      // Stop the measured run before camera/effects/page state restoration can
      // generate frames or alter the captured experimental conditions.
      if (adapter.snapshot().recording) retain(adapter.end('runner-finalized', invalid('runner-finalized')))
      adapter.stopCamera(); adapter.stopInput()
      publish({ status: 'warming' })
      try { if (savedState) await adapter.restoreState(saved) } catch (error) {
        outcome = 'error'
        failure = error instanceof Error ? error.message : 'Benchmark restoration failed'
      }
      if (adapter.snapshot().recording) adapter.end('runner-restored', { valid: false, reasons: ['unexpected-restoration-recording'] })
      if (abort.signal.aborted && outcome !== 'error') outcome = 'cancelled'
      controller = undefined
      publish({ status: outcome, ...(failure ? { error: failure } : {}) })
    }
    return reports
  }

  return { run, cancel: (reason = 'cancelled') => { if (controller && !controller.signal.aborted) { cancelReason = reason; controller.abort() } }, get isRunning() { return controller !== undefined } }
}

export type GardenDiagnosticRunner = ReturnType<typeof createGardenDiagnosticRunner>

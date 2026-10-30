import type { GardenId } from '../../shared/gardens'

export const gardenBenchmarkScenarios = [
  { id: 'steady-effects-on', effects: true, movement: 'none' },
  { id: 'steady-effects-off', effects: false, movement: 'none' },
  { id: 'camera', effects: true, movement: 'ticker' },
  { id: 'pointer-wheel', effects: true, movement: 'input' },
  { id: 'switching', effects: true, movement: 'navigation' }
] as const

export type GardenBenchmarkScenarioId = typeof gardenBenchmarkScenarios[number]['id']
export type GardenBenchmarkRequest = { scenario: GardenBenchmarkScenarioId | 'opening' | 'suite', scope: 'current' | 'all' }
export type GardenBenchmarkInputKind = 'trusted-playwright' | 'synthetic-events'
export type GardenBenchmarkCamera = { zoom: number, x: number, y: number }

export const gardenBenchmarkProtocol = {
  schemaVersion: 2, seed: 424242, warmupMs: 3000, durationMs: 15000, repeats: 3,
  pointerHz: 30, transitionCycles: 10, scenarios: gardenBenchmarkScenarios
} as const

function progress(elapsedMs: number, durationMs: number) {
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : gardenBenchmarkProtocol.durationMs
  return Math.max(0, Math.min(1, (Number.isFinite(elapsedMs) ? elapsedMs : 0) / duration))
}

/** Normalized offsets multiply projection.width/height, never renderer gutters. */
export function cameraAt(elapsedMs: number, durationMs: number = gardenBenchmarkProtocol.durationMs): GardenBenchmarkCamera {
  const phase = progress(elapsedMs, durationMs) * Math.PI * 2
  const zoom = 1.5 - .3 * Math.cos(phase)
  return { zoom, x: (1 - zoom) / 2 + .1 * Math.sin(phase), y: (1 - zoom) / 2 + .08 * Math.sin(phase * 2) }
}

/** Logical viewport fractions, safely away from the corner controls. */
export function pointerAt(elapsedMs: number, durationMs: number = gardenBenchmarkProtocol.durationMs) {
  const phase = progress(elapsedMs, durationMs) * Math.PI * 2
  return { x: .5 + .15 * Math.sin(phase * 2), y: .5 + .12 * Math.sin(phase * 3) }
}

export const gardenBenchmarkWheelSteps = [
  { at: 0, deltaY: -120 }, { at: .125, deltaY: -80 },
  { at: .25, deltaY: 60 }, { at: .375, deltaY: -80 },
  { at: .5, deltaY: 80 }, { at: .625, deltaY: -60 },
  { at: .75, deltaY: 100 }, { at: .875, deltaY: 100 }
] as const

type SampleCount = { total: number }
type ContextConditions = { garden: string, seed: number, fpsLimit: number, effects: string, animation: string }
export type GardenBenchmarkReportConditions = {
  schemaVersion: number
  mode: string
  recording: boolean
  status: string
  elapsedMs: number
  activeMs: number
  disposed?: boolean
  context: ContextConditions
  observedContext?: ContextConditions
  counts: { ticks: number, renders: number, manualRenders: number, generations: number, ready: number }
  tickIntervals: SampleCount
  updateCpu: SampleCount
  renderCpu: SampleCount
  allRenderCpu: SampleCount
  preparationMs: SampleCount
  apiWaitMs: SampleCount
  totalReadyMs: SampleCount
}
export type GardenBenchmarkExpected = {
  kind: 'first-open' | 'steady' | 'transitions'
  scenario: GardenBenchmarkScenarioId | 'opening'
  garden: GardenId
  seed: number
  fpsLimit: 30 | 60
  effects: boolean
  durationMs?: number
  requireRecording?: boolean
  requireCompleted?: boolean
  movement?: { samples: number, changes: number }
  interactions?: { pointerMoves: number, wheels: number }
  inputKind?: GardenBenchmarkInputKind
  expectedReadyCount?: number
  expectedGenerationCount?: number
  errors?: readonly string[]
}
export type GardenBenchmarkValidity = { valid: boolean, reasons: string[], inputKind?: GardenBenchmarkInputKind }

/** Validate the experiment, without imposing an achieved FPS/CPU threshold. */
export function validateGardenBenchmarkRun(report: GardenBenchmarkReportConditions, expected: GardenBenchmarkExpected): GardenBenchmarkValidity {
  const reasons: string[] = []
  const require = (condition: boolean, reason: string) => { if (!condition) reasons.push(reason) }
  const theme = { meadow: 'sun', lake: 'rain', grove: 'canopy', hill: 'clouds' }[expected.garden]
  require(report.schemaVersion === gardenBenchmarkProtocol.schemaVersion, 'schema-version')
  require(report.context.garden === expected.garden, 'garden')
  require(report.context.seed === expected.seed, 'seed')
  require(report.context.fpsLimit === expected.fpsLimit, 'fps-limit')
  require(report.context.effects === (expected.effects ? theme : 'none'), 'effects')
  require(report.context.animation === 'running', 'animation-not-running')
  // Exported configuration is immutable. Check the independently captured
  // end state too: a failed shader must not pass as its requested weather.
  const observed = report.observedContext ?? report.context
  require(observed.garden === expected.garden, 'observed-garden')
  require(observed.seed === expected.seed, 'observed-seed')
  require(observed.fpsLimit === expected.fpsLimit, 'observed-fps-limit')
  require(observed.effects === (expected.effects ? theme : 'none'), 'observed-effects')
  require(observed.animation === 'running', 'observed-animation-not-running')
  require(report.mode === 'collect', 'mode-not-collect')
  require(report.recording === (expected.requireRecording ?? false), 'recording-state')
  if (expected.requireCompleted ?? true) require(report.status === 'completed', 'run-not-completed')
  require(!report.disposed, 'collector-disposed')
  const minimumDuration = Math.max(0, (expected.durationMs ?? 0) - 100)
  require(Number.isFinite(report.elapsedMs) && report.elapsedMs >= minimumDuration, 'measurement-too-short')
  require(report.counts.ticks > 0 && report.tickIntervals.total > 0 && report.updateCpu.total > 0, 'missing-tick-samples')
  require(report.counts.renders > 0 && report.renderCpu.total > 0 && report.allRenderCpu.total > 0, 'missing-render-samples')
  if (expected.kind === 'steady') {
    require(Number.isFinite(report.activeMs) && report.activeMs >= minimumDuration, 'active-measurement-too-short')
    require(report.counts.generations === 0 && report.counts.ready === 0, 'steady-scene-rebuilt')
    require(report.preparationMs.total === 0 && report.apiWaitMs.total === 0 && report.totalReadyMs.total === 0, 'steady-preparation-samples')
  } else {
    require(report.counts.ready > 0 && report.counts.generations > 0, 'missing-preparation-samples')
  }
  if (expected.expectedReadyCount !== undefined) require(report.counts.ready === expected.expectedReadyCount, 'ready-count')
  if (expected.expectedGenerationCount !== undefined) require(report.counts.generations === expected.expectedGenerationCount, 'generation-count')
  if (expected.scenario === 'camera') {
    require((expected.movement?.samples ?? 0) > 4 && (expected.movement?.changes ?? 0) > 4, 'camera-did-not-move-continuously')
  }
  if (expected.scenario === 'pointer-wheel') {
    require((expected.interactions?.pointerMoves ?? 0) > 4 && expected.interactions?.wheels === gardenBenchmarkWheelSteps.length, 'input-not-consumed')
    require(report.counts.manualRenders > 4, 'input-did-not-render')
    require(expected.inputKind === 'trusted-playwright' || expected.inputKind === 'synthetic-events', 'input-kind-missing')
  }
  for (const error of expected.errors ?? []) reasons.push(`runtime-error: ${error}`)
  return { valid: reasons.length === 0, reasons, ...(expected.inputKind ? { inputKind: expected.inputKind } : {}) }
}

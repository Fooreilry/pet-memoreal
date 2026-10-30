import type { GardenDiagnostics, GardenDiagnosticsReport } from './gardenDiagnostics'

export type GardenDiagnosticRunValidation = NonNullable<GardenDiagnosticsReport['validation']>
export type GardenDiagnosticRunValidator = GardenDiagnosticRunValidation | ((report: GardenDiagnosticsReport) => GardenDiagnosticRunValidation)

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** Explicit recording sessions; the collector owns measurement and this owner keeps bounded results. */
export function createGardenDiagnosticRuns(collector: GardenDiagnostics, limit = 12) {
  const capacity = Math.max(1, Math.min(12, Number.isFinite(limit) ? Math.floor(limit) : 12))
  const completed: GardenDiagnosticsReport[] = []

  function stop(reason = 'manual', validate?: GardenDiagnosticRunValidator) {
    if (!collector.recording) return
    const report = collector.endRun(reason)
    if (!report) return
    if (validate) {
      const validation = typeof validate === 'function' ? validate(copy(report)) : validate
      report.validation = { valid: validation.valid, reasons: [...validation.reasons], ...(validation.inputKind ? { inputKind: validation.inputKind } : {}) }
    }
    completed.push(copy(report))
    if (completed.length > capacity) completed.splice(0, completed.length - capacity)
    return copy(report)
  }

  function start(scenario: string) {
    if (collector.recording) stop('restarted')
    return collector.beginRun(scenario)
  }

  function change(reason: string, apply: () => void) {
    const wasRecording = collector.recording
    const scenario = wasRecording ? collector.snapshot().scenario : ''
    if (wasRecording) stop(reason)
    apply()
    if (wasRecording) start(scenario)
  }

  return {
    start, stop, change,
    reports: () => copy(completed),
    find: (runId: string) => {
      const report = completed.find(result => result.runId === runId)
      return report ? copy(report) : undefined
    }
  }
}

export type GardenDiagnosticRuns = ReturnType<typeof createGardenDiagnosticRuns>

import type { Page } from '@playwright/test'
import { gardenBenchmarkProtocol, gardenBenchmarkWheelSteps, pointerAt } from '../../app/utils/gardenBenchmarkProtocol'

type InputDriver = {
  now: () => number
  wait: (ms: number) => Promise<void>
  move: (elapsedMs: number) => Promise<void>
  wheel: (deltaY: number) => Promise<void>
}

/** Wall-clock scheduling skips missed move slots instead of queuing a backlog. */
export async function runPointerInputTimeline(driver: InputDriver, durationMs: number, startedAt = driver.now()) {
  const interval = 1000 / gardenBenchmarkProtocol.pointerHz
  let nextMoveAt = 0, sentMoves = 0, sentWheels = 0
  while (true) {
    const elapsed = driver.now() - startedAt
    if (elapsed >= durationMs) break
    const nextWheelAt = sentWheels < gardenBenchmarkWheelSteps.length ? gardenBenchmarkWheelSteps[sentWheels]!.at * durationMs : Infinity
    const next = Math.min(nextMoveAt, nextWheelAt, durationMs)
    if (elapsed < next) { await driver.wait(next - elapsed); continue }
    // Every command gets a fresh deadline check at the top of the loop. Only
    // the eight prescribed wheel steps are retained; no move slots catch up.
    if (elapsed >= nextWheelAt) {
      await driver.wheel(gardenBenchmarkWheelSteps[sentWheels]!.deltaY)
      sentWheels++
      continue
    }
    await driver.move(elapsed)
    sentMoves++
    nextMoveAt = driver.now() - startedAt + interval
  }
  return { sentMoves, sentWheels, elapsedMs: driver.now() - startedAt }
}

export async function pointerWheelMeasurement(page: Page, viewport: { x: number, y: number, width: number, height: number }, durationMs: number = gardenBenchmarkProtocol.durationMs) {
  const started = performance.now()
  await page.mouse.down()
  let result: Awaited<ReturnType<typeof runPointerInputTimeline>>
  try {
    result = await runPointerInputTimeline({
      now: () => performance.now(), wait: ms => page.waitForTimeout(ms),
      move: async elapsed => {
        const point = pointerAt(elapsed, durationMs)
        await page.mouse.move(viewport.x + point.x * viewport.width, viewport.y + point.y * viewport.height)
      },
      wheel: deltaY => page.mouse.wheel(0, deltaY)
    }, durationMs, started)
  } finally { await page.mouse.up() }
  return { ...result, elapsedMs: performance.now() - started }
}

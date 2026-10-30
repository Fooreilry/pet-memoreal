import assert from 'node:assert/strict'
import test from 'node:test'
import { runPointerInputTimeline } from '../benchmarks/pointerInput'

function driver(moveLatency = 0, wheelLatency = 0) {
  let clock = 0
  const moves: { elapsed: number, at: number }[] = []
  const wheels: { delta: number, at: number }[] = []
  return {
    moves, wheels,
    input: {
      now: () => clock,
      wait: async (ms: number) => { clock += ms },
      move: async (elapsed: number) => { moves.push({ elapsed, at: clock }); clock += moveLatency },
      wheel: async (delta: number) => { wheels.push({ delta, at: clock }); clock += wheelLatency }
    }
  }
}

test('an unblocked driver follows the wall clock with all eight wheel events and no more than 30 move slots per second', async () => {
  const fixture = driver()
  const result = await runPointerInputTimeline(fixture.input, 1000)
  assert.ok(result.sentMoves >= 29 && result.sentMoves <= 31)
  assert.equal(result.sentWheels, 8)
  assert.equal(result.elapsedMs, 1000)
  assert.ok(fixture.moves.every(move => move.elapsed === move.at && move.at < 1000))
  assert.deepEqual(fixture.wheels.map(wheel => wheel.delta), [-120, -80, 60, -80, 80, -60, 100, 100])
  for (let index = 1; index < fixture.moves.length; index++) assert.ok(fixture.moves[index]!.at - fixture.moves[index - 1]!.at >= 1000 / 30 - 1e-9)
})

test('slow CDP input skips move slots and samples actual elapsed time instead of executing a fixed backlog', async () => {
  const fixture = driver(120, 20)
  const result = await runPointerInputTimeline(fixture.input, 1000)
  assert.ok(result.sentMoves <= 7, 'a slow driver must not catch up the original thirty positions')
  assert.ok(result.elapsedMs >= 1000 && result.elapsedMs <= 1120, 'only an already in-flight move may cross the deadline')
  assert.ok(fixture.moves.every(move => move.elapsed === move.at && move.at < 1000))
  assert.ok(fixture.wheels.every(wheel => wheel.at < 1000))
  for (let index = 1; index < fixture.moves.length; index++) assert.ok(fixture.moves[index]!.at - fixture.moves[index - 1]!.at >= 120 + 1000 / 30 - 1e-9)
})

test('a command crossing the deadline never causes late move or wheel catch-up commands', async () => {
  const fixture = driver(500)
  const result = await runPointerInputTimeline(fixture.input, 200)
  assert.equal(result.sentMoves, 1)
  assert.equal(result.sentWheels, 1)
  assert.equal(result.elapsedMs, 500)
  assert.deepEqual(fixture.moves, [{ elapsed: 0, at: 0 }])
})

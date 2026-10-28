import assert from 'node:assert/strict'
import test from 'node:test'
import { createReadinessCheck } from '../../server/utils/service-readiness'

test('readiness reuses only a recent successful database probe and expires after two seconds', async () => {
  let time = 0
  let calls = 0
  const check = createReadinessCheck(async () => { calls++ }, () => time)
  await check()
  assert.equal(calls, 1)
  time = 1999
  await check()
  assert.equal(calls, 1)
  time = 2000
  await check()
  assert.equal(calls, 2)
})

test('concurrent visitors share one in-flight readiness probe without caching their sessions', async () => {
  let finish!: () => void
  let calls = 0
  const check = createReadinessCheck(() => {
    calls++
    return new Promise<void>((resolve) => { finish = resolve })
  })
  const first = check()
  const second = check()
  assert.equal(first, second)
  await Promise.resolve()
  assert.equal(calls, 1)
  finish()
  await Promise.all([first, second])
  await check()
  assert.equal(calls, 1)
})

test('a failed shared probe is not cached and recovery is checked immediately', async () => {
  let calls = 0
  let available = false
  const unavailable = new Error('Database unavailable')
  const check = createReadinessCheck(async () => {
    calls++
    if (!available) throw unavailable
  }, () => 0)
  const failures = await Promise.allSettled([check(), check()])
  assert.equal(calls, 1)
  for (const result of failures) {
    assert.equal(result.status, 'rejected')
    if (result.status === 'rejected') assert.equal(result.reason, unavailable)
  }
  available = true
  await check()
  assert.equal(calls, 2)
  await check()
  assert.equal(calls, 2)
})

test('a synchronously throwing probe does not leave a rejected promise cached', async () => {
  let calls = 0
  const check = createReadinessCheck(() => {
    calls++
    if (calls === 1) throw new Error('Invalid database settings')
    return Promise.resolve()
  }, () => 0)
  await assert.rejects(check(), /Invalid database settings/)
  await check()
  assert.equal(calls, 2)
})

test('a failed probe after cache expiry does not reuse the old successful result', async () => {
  let time = 0
  let calls = 0
  const check = createReadinessCheck(async () => {
    calls++
    if (calls === 2) throw new Error('Database stopped')
  }, () => time)
  await check()
  time = 2000
  await assert.rejects(check(), /Database stopped/)
  await check()
  assert.equal(calls, 3)
})

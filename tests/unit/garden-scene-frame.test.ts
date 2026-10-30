import assert from 'node:assert/strict'
import test from 'node:test'
import { getGardenSceneFrame } from '../../app/utils/gardenSceneFrame'
import { gardenTransitionScale, gardenTransitionTiming } from '../../app/utils/gardenSceneTransition'

test('hidden scenery covers a complete pullback and its blur without changing the visible viewport', () => {
  for (const [width, height] of [[366, 780], [1400, 900], [1880, 540], [820, 300]]) {
    const frame = getGardenSceneFrame(width!, height!)
    assert.equal(frame.viewWidth, width)
    assert.equal(frame.viewHeight, height)
    assert.equal(frame.width, width! + frame.margin.x * 2)
    assert.equal(frame.height, height! + frame.margin.y * 2)
    for (const scale of Object.values(gardenTransitionScale)) {
      for (const [size, margin] of [[width!, frame.margin.x], [height!, frame.margin.y]]) {
        const edge = size! * (1 - scale) / 2 - margin! * scale
        assert.ok(edge <= -gardenTransitionTiming.blur * 3 * scale)
      }
    }
  }
})

test('overview retains its original backing size and invalid dimensions stay finite', () => {
  assert.deepEqual(getGardenSceneFrame(640, 480, false), { viewWidth: 640, viewHeight: 480, width: 640, height: 480, margin: { x: 0, y: 0 } })
  const frame = getGardenSceneFrame(Number.NaN, -1)
  assert.equal(frame.viewWidth, 1)
  assert.equal(frame.viewHeight, 1)
  assert.ok(Number.isFinite(frame.width) && Number.isFinite(frame.height))
})

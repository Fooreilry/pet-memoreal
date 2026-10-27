import assert from 'node:assert/strict'
import test from 'node:test'
import { getGardenEnvironmentBounds, getGardenEnvironmentSeed, getGardenOuterStream } from '../../app/data/gardenEnvironment'
import { getGardenLayout } from '../../app/data/gardenLayout'
import { getGardenProjection } from '../../app/utils/gardenProjection'

test('one environment envelope covers every camera view without regeneration during zoom and pan', () => {
  for (const [width, height] of [[366, 780], [1400, 900], [1880, 540], [820, 300], [500, 420]] as const) {
    const projection = getGardenProjection(width, height, 1200, 1000, 16)
    const bounds = getGardenEnvironmentBounds(width, height, projection)
    assert.ok(bounds.left < 0 && bounds.top < 0 && bounds.right > 1200 && bounds.bottom > 1000)
    const range = (view: number, content: number, zoom: number) => content * zoom <= view
      ? [content * (1 - zoom) / 2]
      : [view - (view - content) / 2 - content * zoom, -(view - content) / 2]
    for (const zoom of [1, 1.25, 1.6, 2.44, 4]) {
      for (const x of range(width, projection.width, zoom)) {
        for (const y of range(height, projection.height, zoom)) {
          const scale = projection.scale * zoom
          const left = -(projection.offsetX + x) / scale, top = -(projection.offsetY + y) / scale
          assert.ok(left >= bounds.left && top >= bounds.top)
          assert.ok(left + width / scale <= bounds.right && top + height / scale <= bounds.bottom)
        }
      }
    }
  }
})

test('outer scenery has a fixed garden seed independent of an authentication session', () => {
  assert.deepEqual((['meadow', 'lake', 'grove', 'hill'] as const).map(getGardenEnvironmentSeed), [6329, 9719, 4261, 8147])
})

test('hill stream continues through both former world edges with the original join points and width phase', () => {
  const bounds = { left: -128, right: 1344, top: -960, bottom: 1984 }
  const segments = getGardenOuterStream(bounds, 'hill')
  const core = getGardenLayout(1200, 1000, 'hill').features.stream
  assert.equal(segments.length, 2)
  assert.deepEqual(segments[0]!.points.at(-1), core[0])
  assert.deepEqual(segments[1]!.points[0], core.at(-1))
  assert.equal(segments[0]!.phase + segments[0]!.points.length - 1, 0)
  assert.equal(segments[1]!.phase, 24)
  assert.ok(segments[0]!.points[0]!.y <= bounds.top && segments[1]!.points.at(-1)!.y >= bounds.bottom)
  assert.deepEqual(getGardenOuterStream(bounds, 'meadow'), [])
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { Graphics } from 'pixi.js'
import { gardenIds } from '../../shared/gardens'
import { getGardenFrameLayout } from '../../app/data/gardenFrame'
import { getGardenLayout, sampleGardenCurve, setGardenSessionSeed } from '../../app/data/gardenLayout'
import { sceneryBounds, sceneryIntersects, streamBounds } from '../../app/data/gardenPlacement'
import { drawGardenFrame } from '../../app/utils/gardenChunkArt'

test('natural edge planting stays in its reserved band and keeps memorials, water and routes open across sessions', () => {
  try {
    for (const seed of [0, 7, 13291, 0xffffffff]) {
      setGardenSessionSeed(seed)
      for (const garden of gardenIds) {
        const first = getGardenFrameLayout(1200, 1000, garden)
        assert.deepEqual(first, getGardenFrameLayout(1200, 1000, garden))
        assert.ok(first.patches.length >= 20 && first.patches.length <= 36)
        assert.ok(first.details.length > 0 && first.details.length <= 18)
        const layout = getGardenLayout(1200, 1000, garden)
        const obstacles = [
          ...layout.chunks.map(chunk => chunk.protectedBounds),
          ...layout.features.ponds.map(pond => sceneryBounds(pond.x, pond.y, pond.rx, pond.ry, pond.ry)),
          ...streamBounds(layout.features.stream, 25),
          ...layout.paths.flatMap(path => streamBounds(Array.from({ length: 49 }, (_, index) => sampleGardenCurve(path.curve, index / 48)), path.width / 2 + 8))
        ]
        for (const patch of first.patches) {
          const bounds = sceneryBounds(patch.x, patch.y, patch.rx, patch.ry, patch.ry)
          assert.ok(bounds.left >= 0 && bounds.right <= 1200 && bounds.top >= 0 && bounds.bottom <= 1000)
          assert.ok(bounds.right <= 60 || bounds.left >= 1140 || bounds.bottom <= 60 || bounds.top >= 940, 'banks must remain in the reserved edge strip')
          assert.equal(obstacles.some(obstacle => sceneryIntersects(bounds, obstacle)), false, `${garden} edge bank crosses an occupied area`)
        }
        for (let side = 0; side < 4; side++) {
          const horizontal = side < 2, length = horizontal ? 1200 : 1000
          const intervals = first.patches.map(patch => sceneryBounds(patch.x, patch.y, patch.rx, patch.ry, patch.ry))
            .filter(bounds => side === 0 ? bounds.bottom <= 60 : side === 1 ? bounds.top >= 940 : side === 2 ? bounds.right <= 60 : bounds.left >= 1140)
            .map(bounds => horizontal ? [bounds.left, bounds.right] : [bounds.top, bounds.bottom])
            .sort((a, b) => a[0]! - b[0]!)
          let end = 0, gap = 0
          for (const interval of intervals) {
            gap = Math.max(gap, interval[0]! - end)
            end = Math.max(end, interval[1]!)
          }
          assert.ok(Math.max(gap, length - end) >= length * 0.08, 'turf groups must leave generous breaks instead of forming a continuous fence')
        }
      }
    }
  } finally { setGardenSessionSeed(0) }
})

test('edge artwork uses bounded static fill geometry without rectangular strokes, filters or external textures', () => {
  for (const garden of gardenIds) {
    const first = new Graphics(), second = new Graphics()
    const contexts = [first.context, second.context]
    try {
      drawGardenFrame(first, 1200, 1000, garden)
      drawGardenFrame(second, 1200, 1000, garden)
      assert.deepEqual(first.bounds, second.bounds)
      assert.ok(first.bounds.minX >= 0 && first.bounds.maxX <= 1200 && first.bounds.minY >= 0 && first.bounds.maxY <= 1000)
      assert.ok(first.context.instructions.length > 0 && first.context.instructions.length <= 3, 'the edge texture should batch into three flat materials')
      assert.ok(first.context.instructions.every(instruction => instruction.action === 'fill'), 'a natural perimeter must not restore the rectangular outline')
      assert.ok(!first.filters || first.filters.length === 0)
    } finally {
      first.destroy({ context: true })
      second.destroy({ context: true })
    }
    for (const context of contexts) assert.equal(context.destroyed, true)
  }
  const unfinished = new Graphics()
  try {
    drawGardenFrame(unfinished, 0, 0, 'meadow')
    assert.equal(unfinished.context.instructions.length, 0)
  } finally { unfinished.destroy({ context: true }) }
})

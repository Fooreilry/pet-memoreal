import assert from 'node:assert/strict'
import test from 'node:test'
import { Graphics } from 'pixi.js'
import { demoGardens } from '../../app/data/demoGardens'
import { getMemorialLayout } from '../../app/data/demoMemorials'
import { getGardenLayout } from '../../app/data/gardenLayout'
import { getGardenPaths, getPathSurface } from '../../app/data/gardenPaths'
import type { PathPoint } from '../../app/data/gardenPaths'
import { getLakeSceneryLayout } from '../../app/data/lakeScenery'
import { getGardenRoutePaths } from '../../app/data/gardenRoutes'
import { drawGardenPaths } from '../../app/utils/gardenPaths'

type Rect = { left: number, right: number, top: number, bottom: number }
const sizes = [[1200, 1000]] as const // The garden world is fixed; viewport changes only move the camera.
const previews = [[451, 276], [271, 371], [271, 608]] as const

function box(points: PathPoint[], margin = 0): Rect {
  return {
    left: Math.min(...points.map(point => point.x)) - margin,
    right: Math.max(...points.map(point => point.x)) + margin,
    top: Math.min(...points.map(point => point.y)) - margin,
    bottom: Math.max(...points.map(point => point.y)) + margin
  }
}

function intersects(a: Rect, b: Rect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function detailBounds(surface: ReturnType<typeof getPathSurface>, clearance = 0): Rect[] {
  return [
    ...surface.stones.map(stone => box(stone.points, clearance)),
    ...surface.tufts.map(point => ({ left: point.x - 3.8 - clearance, right: point.x + 3.8 + clearance,
      top: point.y - 3.35 - clearance, bottom: point.y + 1.6 + clearance }))
  ]
}

test('garden-specific routes are deterministic and keep a bounded detail budget', () => {
  for (const { id } of demoGardens) {
    for (const [preview, dimensions] of [[false, sizes], [true, previews]] as const) {
      for (const [width, height] of dimensions) {
        const paths = getGardenPaths(width, height, id, preview)
        if (!preview) assert.deepEqual(paths, getGardenLayout(width, height, id).paths, 'rendered roads must follow the shared plan')
        const places = preview ? [] : getMemorialLayout(width, height, id).places
        assert.deepEqual(getGardenPaths(width, height, id, preview), paths)
        assert.equal(paths.length, id === 'hill' ? 0 : id === 'grove' ? 2 : id === 'meadow' && !preview ? 2 : 1)
        let stones = 0
        for (const path of paths) {
          assert.ok(path.width >= 9 && path.width <= 24)
          assert.equal(path.curve.length, 4)
          const surface = getPathSurface(path, preview, places)
          assert.deepEqual(surface, getPathSurface(path, preview, places))
          assert.equal(surface.left.length, surface.right.length)
          assert.ok(surface.left.length >= 7 && surface.left.length <= (preview ? 17 : 73))
          assert.ok(surface.stones.length <= (preview ? 32 : 144))
          assert.ok(surface.tufts.length <= (preview ? 6 : 24))
          for (const point of [...path.curve, ...surface.left, ...surface.right, ...surface.tufts, ...surface.stones.flatMap(stone => stone.points)]) {
            assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y))
            assert.ok(point.x >= 0 && point.x <= width)
            assert.ok(point.y >= 0 && point.y <= (preview ? height - 99 : height))
          }
          for (const stone of surface.stones) {
            assert.equal(stone.points.length, 8)
            assert.ok(Number.isInteger(stone.tone) && stone.tone >= 0 && stone.tone < 4)
            if (preview) assert.equal(stone.cracked, false, 'preview tiles omit fine cracks')
          }
          stones += surface.stones.length
        }
        assert.equal(stones > 0, id !== 'hill', 'only gardens with a trail need generated stone details')
      }
    }
  }
})

test('each garden keeps its own geography rather than sharing a full-map central road', () => {
  const meadow = getGardenRoutePaths('meadow')
  assert.deepEqual(meadow[0]!.curve.at(-1), meadow[1]!.curve[0], 'the meadow footpath joins without a gap')
  assert.ok(meadow[0]!.curve[0].x < 120 && meadow[1]!.curve.at(-1)!.x > 1050)
  assert.ok(meadow[0]!.curve[0].y - meadow[1]!.curve.at(-1)!.y > 300, 'the trail wanders diagonally through the meadow')
  const grove = getGardenRoutePaths('grove')
  assert.ok(grove[0]!.curve.every(point => point.x <= 320), 'the left forest trail stays near its side')
  assert.ok(grove[1]!.curve.every(point => point.x >= 900), 'the right forest trail leaves the centre open')
  const shore = getGardenRoutePaths('lake')
  assert.equal(shore.length, 1)
  assert.ok(shore[0]!.curve.every(point => point.y >= 100 && point.y <= 380), 'the bank walk is local to the upper lake')
  assert.ok(Math.hypot(shore[0]!.curve[0].x - shore[0]!.curve[3].x, shore[0]!.curve[0].y - shore[0]!.curve[3].y) < 350)
  assert.deepEqual(getGardenRoutePaths('hill'), [], 'the hill keeps its stream and unpaved rolling ground')
})

test('pavers and verge tufts reserve memorial targets and labels with three pixels of clearance', () => {
  for (const { id } of demoGardens) {
    for (const [width, height] of sizes) {
      const places = getMemorialLayout(width, height, id).places
      const protectedPlaces = places.map(place => ({ left: place.x - 70, right: place.x + 70, top: place.y - 55, bottom: place.y + 70 }))
      for (const path of getGardenPaths(width, height, id, false)) {
        const surface = getPathSurface(path, false, places)
        for (const detail of detailBounds(surface, 3)) {
          for (const [index, reserved] of protectedPlaces.entries()) {
            assert.equal(intersects(detail, reserved), false, `${id} paving overlaps place ${index + 1} at ${width}×${height}`)
          }
        }
      }
    }
  }
})

test('the short lake bank walk leaves planned water unpaved and the hill has no road', () => {
  for (const [width, height] of sizes) {
    const ponds = getLakeSceneryLayout(width, height).ponds.map(pond => ({ left: pond.x - pond.rx - 9, right: pond.x + pond.rx + 9, top: pond.y - pond.ry - 7, bottom: pond.y + pond.ry + 7 }))
    const places = getMemorialLayout(width, height, 'lake').places
    for (const path of getGardenPaths(width, height, 'lake', false)) {
      const surface = getPathSurface(path, false, places)
      for (const detail of detailBounds(surface)) {
        for (const pond of ponds) assert.equal(intersects(detail, pond), false, `lake stonework overlaps water at ${width}×${height}`)
      }
    }
    assert.deepEqual(getGardenPaths(width, height, 'hill', false), [])
  }
})

test('path rendering batches materials, keeps repeatable bounds and releases every graphics context', () => {
  for (const { id } of demoGardens) {
    for (const [preview, dimensions] of [[false, sizes], [true, previews]] as const) {
      for (const [width, height] of dimensions) {
        const first = new Graphics()
        const second = new Graphics()
        const contexts = [first.context, second.context]
        try {
          drawGardenPaths(first, width, height, id, preview)
          drawGardenPaths(second, width, height, id, preview)
          const firstBounds = { left: first.bounds.minX, right: first.bounds.maxX, top: first.bounds.minY, bottom: first.bounds.maxY }
          assert.deepEqual(firstBounds, { left: second.bounds.minX, right: second.bounds.maxX, top: second.bounds.minY, bottom: second.bounds.maxY })
          const count = first.context.instructions.length
          const paths = getGardenPaths(width, height, id, preview)
          if (paths.length) {
            assert.ok(firstBounds.left >= 0 && firstBounds.right <= width)
            assert.ok(firstBounds.top >= 0 && firstBounds.bottom <= (preview ? height - 99 : height))
            assert.ok(count > 0 && count <= paths.length * 14, 'geometry is batched by material rather than one fill per paver')
          } else assert.equal(count, 0, 'an unpaved garden creates no invisible path geometry')
          assert.equal(count, second.context.instructions.length)
          assert.deepEqual(first.context.instructions.map(instruction => instruction.action), second.context.instructions.map(instruction => instruction.action))
          assert.ok(!first.filters || first.filters.length === 0)
          assert.equal(first.children.length, 0, 'pavers do not allocate individual scene objects')
        } finally {
          first.destroy({ context: true })
          second.destroy({ context: true })
        }
        for (const context of contexts) assert.equal(context.destroyed, true)
      }
    }
  }
})

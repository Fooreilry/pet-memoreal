import assert from 'node:assert/strict'
import test from 'node:test'
import { Graphics } from 'pixi.js'
import { getHillSceneryLayout, hillRockKinds } from '../../app/data/hillScenery'
import { getMemorialLayout } from '../../app/data/demoMemorials'
import { drawHillLandscape } from '../../app/utils/hillScenery'

type Rect = { left: number, right: number, top: number, bottom: number }
const fullSizes = [[1000, 650], [1200, 900], [640, 1340], [1900, 650]] as const
const previewSizes = [[451, 276], [271, 371], [271, 608]] as const

function intersects(a: Rect, b: Rect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function inside(rect: Rect, width: number, height: number) {
  assert.ok(rect.left >= 0 && rect.right <= width, 'scenery must fit the world width')
  assert.ok(rect.top >= 0 && rect.bottom <= height, 'scenery must fit the world height')
}

test('hill scenery is deterministic, bounded and includes four different rock forms at desktop and mobile sizes', () => {
  for (const [width, height] of fullSizes) {
    const first = getHillSceneryLayout(width, height)
    assert.deepEqual(getHillSceneryLayout(width, height), first)
    assert.deepEqual(new Set(first.rocks.map(rock => rock.kind)), new Set(hillRockKinds))
    assert.ok(first.rocks.length > 0 && first.rocks.length <= 36)
    assert.ok(first.shrubs.length > 0 && first.shrubs.length <= 36)
    assert.equal(first.stream.length, 25)
    assert.equal(first.stream[0]!.y, 0, 'the stream enters through the world edge')
    assert.equal(first.stream.at(-1)!.y, height, 'the stream leaves through the world edge')
    for (const rock of first.rocks) {
      assert.ok(rock.size > 0)
      inside({ left: rock.x - rock.size * 1.6, right: rock.x + rock.size * 1.6, top: rock.y - rock.size * 1.5, bottom: rock.y + rock.size * 0.85 }, width, height)
    }
    for (const shrub of first.shrubs) {
      assert.ok(shrub.size > 0)
      inside({ left: shrub.x - shrub.size * 1.4, right: shrub.x + shrub.size * 1.4, top: shrub.y - shrub.size * 1.5, bottom: shrub.y + shrub.size * 0.55 }, width, height)
    }
    for (const [index, point] of first.stream.entries()) {
      inside({ left: point.x - 16.5, right: point.x + 16.5, top: point.y, bottom: point.y }, width, height)
      if (index > 0) assert.ok(point.y > first.stream[index - 1]!.y, 'the stream should descend without doubling back')
    }
  }
})

test('rocks, shrubs and the full stream corridor leave every memorial target and name clear', () => {
  for (const [width, height] of fullSizes) {
    const { rocks, shrubs, stream } = getHillSceneryLayout(width, height)
    const protectedPlaces = getMemorialLayout(width, height, 'hill').places.map(place => ({
      left: place.x - 65, right: place.x + 65, top: place.y - 52, bottom: place.y + 65
    }))
    const scenery: Rect[] = [
      ...rocks.map(rock => ({ left: rock.x - rock.size * 1.6, right: rock.x + rock.size * 1.6, top: rock.y - rock.size * 1.5, bottom: rock.y + rock.size * 0.85 })),
      ...shrubs.map(shrub => ({ left: shrub.x - shrub.size * 1.4, right: shrub.x + shrub.size * 1.4, top: shrub.y - shrub.size * 1.5, bottom: shrub.y + shrub.size * 0.55 })),
      ...stream.slice(1).map((point, index) => ({
        left: Math.min(point.x, stream[index]!.x) - 16.5,
        right: Math.max(point.x, stream[index]!.x) + 16.5,
        top: stream[index]!.y - 16.5,
        bottom: point.y + 16.5
      }))
    ]
    for (const decoration of scenery) {
      for (const place of protectedPlaces) assert.equal(intersects(decoration, place), false, `decoration overlaps a memorial at ${width}×${height}`)
    }
  }
})

test('overview hill scenery remains deterministic and has all four rock forms within its tile', () => {
  for (const [width, height] of previewSizes) {
    const layout = getHillSceneryLayout(width, height, true)
    assert.deepEqual(getHillSceneryLayout(width, height, true), layout)
    assert.deepEqual(new Set(layout.rocks.map(rock => rock.kind)), new Set(hillRockKinds))
    assert.ok(layout.rocks.length <= 8 && layout.shrubs.length <= 8)
    assert.equal(layout.stream.length, 25)
    for (const point of [...layout.rocks, ...layout.shrubs, ...layout.stream]) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y))
      assert.ok(point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height)
    }
  }
})

test('full and overview hill artwork uses bounded static geometry with repeatable bounds', () => {
  for (const [preview, sizes] of [[false, fullSizes], [true, previewSizes]] as const) {
    for (const [width, height] of sizes) {
      const first = new Graphics()
      const second = new Graphics()
      const firstContext = first.context
      const secondContext = second.context
      try {
        drawHillLandscape(first, width, height, preview)
        drawHillLandscape(second, width, height, preview)
        const bounds = { left: first.bounds.minX, right: first.bounds.maxX, top: first.bounds.minY, bottom: first.bounds.maxY }
        inside(bounds, width, height)
        assert.ok(first.bounds.width > width * 0.7 && first.bounds.height > height * 0.7)
        assert.deepEqual({ left: second.bounds.minX, right: second.bounds.maxX, top: second.bounds.minY, bottom: second.bounds.maxY }, bounds)
        assert.equal(second.context.instructions.length, first.context.instructions.length)
        assert.ok(first.context.instructions.length > 0 && first.context.instructions.length < 2000, 'hill details must have a bounded drawing budget')
      } finally {
        first.destroy({ context: true })
        second.destroy({ context: true })
      }
      assert.equal(firstContext.destroyed, true)
      assert.equal(secondContext.destroyed, true)
    }
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { Graphics } from 'pixi.js'
import { getMeadowSceneryLayout } from '../../app/data/meadowScenery'
import { getMemorialLayout } from '../../app/data/demoMemorials'
import { drawClover, drawFlowerSpires, drawMeadowLandscape } from '../../app/utils/meadowScenery'

type Rect = { left: number, right: number, top: number, bottom: number }
type Layout = ReturnType<typeof getMeadowSceneryLayout>
const fullSizes = [[1200, 1000]] as const // The garden world is fixed; viewport changes only move the camera.
const previewSizes = [[451, 276], [271, 371], [271, 608]] as const

function footprint(x: number, y: number, rx: number, up: number, down: number): Rect {
  return { left: x - rx, right: x + rx, top: y - up, bottom: y + down }
}

function propBounds(layout: Layout): Rect[] {
  return [
    ...layout.flowers.map(p => p.kind === 'spire' ? footprint(p.x, p.y, p.size * 0.85, p.size * 1.6, 5) : footprint(p.x, p.y, 26, 17, 18)),
    ...layout.grass.map(p => footprint(p.x, p.y, p.size, p.size + 2, 5)),
    ...layout.clover.map(p => footprint(p.x, p.y, p.size * 1.4, p.size * 1.1, p.size * 0.7)),
    ...layout.shrubs.map(p => footprint(p.x, p.y, p.size * 1.4, p.size * 1.5, p.size * 0.55)),
    // Include the lantern's soft drawn halo, not only the solid lamp body.
    ...layout.lanterns.map(p => footprint(p.x, p.y, 28, 37, 19))
  ]
}

function inside(rect: Rect, width: number, height: number) {
  for (const value of Object.values(rect)) assert.ok(Number.isFinite(value), 'geometry must have finite bounds')
  assert.ok(rect.left >= 0 && rect.right <= width, 'scenery must fit the world width')
  assert.ok(rect.top >= 0 && rect.bottom <= height, `scenery must fit the world height ${height}: ${JSON.stringify(rect)}`)
}

function bounds(g: Graphics): Rect {
  return { left: g.bounds.minX, right: g.bounds.maxX, top: g.bounds.minY, bottom: g.bounds.maxY }
}

test('meadow plants remain deterministic and sparse in the fixed garden world', () => {
  for (const [width, height] of fullSizes) {
    const layout = getMeadowSceneryLayout(width, height)
    assert.deepEqual(getMeadowSceneryLayout(width, height), layout)
    for (const [kind, limit] of [['flowers', 49], ['grass', 49], ['clover', 14], ['shrubs', 6], ['lanterns', 2]] as const) {
      assert.ok(layout[kind].length > 0, `${kind} should remain present at ${width}×${height}`)
      assert.ok(layout[kind].length <= limit, `${kind} should have a fixed construction budget`)
    }
    assert.deepEqual(new Set(layout.flowers.map(flower => flower.kind)), new Set(['wildflower', 'spire']))
    for (const plant of [...layout.flowers, ...layout.grass, ...layout.clover, ...layout.shrubs]) {
      assert.ok(plant.size > 0 && Number.isFinite(plant.size))
      assert.ok(Number.isInteger(plant.seed))
    }
    for (const prop of propBounds(layout)) inside(prop, width, height)
  }
})

test('meadow flowers, grass, clover and shrubs reserve all twelve memorial targets and names', () => {
  for (const [width, height] of fullSizes) {
    const places = getMemorialLayout(width, height, 'meadow').places
    assert.equal(places.length, 12)
    assert.equal(places.filter(place => !place.memorial).length, 8)
    for (const prop of propBounds(getMeadowSceneryLayout(width, height))) {
      for (const place of places) {
        const overlap = prop.left < place.x + 70 && prop.right > place.x - 70
          && prop.top < place.y + 70 && prop.bottom > place.y - 55
        assert.equal(overlap, false, `scenery obscures place ${place.place} at ${width}×${height}`)
      }
    }
  }
})

test('overview meadow planting remains populated within its tile above the title panel', () => {
  for (const [width, height] of previewSizes) {
    const layout = getMeadowSceneryLayout(width, height, true)
    assert.deepEqual(getMeadowSceneryLayout(width, height, true), layout)
    assert.ok(layout.flowers.length > 0 && layout.flowers.length <= 20)
    assert.ok(layout.grass.length > 0 && layout.grass.length <= 12)
    assert.ok(layout.clover.length > 0 && layout.clover.length <= 6)
    assert.ok(layout.shrubs.length > 0 && layout.shrubs.length <= 2)
    assert.equal(layout.lanterns.length, 0)
    for (const prop of propBounds(layout)) inside(prop, width, height - 99)
  }
})

test('meadow texture and scenery use repeatable bounded static geometry and release their contexts', () => {
  for (const [preview, sizes] of [[false, fullSizes], [true, previewSizes]] as const) {
    for (const [width, height] of sizes) {
      const first = new Graphics()
      const second = new Graphics()
      const contexts = [first.context, second.context]
      try {
        drawMeadowLandscape(first, width, height, preview)
        drawMeadowLandscape(second, width, height, preview)
        inside(bounds(first), width, preview ? height - 99 : height)
        assert.deepEqual(bounds(first), bounds(second))
        assert.ok(first.bounds.width > width * 0.7)
        assert.ok(first.bounds.height > (preview ? height - 99 : height) * 0.7)
        assert.ok(first.context.instructions.length > 0 && first.context.instructions.length < 3500, 'meadow details should have a bounded drawing budget')
        assert.equal(first.context.instructions.length, second.context.instructions.length)
      } finally {
        first.destroy({ context: true })
        second.destroy({ context: true })
      }
      for (const context of contexts) assert.equal(context.destroyed, true)
    }
  }
})

test('clover and flower spires fit their placement footprints with a small static instruction budget', () => {
  for (const size of [13, 16, 18]) {
    for (const seed of [0, 1, 2, 3, 4]) {
      for (const [draw, expected] of [
        [drawClover, footprint(0, 0, size * 1.4, size * 1.1, size * 0.7)],
        [drawFlowerSpires, footprint(0, 0, size * 0.85, size * 1.6, 5)]
      ] as const) {
        const graphic = new Graphics()
        const context = graphic.context
        try {
          draw(graphic, { x: 0, y: 0, size, seed })
          const actual = bounds(graphic)
          assert.ok(actual.left >= expected.left && actual.right <= expected.right)
          assert.ok(actual.top >= expected.top && actual.bottom <= expected.bottom)
          assert.ok(context.instructions.length > 0 && context.instructions.length < 50)
        } finally { graphic.destroy({ context: true }) }
        assert.equal(context.destroyed, true)
      }
    }
  }
})

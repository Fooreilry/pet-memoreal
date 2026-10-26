import assert from 'node:assert/strict'
import test from 'node:test'
import { Container, Graphics } from 'pixi.js'
import { getLakeSceneryLayout } from '../../app/data/lakeScenery'
import { getMemorialLayout } from '../../app/data/demoMemorials'
import { getGardenPlantLayout, plantKinds } from '../../app/data/gardenPlants'
import { drawGardenPlant } from '../../app/utils/gardenBotany'
import { drawLakeLandscape } from '../../app/utils/lakeScenery'
import { createLakeAmbience } from '../../app/utils/lakeAmbience'
import { gardenIds } from '../../shared/gardens'
import type { LakePond } from '../../app/data/lakeScenery'

type Rect = { left: number, right: number, top: number, bottom: number }
const fullSizes = [[1000, 650], [640, 840], [640, 1340], [1900, 650]] as const
const previewSizes = [[451, 276], [271, 371], [271, 608]] as const

function intersects(a: Rect, b: Rect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function inside(rect: Rect, width: number, height: number) {
  for (const value of Object.values(rect)) assert.ok(Number.isFinite(value), 'scenery must have finite geometry')
  assert.ok(rect.left >= 0 && rect.right <= width, 'scenery must fit the world width')
  assert.ok(rect.top >= 0 && rect.bottom <= height, 'scenery must fit the world height')
}

function waterContains(rect: Rect, pond: LakePond) {
  return [rect.left, rect.right].every(x => [rect.top, rect.bottom].every(y =>
    ((x - pond.x) / pond.rx) ** 2 + ((y - pond.y) / pond.ry) ** 2 <= 1))
}

function protectedPlaces(width: number, height: number) {
  return getMemorialLayout(width, height, 'lake').places.map(place => ({
    left: place.x - 65, right: place.x + 65, top: place.y - 52, bottom: place.y + 65
  }))
}

function bounds(node: Container): Rect {
  const box = node.getBounds()
  return { left: box.minX, right: box.maxX, top: box.minY, bottom: box.maxY }
}

test('lake water and banks are deterministic and leave all ten memorial places and names clear', () => {
  for (const [width, height] of fullSizes) {
    const layout = getLakeSceneryLayout(width, height)
    assert.deepEqual(getLakeSceneryLayout(width, height), layout)
    assert.equal(getMemorialLayout(width, height, 'lake').places.length, 10)
    assert.equal(layout.ponds.length, 2)
    assert.ok(layout.lilies.length > 0 && layout.lilies.length <= 8)
    assert.ok(layout.reeds.length > 0 && layout.reeds.length <= 18)
    assert.ok(layout.shrubs.length <= 12 && layout.trees.length <= 12 && layout.lanterns.length <= 4)
    for (const pond of layout.ponds) {
      assert.ok(pond.rx > 0 && pond.ry > 0)
      const shore = { left: pond.x - pond.rx - 10, right: pond.x + pond.rx + 10, top: pond.y - pond.ry - 10, bottom: pond.y + pond.ry + 10 }
      inside(shore, width, height)
      for (const place of protectedPlaces(width, height)) assert.equal(intersects(shore, place), false, `water crosses a memorial at ${width}×${height}`)
    }
  }
})

test('the former right-hand pool is replaced by sparse low greenery and pebbles', () => {
  for (const [width, height] of fullSizes) {
    const layout = getLakeSceneryLayout(width, height)
    assert.ok(layout.ponds.every(pond => pond.rx > pond.ry), 'the tall narrow right pool must be absent')
    const bankShrubs = layout.shrubs.filter(plant => plant.x > width - 65)
    const bankReeds = layout.reeds.filter(plant => plant.x > width - 65)
    assert.equal(bankShrubs.length, 3)
    assert.equal(bankReeds.length, 3)
    assert.equal(layout.pebbles.length, 6)
    const footprints = [
      ...bankShrubs.map(p => ({ left: p.x - p.size * 1.4, right: p.x + p.size * 1.4, top: p.y - p.size * 1.5, bottom: p.y + p.size * 0.55 })),
      ...bankReeds.map(p => ({ left: p.x - p.size * 1.3, right: p.x + p.size * 1.3, top: p.y - p.size * 1.6, bottom: p.y + p.size * 0.45 })),
      ...layout.pebbles.map(p => ({ left: p.x - p.size * 1.5, right: p.x + p.size * 1.5, top: p.y - p.size, bottom: p.y + p.size * 0.6 }))
    ]
    for (const footprint of footprints) {
      inside(footprint, width, height)
      for (const place of protectedPlaces(width, height)) assert.equal(intersects(footprint, place), false)
      for (const pond of layout.ponds) assert.equal(intersects(footprint, {
        left: pond.x - pond.rx - 10, right: pond.x + pond.rx + 10, top: pond.y - pond.ry - 10, bottom: pond.y + pond.ry + 10
      }), false)
    }
    assert.deepEqual(getLakeSceneryLayout(width, height, true).pebbles, [], 'overview keeps its small original budget')
  }
})

test('lily pads and blooms remain on the water in full and overview compositions', () => {
  for (const [preview, sizes] of [[false, fullSizes], [true, previewSizes]] as const) {
    for (const [width, height] of sizes) {
      const layout = getLakeSceneryLayout(width, height, preview)
      assert.deepEqual(getLakeSceneryLayout(width, height, preview), layout)
      assert.ok(layout.lilies.some(lily => lily.bloom))
      for (const lily of layout.lilies) {
        assert.ok(lily.size > 0 && lily.size <= 9)
        // Includes the pad's offset shadow and the tallest flower petals.
        const pad = { left: lily.x - lily.size * 1.1 - 1, right: lily.x + lily.size * 1.1 + 1, top: lily.y - lily.size * 1.5 - 2, bottom: lily.y + lily.size * 1.5 + 2 }
        assert.ok(layout.ponds.some(pond => waterContains(pad, pond)), 'a lily and its bloom must stay inside a pond')
      }
      for (const pond of layout.ponds) {
        inside({ left: pond.x - pond.rx - 10, right: pond.x + pond.rx + 10, top: pond.y - pond.ry - 10, bottom: pond.y + pond.ry + 10 }, width, preview ? height - 99 : height)
      }
    }
  }
})

test('lake scenery uses repeatable bounded static drawing work and releases its context', () => {
  for (const [preview, sizes] of [[false, fullSizes], [true, previewSizes]] as const) {
    for (const [width, height] of sizes) {
      const first = new Graphics()
      const second = new Graphics()
      const contexts = [first.context, second.context]
      try {
        drawLakeLandscape(first, width, height, preview)
        drawLakeLandscape(second, width, height, preview)
        const actual = bounds(first)
        inside(actual, width, height)
        assert.ok(actual.right - actual.left > width * 0.6)
        assert.deepEqual(bounds(second), actual)
        assert.ok(first.context.instructions.length > 0 && first.context.instructions.length < 2500, 'static lake details must have a bounded drawing budget')
        assert.equal(second.context.instructions.length, first.context.instructions.length)
      } finally {
        first.destroy({ context: true })
        second.destroy({ context: true })
      }
      for (const context of contexts) assert.equal(context.destroyed, true)
    }
  }
})

test('small mist wisps and ripples animate inside water without filters or rebuilt geometry', () => {
  for (const [width, height] of fullSizes) {
    const parent = new Container()
    const { ponds } = getLakeSceneryLayout(width, height)
    const update = createLakeAmbience(parent, width, height)
    const children = [...parent.children]
    assert.equal(children.length, 5)
    const graphics = children.flatMap(child => child instanceof Graphics ? [child] : child.children as Graphics[])
    const contexts = graphics.map(graphic => graphic.context)
    const instructions = contexts.map(context => ({ array: context.instructions, count: context.instructions.length }))
    try {
      assert.equal(children.filter(child => !(child instanceof Graphics)).length, 2)
      for (const child of children) {
        assert.equal(child.eventMode, 'none')
        assert.ok(!child.filters || child.filters.length === 0)
      }
      update(0)
      assert.ok(children[0]!.alpha > 0 && children[1]!.alpha > 0, 'reduced-motion rendering must retain a light static mist')
      const firstPositions = children.map(child => [child.x, child.y, child.scale.x, child.alpha])
      for (let step = 0; step < 120; step++) {
        update(step * 1.3)
        for (const [index, child] of children.entries()) {
          const box = bounds(child)
          inside(box, width, height)
          const pond = index === 1 || index === 4 ? ponds.at(-1)! : ponds[0]!
          assert.ok(waterContains(box, pond), 'mist and ripple extents including drift must remain over water')
          for (const place of protectedPlaces(width, height)) assert.equal(intersects(box, place), false)
          for (const value of [child.x, child.y, child.scale.x, child.alpha]) assert.ok(Number.isFinite(value))
          assert.ok(child.alpha >= 0 && child.alpha <= 1)
        }
      }
      assert.notDeepEqual(children.map(child => [child.x, child.y, child.scale.x, child.alpha]), firstPositions)
      assert.deepEqual(parent.children, children)
      graphics.forEach((graphic, index) => {
        assert.equal(graphic.context, contexts[index])
        assert.equal(graphic.context.instructions, instructions[index]!.array)
        assert.equal(graphic.context.instructions.length, instructions[index]!.count)
      })
    } finally { parent.destroy({ children: true, context: true }) }
    for (const context of contexts) assert.equal(context.destroyed, true)
  }
})

test('accent vegetation stays sparse, deterministic and clear of every garden memorial', () => {
  for (const garden of gardenIds) {
    for (const [preview, sizes] of [[false, fullSizes], [true, previewSizes]] as const) {
      for (const [width, height] of sizes) {
        const plants = getGardenPlantLayout(width, height, garden, preview)
        assert.deepEqual(getGardenPlantLayout(width, height, garden, preview), plants)
        assert.ok(plants.length <= (preview ? 3 : 8))
        if (!preview) assert.ok(plants.length > 0, `${garden} should receive a few new accent plants at ${width}×${height}`)
        for (const plant of plants) {
          assert.ok(plantKinds.includes(plant.kind))
          const footprint = { left: plant.x - plant.size * 1.3, right: plant.x + plant.size * 1.3, top: plant.y - plant.size * 1.6, bottom: plant.y + plant.size * 0.45 }
          inside(footprint, width, preview ? height - 99 : height)
          if (!preview) {
            for (const place of getMemorialLayout(width, height, garden).places) {
              assert.equal(intersects(footprint, { left: place.x - 65, right: place.x + 65, top: place.y - 52, bottom: place.y + 65 }), false)
            }
          }
        }
      }
    }
  }
})

test('fern, sedge and flowering sprig geometry fits its shared placement footprint', () => {
  for (const kind of plantKinds) {
    for (const size of [9, 11, 16, 17]) {
      const graphic = new Graphics()
      const context = graphic.context
      try {
        drawGardenPlant(graphic, { x: 0, y: 0, size, kind, seed: 3 })
        const actual = bounds(graphic)
        assert.ok(actual.left >= -size * 1.3 && actual.right <= size * 1.3)
        assert.ok(actual.top >= -size * 1.6 && actual.bottom <= size * 0.45)
        assert.ok(actual.right - actual.left > size * 0.5 && actual.bottom - actual.top > size * 0.8)
        assert.ok(context.instructions.length > 0 && context.instructions.length < 70)
      } finally { graphic.destroy({ context: true }) }
      assert.equal(context.destroyed, true)
    }
  }
})

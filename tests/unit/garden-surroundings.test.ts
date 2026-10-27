import assert from 'node:assert/strict'
import test from 'node:test'
import { Graphics } from 'pixi.js'
import { gardenIds } from '../../shared/gardens'
import { getGardenSurroundings, surroundingBudget, gardenWorldIntersects, gardenWorldContains } from '../../app/data/gardenSurroundings'
import { getGardenProjection } from '../../app/utils/gardenProjection'
import { drawGardenSurroundings } from '../../app/utils/gardenSurroundings'
import { getContinuousGroundLayout } from '../../app/utils/gardenContinuousGround'
import { getGardenSessionSeed, setGardenSessionSeed } from '../../app/data/gardenLayout'
import type { GardenView } from '../../app/utils/gardenProjection'

function worldView(width: number, height: number): GardenView {
  const projection = getGardenProjection(width, height, 1200, 1000, 16)
  return { left: -projection.offsetX / projection.scale - 64, right: (width - projection.offsetX) / projection.scale + 64,
    top: -projection.offsetY / projection.scale - 64, bottom: (height - projection.offsetY) / projection.scale + 64 }
}

test('world-scale outside planting stays clear of the core, route corridors and other plants in portrait and wide gardens', () => {
  for (const [width, height] of [[366, 780], [1400, 900], [1880, 540], [820, 300]]) {
    const bounds = worldView(width!, height!)
    const corridor = { left: -160, right: -120, top: bounds.top, bottom: bounds.bottom }
    for (const garden of gardenIds) {
      for (let seed = 1; seed <= 20; seed++) {
        const plan = getGardenSurroundings(bounds, garden, seed, [corridor])
        assert.ok(plan.plants.length > 0 && plan.plants.length <= surroundingBudget)
        assert.deepEqual(getGardenSurroundings(bounds, garden, seed, [corridor]), plan)
        for (const [index, plant] of plan.plants.entries()) {
          assert.ok(Object.values(plant.bounds).every(Number.isFinite))
          assert.ok(gardenWorldContains(bounds, plant.bounds))
          assert.equal(gardenWorldIntersects(plant.bounds, plan.map), false, 'static raised decorations must stay outside the central map')
          assert.equal(gardenWorldIntersects(plant.bounds, corridor), false, 'extended roads need a clear corridor')
          assert.ok(plan.plants.slice(index + 1).every(other => !gardenWorldIntersects(plant.bounds, other.bounds)))
          if (plant.kind === 'tree') assert.ok(plant.size >= 26 && plant.size <= 38, 'outside trees use the same world scale as the core')
        }
      }
    }
  }
})

test('expanding the world view preserves existing decoration and changing auth sessions does not move static outside props', () => {
  const originalSeed = getGardenSessionSeed()
  const inner = { left: -150, right: 1350, top: -250, bottom: 1250 }
  const outer = { left: -300, right: 1500, top: -400, bottom: 1400 }
  try {
    for (const garden of gardenIds) {
      const first = getGardenSurroundings(inner, garden, 719)
      const expanded = getGardenSurroundings(outer, garden, 719)
      for (const plant of first.plants) assert.deepEqual(expanded.plants.find(other => other.id === plant.id), plant)
      setGardenSessionSeed(41)
      assert.deepEqual(getGardenSurroundings(inner, garden, 719), first)
      setGardenSessionSeed(9001)
      assert.deepEqual(getGardenSurroundings(inner, garden, 719), first)
    }
  } finally { setGardenSessionSeed(originalSeed) }
})

test('continuous ground uses stable world cells on both sides of the former border and protects detailed memorial and route areas', () => {
  const inner = { left: -150, right: 1350, top: -250, bottom: 1250 }
  const outer = { left: -300, right: 1500, top: -400, bottom: 1400 }
  for (const garden of gardenIds) {
    const first = getContinuousGroundLayout(inner, garden, 719)
    const expanded = getContinuousGroundLayout(outer, garden, 719)
    for (const kind of ['patches', 'grass', 'moss', 'flecks'] as const) {
      for (const mark of first[kind]) assert.deepEqual(expanded[kind].find(other => other.id === mark.id), mark)
    }
    assert.ok(first.grass.some(mark => mark.x < 0 || mark.y < 0 || mark.x > 1200 || mark.y > 1000))
    assert.ok(first.grass.some(mark => mark.x > 0 && mark.x < 1200 && mark.y > 0 && mark.y < 1000))
    for (const mark of [...first.grass, ...first.moss, ...first.flecks]) {
      const footprint = { left: mark.x - mark.size - 1, right: mark.x + mark.size + 1, top: mark.y - mark.size - 1, bottom: mark.y + mark.size + 1 }
      assert.ok(first.obstacles.every(rect => !gardenWorldIntersects(footprint, rect)))
    }
  }
})

test('unified scenery remains inside a bounded world cache and releases its graphics context', () => {
  const bounds = worldView(366, 780)
  for (const garden of gardenIds) {
    const g = new Graphics()
    const context = g.context
    try {
      drawGardenSurroundings(g, bounds, garden, 5678)
      const art = g.getBounds()
      assert.ok(art.minX >= bounds.left - 1 && art.minY >= bounds.top - 1 && art.maxX <= bounds.right + 1 && art.maxY <= bounds.bottom + 1)
      assert.ok(g.context.instructions.length < 6500)
    } finally { g.destroy({ context: true }) }
    assert.ok(context.destroyed)
  }
  assert.deepEqual(getGardenSurroundings({ left: 0, right: 1, top: 0, bottom: 1 }, 'meadow', 1).plants, [])
})

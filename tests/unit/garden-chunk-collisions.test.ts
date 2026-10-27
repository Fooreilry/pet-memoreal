import assert from 'node:assert/strict'
import test from 'node:test'
import { gardenIds } from '../../shared/gardens'
import type { GardenId } from '../../shared/gardens'
import { getGardenWorldSize, setGardenSessionSeed } from '../../app/data/gardenLayout'
import { getMeadowSceneryLayout } from '../../app/data/meadowScenery'
import { getGroveSceneryLayout } from '../../app/data/groveScenery'
import { getHillSceneryLayout } from '../../app/data/hillScenery'
import { getLakeSceneryLayout } from '../../app/data/lakeScenery'
import { getGardenPlantLayout } from '../../app/data/gardenPlants'
import { createGardenPlacement, sceneryBounds, sceneryIntersects, streamBounds } from '../../app/data/gardenPlacement'
import type { SceneryRect } from '../../app/data/gardenPlacement'

const previews = [[451, 276], [271, 371], [271, 608]] as const

function primaryScenery(width: number, height: number, garden: GardenId, preview: boolean) {
  if (garden === 'meadow') {
    const layout = getMeadowSceneryLayout(width, height, preview)
    return { layout, count: layout.flowers.length + layout.grass.length + layout.clover.length + layout.shrubs.length + layout.lanterns.length, extra: [] }
  }
  if (garden === 'grove') {
    const layout = getGroveSceneryLayout(width, height, preview)
    return { layout, count: layout.trees.length + layout.shrubs.length + layout.grass.length + layout.flowers.length + layout.leaves.length + layout.lanterns.length, extra: [] }
  }
  if (garden === 'hill') {
    const layout = getHillSceneryLayout(width, height, preview)
    return { layout, count: layout.rocks.length + layout.shrubs.length, extra: preview ? streamBounds(layout.stream, 17) : [] }
  }
  const layout = getLakeSceneryLayout(width, height, preview)
  return { layout, count: layout.reeds.length + layout.shrubs.length + layout.trees.length + layout.lanterns.length + layout.pebbles.length,
    extra: preview ? layout.ponds.map(pond => sceneryBounds(pond.x, pond.y, pond.rx + 10, pond.ry + 10, pond.ry + 10)) : [] }
}

function inside(rect: SceneryRect, width: number, height: number) {
  assert.ok(Object.values(rect).every(Number.isFinite), 'all accepted footprint bounds must be finite')
  assert.ok(rect.left >= 8 && rect.right <= width - 8 && rect.top >= 8 && rect.bottom <= height - 8,
    `accepted scenery footprint leaves the garden: ${JSON.stringify(rect)}`)
}

function assertSceneryPlacement(width: number, height: number, garden: GardenId, preview: boolean, seed: number) {
  const context = `${garden} ${preview ? 'preview' : 'world'}, session ${seed}`
  const { layout, count, extra } = primaryScenery(width, height, garden, preview)
  const placement = createGardenPlacement(width, height, garden, preview, extra)
  const primary = layout.occupied
  assert.ok(primary.length > 0 && primary.length < 200, `${context} should remain populated within its construction budget`)
  assert.equal(primary.length, count, `${context}: each land prop must reserve its drawn footprint exactly once`)
  const accents = getGardenPlantLayout(width, height, garden, preview)
  assert.ok(accents.length <= (preview ? 3 : 8), context)
  if (!preview) assert.ok(accents.length > 0, `${context} should retain accent vegetation`)
  const footprints = [...primary, ...accents.map(plant => sceneryBounds(plant.x, plant.y, plant.size * 1.3, plant.size * 1.6, plant.size * 0.45))]
  for (const [index, rect] of footprints.entries()) {
    inside(rect, width, placement.artHeight)
    for (const obstacle of placement.obstacles) {
      assert.equal(sceneryIntersects(rect, obstacle), false,
        `${context}: prop ${index} overlaps a place, path or water corridor`)
    }
    for (const other of footprints.slice(index + 1)) {
      assert.equal(sceneryIntersects(rect, other), false, `${context} has overlapping static props`)
    }
  }
  return { layout, accents }
}

test('all primary props and chunk accents reserve non-overlapping footprints around places, paths and water', () => {
  try {
    setGardenSessionSeed(0)
    for (const garden of gardenIds) {
      const world = getGardenWorldSize(garden)
      for (const [preview, dimensions] of [[false, [[world.width, world.height]]], [true, previews]] as const) {
        for (const [width, height] of dimensions) assertSceneryPlacement(width, height, garden, preview, 0)
      }
    }
  } finally {
    setGardenSessionSeed(0)
  }
})

test('chunk vegetation remains deterministic when regenerated independently of the render cache', () => {
  for (const garden of gardenIds) {
    const { width, height } = getGardenWorldSize(garden)
    const first = primaryScenery(width, height, garden, false).layout
    const firstAccents = getGardenPlantLayout(width, height, garden, false)
    assert.deepEqual(primaryScenery(width, height, garden, false).layout, first)
    assert.deepEqual(getGardenPlantLayout(width, height, garden, false), firstAccents)
  }
})

test('20 nonzero session seeds keep all garden props collision free and repeatable after cache rebuilds', () => {
  try {
    for (let seed = 1; seed <= 20; seed++) {
      setGardenSessionSeed(seed)
      for (const garden of gardenIds) {
        const world = getGardenWorldSize(garden)
        for (const [preview, dimensions] of [[false, [[world.width, world.height]]], [true, previews]] as const) {
          for (const [width, height] of dimensions) {
            const first = assertSceneryPlacement(width, height, garden, preview, seed)
            // Changing and restoring the session forces the model cache to rebuild.
            setGardenSessionSeed(seed + 10_000)
            primaryScenery(width, height, garden, preview)
            setGardenSessionSeed(seed)
            assert.deepEqual(primaryScenery(width, height, garden, preview).layout, first.layout,
              `${garden}: primary scenery must retain the same session composition`)
            assert.deepEqual(getGardenPlantLayout(width, height, garden, preview), first.accents,
              `${garden}: accent vegetation must retain the same session composition`)
          }
        }
      }
    }
  } finally {
    setGardenSessionSeed(0)
  }
})

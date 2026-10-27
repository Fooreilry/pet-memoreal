import assert from 'node:assert/strict'
import test from 'node:test'
import { gardenIds } from '../../shared/gardens'
import { getGardenLayout, sampleGardenCurve, setGardenSessionSeed } from '../../app/data/gardenLayout'
import { getExtendedGardenPaths, getGardenExtendedRouteObstacles } from '../../app/data/gardenExtendedPaths'
import { getGardenRoutePaths } from '../../app/data/gardenRoutes'
import { getGardenCoreRouteEntrances } from '../../app/data/gardenPathEntrances'
import { getGardenPlantLayout, getPrimarySceneryBounds } from '../../app/data/gardenPlants'
import { sceneryBounds } from '../../app/data/gardenPlacement'
import type { GardenPath } from '../../app/data/gardenPaths'

const bounds = { left: -300, right: 1500, top: -800, bottom: 1800 }
const outside = (path: GardenPath) => path.curve.every(point => point.x <= 0 || point.x >= 1200 || point.y <= 0 || point.y >= 1000)
const reachesEdge = (path: GardenPath) => path.curve[3].x === bounds.left || path.curve[3].x === bounds.right || path.curve[3].y === bounds.top || path.curve[3].y === bounds.bottom

test('100 sessions keep every exposed trail continuous through the world edge without crossing existing core artwork', () => {
  try {
    for (const garden of gardenIds) {
      let fixedExterior: GardenPath[] | undefined
      let fixedObstacles: ReturnType<typeof getGardenExtendedRouteObstacles> | undefined
      const originals = getGardenRoutePaths(garden)
      for (let seed = 0; seed < 100; seed++) {
        setGardenSessionSeed(seed)
        const layout = getGardenLayout(1200, 1000, garden)
        const obstacles = [
          ...layout.places.map(place => sceneryBounds(place.x, place.y, 70, 55, 70)),
          ...layout.features.ponds.map(pond => sceneryBounds(pond.x, pond.y, pond.rx + 8, pond.ry + 8, pond.ry + 8)),
          ...getPrimarySceneryBounds(1200, 1000, garden, false),
          ...getGardenPlantLayout(1200, 1000, garden).map(plant => sceneryBounds(plant.x, plant.y, plant.size * 1.3, plant.size * 1.6, plant.size * 0.45))
        ]
        const paths = getExtendedGardenPaths(bounds, garden)
        assert.ok(paths.length < 90, 'route construction has a bounded static geometry budget')
        assert.equal(paths.filter(reachesEdge).length, garden === 'hill' ? 0 : garden === 'lake' ? 1 : 2)
        const exterior = paths.filter(outside)
        const reserves = getGardenExtendedRouteObstacles(bounds, garden)
        if (fixedExterior) assert.deepEqual(exterior, fixedExterior, 'outside road geometry and materials must not use the user session seed')
        if (fixedObstacles) assert.deepEqual(reserves, fixedObstacles, 'outer vegetation always reserves the same corridors')
        fixedExterior = exterior
        fixedObstacles = reserves
        for (const entrance of getGardenCoreRouteEntrances(garden)) {
          const first = paths.find(path => Math.hypot(path.curve[0].x - entrance.curve[0].x, path.curve[0].y - entrance.curve[0].y) < 0.01)
          assert.ok(first, 'each original exposed endpoint has a connected continuation')
          const a = { x: first.curve[1].x - first.curve[0].x, y: first.curve[1].y - first.curve[0].y }
          const b = { x: entrance.curve[1].x - entrance.curve[0].x, y: entrance.curve[1].y - entrance.curve[0].y }
          assert.ok(Math.abs(a.x * b.y - a.y * b.x) < 1e-5 && a.x * b.x + a.y * b.y > 0, 'the original tangent continues smoothly')
        }
        for (const [index, path] of paths.entries()) {
          if (index && !reachesEdge(paths[index - 1]!)) assert.deepEqual(path.curve[0], paths[index - 1]!.curve[3], 'successive route segments join exactly')
          for (let sample = 0; sample <= 64; sample++) {
            const point = sampleGardenCurve(path.curve, sample / 64), radius = path.width / 2 + 2.5
            assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y))
            assert.ok(obstacles.every(rect => point.x <= rect.left - radius || point.x >= rect.right + radius || point.y <= rect.top - radius || point.y >= rect.bottom + radius), `${garden}:${seed} continuation overlaps a memorial, water or existing prop`)
          }
        }
        assert.deepEqual(getGardenRoutePaths(garden), originals, 'continuations never rewrite core routes')
      }
    }
  } finally { setGardenSessionSeed(0) }
})

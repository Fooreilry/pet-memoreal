import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import { gardenCapacity, gardenIds } from '../../shared/gardens'
import { getMemorialLayout } from '../../app/data/demoMemorials'
import { gardenPlaceBounds, gardenRectsIntersect, getGardenLayout, getGardenSessionSeed, getGardenWorldSize, sampleGardenCurve, setGardenSessionSeed } from '../../app/data/gardenLayout'
import type { GardenLayout, GardenRect } from '../../app/data/gardenLayout'
import type { PublicMemorial } from '../../shared/memorials'

function box(x: number, y: number, rx: number, ry: number): GardenRect {
  return { left: x - rx, right: x + rx, top: y - ry, bottom: y + ry }
}

afterEach(() => setGardenSessionSeed(0))

function assertClearance(layout: GardenLayout, context: string) {
  for (const [index, chunk] of layout.chunks.entries()) {
    const reserved = chunk.protectedBounds
    assert.deepEqual(reserved, gardenPlaceBounds(chunk))
    assert.equal(chunk.id, chunk.chunkId)
    assert.equal(chunk.place, index + 1)
    assert.ok(reserved.left >= layout.frame.inset && reserved.right <= 1200 - layout.frame.inset, context)
    assert.ok(reserved.top >= layout.frame.inset && reserved.bottom <= 1000 - layout.frame.inset, context)
    assert.ok(reserved.left >= chunk.bounds.left && reserved.right <= chunk.bounds.right, context)
    assert.ok(reserved.top >= chunk.bounds.top && reserved.bottom <= chunk.bounds.bottom, context)
    for (const other of layout.chunks.slice(index + 1)) {
      assert.equal(gardenRectsIntersect(reserved, other.protectedBounds, 10), false, `${context}: places must remain separate`)
    }
    for (const path of layout.paths) {
      for (let sample = 0; sample <= 128; sample++) {
        const point = sampleGardenCurve(path.curve, sample / 128)
        assert.equal(gardenRectsIntersect(reserved, box(point.x, point.y, path.width / 2 + 6, path.width / 2 + 6)), false,
          `${context}: place ${chunk.place} overlaps the walking corridor`)
      }
    }
    for (const pond of layout.features.ponds) {
      assert.equal(gardenRectsIntersect(reserved, box(pond.x, pond.y, pond.rx + 18, pond.ry + 18)), false, context)
    }
    for (const [streamIndex, point] of layout.features.stream.slice(1).entries()) {
      const previous = layout.features.stream[streamIndex]!
      const river = { left: Math.min(point.x, previous.x) - 26, right: Math.max(point.x, previous.x) + 26, top: previous.y - 12, bottom: point.y + 12 }
      assert.equal(gardenRectsIntersect(reserved, river), false, context)
    }
  }
  const scale = 304 / 1200 // 360px screen minus the page and fitted-map gutters.
  const halfWidth = Math.max(44, 90 * scale) / 2
  const halfHeight = Math.max(44, 100 * scale) / 2
  const touchTargets = layout.places.map(place => box(place.x * scale, (place.y + 5) * scale, halfWidth, halfHeight))
  for (const [index, target] of touchTargets.entries()) {
    for (const other of touchTargets.slice(index + 1)) {
      assert.equal(gardenRectsIntersect(target, other), false, `${context}: minimum 44px phone touch targets must remain separate at fit zoom`)
    }
  }
}

test('versioned garden slots have stable identities and organic spacing independent of records', () => {
  for (const id of gardenIds) {
    const world = getGardenWorldSize(id)
    assert.deepEqual(world, { width: 1200, height: 1000 })
    const layout = getGardenLayout(world.width, world.height, id)
    assert.deepEqual(getGardenLayout(world.width, world.height, id), layout)
    assert.equal(layout.version, 1)
    assert.equal(layout.places.length, gardenCapacity[id])
    assert.equal(layout.chunks.length, layout.places.length)
    assert.equal(new Set(layout.places.map(place => place.chunkId)).size, layout.places.length)
    assert.ok(new Set(layout.places.map(place => Math.round(place.y))).size >= Math.ceil(layout.places.length * 0.8), 'places must not form repeated visual grid rows')
    const sorted = layout.places.toSorted((a, b) => a.x - b.x)
    const gaps = sorted.slice(1).map((place, index) => place.x - sorted[index]!.x)
    assert.ok(Math.max(...gaps) - Math.min(...gaps) > 30, 'spacing should vary rather than follow equal columns')
    const baseline = getMemorialLayout(world.width, world.height, id)
    const record = { source: 'saved', id: 'layout-fixture', gardenId: id, place: 3, name: 'New memory', born: 2010, died: 2025,
      species: 'cat', story: 'A saved story', creatorName: null } as PublicMemorial
    const populated = getMemorialLayout(world.width, world.height, id, [record])
    assert.deepEqual(populated.places.map(({ x, y, place, chunkId }) => ({ x, y, place, chunkId })),
      baseline.places.map(({ x, y, place, chunkId }) => ({ x, y, place, chunkId })))
    assert.equal(populated.places.find(place => place.place === 3)?.memorial?.id, record.id)
    assert.deepEqual(populated.chunks, baseline.chunks)
  }
})

test('every canonical chunk keeps monuments and labels separate from other places, paths and geology', () => {
  for (const id of gardenIds) {
    const world = getGardenWorldSize(id)
    const layout = getGardenLayout(world.width, world.height, id)
    assertClearance(layout, id)
  }
})

test('returned layouts cannot mutate cached slots and size projections keep the same chunk identities', () => {
  for (const id of gardenIds) {
    const original = getGardenLayout(1200, 1000, id)
    const changed = getGardenLayout(1200, 1000, id)
    changed.places[0]!.x = -999
    changed.chunks[0]!.protectedBounds.left = -999
    if (changed.paths.length) changed.paths[0]!.curve[0]!.x = -999
    if (changed.features.ponds.length) changed.features.ponds[0]!.rx = -999
    assert.deepEqual(getGardenLayout(1200, 1000, id), original)
    const projection = getGardenLayout(600, 500, id)
    assert.deepEqual(projection.places.map(place => place.chunkId), original.places.map(place => place.chunkId))
    for (const [index, place] of projection.places.entries()) {
      assert.equal(place.x, original.places[index]!.x / 2)
      assert.equal(place.y, original.places[index]!.y / 2)
    }
    const world = getGardenWorldSize(id)
    world.width = 1
    assert.equal(getGardenWorldSize(id).width, 1200)
  }
})

test('session composition is repeatable after cache rebuilds and changes only positions inside permanent chunks', () => {
  assert.equal(getGardenSessionSeed(), 0)
  for (const id of gardenIds) {
    setGardenSessionSeed(37)
    const original = getGardenLayout(1200, 1000, id)
    setGardenSessionSeed(37)
    assert.deepEqual(getGardenLayout(1200, 1000, id), original)
    setGardenSessionSeed(71)
    const nextSession = getGardenLayout(1200, 1000, id)
    assert.notEqual(nextSession.seed, original.seed, 'scenery generation must receive a different seed')
    assert.notDeepEqual(nextSession.places, original.places, `${id} positions should vary in a new session`)
    assert.deepEqual(nextSession.chunks.map(({ id, place, bounds }) => ({ id, place, bounds })),
      original.chunks.map(({ id, place, bounds }) => ({ id, place, bounds })))
    assert.deepEqual(nextSession.paths, original.paths)
    assert.deepEqual(nextSession.features, original.features)
    setGardenSessionSeed(37)
    assert.deepEqual(getGardenLayout(1200, 1000, id), original, 'a discarded cache must not change the same session composition')
  }
  setGardenSessionSeed(2 ** 32 + 37)
  assert.equal(getGardenSessionSeed(), 37)
  setGardenSessionSeed(Number.NaN)
  assert.equal(getGardenSessionSeed(), 0)
})

test('100 session seeds preserve chunk ownership and collision clearance in every garden', () => {
  for (const id of gardenIds) {
    setGardenSessionSeed(0)
    const canonical = getGardenLayout(1200, 1000, id)
    const chunks = canonical.chunks.map(({ id, place, bounds }) => ({ id, place, bounds }))
    for (let seed = 1; seed <= 100; seed++) {
      setGardenSessionSeed(seed)
      const layout = getGardenLayout(1200, 1000, id)
      assert.deepEqual(layout.chunks.map(({ id, place, bounds }) => ({ id, place, bounds })), chunks)
      assert.deepEqual(layout.places, layout.chunks.map(({ place, x, y, chunkId }) => ({ place, x, y, chunkId })))
      assertClearance(layout, `${id}, session ${seed}`)
    }
  }
})

test('a saved memorial stays in its assigned chunk after a new session', () => {
  for (const id of gardenIds) {
    const record = { source: 'saved', id: 'session-fixture', gardenId: id, place: 3, name: 'New memory', born: 2010, died: 2025,
      species: 'cat', story: 'A saved story', creatorName: null } as PublicMemorial
    setGardenSessionSeed(57)
    const initial = getMemorialLayout(1200, 1000, id, [record]).places.find(place => place.place === record.place)!
    setGardenSessionSeed(87)
    const nextSession = getMemorialLayout(1200, 1000, id, [record]).places.find(place => place.place === record.place)!
    assert.equal(initial.memorial?.id, record.id)
    assert.equal(nextSession.memorial?.id, record.id)
    assert.equal(nextSession.chunkId, initial.chunkId)
  }
})

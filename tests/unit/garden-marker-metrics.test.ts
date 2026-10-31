import assert from 'node:assert/strict'
import test from 'node:test'
import { getGardenMarkerHitBounds, getGardenMarkerMetrics, layoutGardenMarkerLabels } from '../../app/utils/gardenMarkerMetrics'
import type { GardenMarkerBounds, GardenMarkerLabelInput } from '../../app/utils/gardenMarkerMetrics'
import { getGardenProjection } from '../../app/utils/gardenProjection'
import { getGardenLayout, setGardenSessionSeed } from '../../app/data/gardenLayout'
import { getMonumentKind } from '../../app/data/monuments'
import { createMonumentArt } from '../../app/utils/monumentArt'
import { gardenIds } from '../../shared/gardens'

function contains(rect: { left: number, top: number, right: number, bottom: number }, x: number, y: number) {
  assert.ok(x >= rect.left - 1e-8 && x <= rect.right + 1e-8)
  assert.ok(y >= rect.top - 1e-8 && y <= rect.bottom + 1e-8)
}

test('compact places stay readable at full-map scale without changing the camera projection', () => {
  for (const [width, height] of [[304, 690], [374, 756], [414, 844], [828, 302]] as const) {
    const projection = getGardenProjection(width, height, 1200, 1000, 16)
    const before = { ...projection }
    for (const occupied of [false, true]) {
      const metrics = getGardenMarkerMetrics(projection.scale, true, occupied)
      assert.ok(metrics.artScale > 1 && metrics.artScale <= 2)
      assert.ok(20 * projection.scale * metrics.labelScale >= 12, 'labels remain legible on the narrowest supported phone')
      assert.ok((metrics.hit.right - metrics.hit.left) * projection.scale >= 44 - 1e-8)
      assert.ok((metrics.hit.bottom - metrics.hit.top) * projection.scale >= 44 - 1e-8)
      assert.deepEqual(projection, before, 'local compensation must never mutate the projection')
    }
  }
})

test('zoom smoothly removes compensation without shrinking the artwork on screen', () => {
  for (const projectionScale of [0.2266666667, 0.285, 0.32, 0.6]) {
    let previousArt = 0, previousLabel = 0
    for (const zoom of [1, 1.1, 1.25, 1.5, 2, 3, 4]) {
      const screenScale = projectionScale * zoom
      const metrics = getGardenMarkerMetrics(screenScale, true, true)
      const art = metrics.artScale * screenScale, label = metrics.labelScale * screenScale
      assert.ok(art >= previousArt - 1e-8)
      assert.ok(label >= previousLabel - 1e-8)
      previousArt = art
      previousLabel = label
    }
  }
  const readable = getGardenMarkerMetrics(0.75, true, true)
  assert.equal(readable.artScale, 1)
  assert.equal(readable.labelScale, 1)
})

test('desktop keeps the original artwork and label scales', () => {
  for (const screenScale of [0.25, 0.7, 1, 2]) {
    const metrics = getGardenMarkerMetrics(screenScale, false, true)
    assert.equal(metrics.artScale, 1)
    assert.equal(metrics.labelScale, 1)
    assert.equal(metrics.labelY, 36)
    if (screenScale >= 0.7) assert.deepEqual(metrics.hit, { left: -45, top: -45, right: 45, bottom: 55 })
    assert.deepEqual(getGardenMarkerHitBounds(metrics, true, { width: 130, height: 46 }), metrics.hit,
      'mobile caption sizing must not expand the original desktop place region')
  }
})

test('place hit regions contain enlarged stones, actual captions and anchored empty circles', () => {
  for (const screenScale of [0.2266666667, 0.3, 0.6, 1]) {
    const full = getGardenMarkerMetrics(screenScale, true, true)
    const measured = getGardenMarkerHitBounds(full, true, { width: 52, height: 23 })
    contains(measured, -40 * full.artScale, -45 * full.artScale)
    contains(measured, 45 * full.artScale, 40 * full.artScale)
    contains(measured, -26 * full.labelScale, full.labelY)
    contains(measured, 26 * full.labelScale, full.labelY + 23 * full.labelScale)
    assert.ok(measured.bottom <= full.hit.bottom)
    const empty = getGardenMarkerMetrics(screenScale, true, false)
    contains(empty.hit, -32 * empty.artScale, -4 - 22 * empty.artScale)
    contains(empty.hit, 32 * empty.artScale, -4 + 31 * empty.artScale)
  }
})

test('invalid and extreme scale inputs cannot leak non-finite dimensions into rendering or CSS', () => {
  for (const scale of [NaN, Infinity, -Infinity, 0, -1, Number.MIN_VALUE, Number.MAX_VALUE]) {
    for (const compact of [true, false]) {
      const metrics = getGardenMarkerMetrics(scale, compact, true)
      for (const value of [metrics.screenScale, metrics.artScale, metrics.labelScale, metrics.labelY, ...Object.values(metrics.hit)]) assert.ok(Number.isFinite(value))
    }
  }
})

function overlaps(a: GardenMarkerBounds, b: GardenMarkerBounds) {
  return a.left < b.right - 1e-8 && a.right > b.left + 1e-8 && a.top < b.bottom - 1e-8 && a.bottom > b.top + 1e-8
}

function assertLabelClearance(input: GardenMarkerLabelInput[], positions: ReturnType<typeof layoutGardenMarkerLabels>, obstacles: GardenMarkerBounds[] = []) {
  const boxes = input.map(item => ({
    place: item.place, left: positions[item.place]!.x, top: positions[item.place]!.y,
    right: positions[item.place]!.x + item.label.width, bottom: positions[item.place]!.y + item.label.height
  }))
  for (const a of boxes) {
    assert.ok(Object.values(a).every(value => Number.isFinite(value)))
    for (const other of input) if (other.place !== a.place) assert.equal(overlaps(a, other.stone), false, `caption ${a.place} covers stone ${other.place}`)
    for (const obstacle of obstacles) assert.equal(overlaps(a, obstacle), false, `caption ${a.place} covers an empty place`)
    for (const b of boxes) if (a.place < b.place) assert.equal(overlaps(a, b), false, `captions ${a.place} and ${b.place} overlap`)
  }
}

test('caption placement avoids a place below its preferred position and preserves the stone coordinates', () => {
  const input = [{ place: 1, stone: { left: 100, top: 100, right: 200, bottom: 200 }, label: { width: 60, height: 20 }, preferredY: 210 }]
  const obstacles = [{ left: 100, top: 210, right: 200, bottom: 250 }]
  const before = structuredClone(input)
  const positions = layoutGardenMarkerLabels(input, 5, obstacles)
  assert.deepEqual(positions[1], { x: 120, y: 75, inset: false })
  assertLabelClearance(input, positions, obstacles)
  assert.deepEqual(input, before)
})

test('dense caption rows use inset alternatives without covering other names or stones', () => {
  const input = Array.from({ length: 16 }, (_, index) => {
    const x = 200 + index % 4 * 176, y = 200 + Math.floor(index / 4) * 176
    return { place: index + 1, stone: { left: x - 80, top: y - 90, right: x + 80, bottom: y + 80 }, label: { width: 192, height: 78 }, preferredY: y + 100 }
  })
  const positions = layoutGardenMarkerLabels(input, 16)
  assertLabelClearance(input, positions)
  assert.ok(Object.values(positions).some(position => position.inset))
  assert.deepEqual(layoutGardenMarkerLabels([...input].reverse(), 16), positions, 'input traversal order must not change caption placement')
})

test('caption-aware hit regions follow labels placed above or beside their stone', () => {
  const metrics = getGardenMarkerMetrics(0.3, true, true)
  const left = getGardenMarkerHitBounds(metrics, true, { width: 60, height: 24, x: -180, y: -120 })
  contains(left, -180 - 30 * metrics.labelScale, -120)
  contains(left, -180 + 30 * metrics.labelScale, -120 + 24 * metrics.labelScale)
  assert.equal(left.bottom, 40 * metrics.artScale, 'a relocated caption must not retain an obsolete lower hit region')
})

test('fully occupied gardens keep dense captions clear across mobile sizes and session variations', () => {
  try {
    for (const viewportWidth of [320, 390]) {
      const metrics = getGardenMarkerMetrics((viewportWidth - 48) / 1200, true, true)
      for (const seed of [0, 424242, ...Array.from({ length: 20 }, (_, index) => index + 1)]) {
        setGardenSessionSeed(seed)
        for (const garden of gardenIds) {
          const draw = createMonumentArt()
          const graphics: ReturnType<typeof draw>[] = []
          try {
            const input = getGardenLayout(1200, 1000, garden).places.map((place) => {
              const graphic = draw(getMonumentKind(garden, place.place))
              graphics.push(graphic)
              const box = graphic.getLocalBounds()
              return {
                place: place.place,
                stone: { left: place.x + box.minX * metrics.artScale, top: place.y + box.minY * metrics.artScale,
                  right: place.x + box.maxX * metrics.artScale, bottom: place.y + box.maxY * metrics.artScale },
                label: { width: 192, height: 78 }, preferredY: place.y + metrics.labelY
              }
            })
            const positions = layoutGardenMarkerLabels(input, 4 / metrics.screenScale)
            assertLabelClearance(input, positions)
          } finally { for (const graphic of graphics) graphic.destroy({ context: true }) }
        }
      }
    }
  } finally { setGardenSessionSeed(0) }
})

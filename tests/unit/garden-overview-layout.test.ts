import assert from 'node:assert/strict'
import test from 'node:test'
import { getGardenOverviewLayout, gardenOverviewPreviewSize } from '../../app/utils/gardenOverviewLayout'
import type { GardenOverviewRect } from '../../app/utils/gardenOverviewLayout'

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`)
}

function inside(rect: GardenOverviewRect, width: number, height: number) {
  assert.ok(rect.x >= -1e-8 && rect.y >= -1e-8)
  assert.ok(rect.width > 0 && rect.height > 0)
  assert.ok(rect.x + rect.width <= width + 1e-8)
  assert.ok(rect.y + rect.height <= height + 1e-8)
}

test('desktop overview retains the original 2x2 geometry and full-card illustrations', () => {
  for (const [width, height] of [[1000, 650], [1408, 916], [1600.25, 843.5], [100, 100]]) {
    const tiles = getGardenOverviewLayout(width!, height!)
    assert.deepEqual(tiles.map(tile => tile.garden.id), ['meadow', 'lake', 'grove', 'hill'])
    for (const [index, tile] of tiles.entries()) {
      const tileWidth = (width! - 62) / 2, tileHeight = (height! - 62) / 2
      close(tile.x, 24 + index % 2 * (tileWidth + 14))
      close(tile.y, 24 + Math.floor(index / 2) * (tileHeight + 14))
      close(tile.width, tileWidth)
      close(tile.height, tileHeight)
      assert.deepEqual(tile.illustration, { x: 0, y: 0, width: tileWidth, height: tileHeight })
    }
  }
})

test('mobile cards, 4:3 windows and captions fit in two rows without scrolling', () => {
  for (const [width, height] of [[304, 490], [374, 768], [414, 812], [828, 310], [628, 230], [304, 310]] as const) {
    const tiles = getGardenOverviewLayout(width, height, true)
    for (const tile of tiles) {
      inside(tile, width, height)
      inside(tile.illustration, tile.width, tile.height)
      inside(tile.caption, tile.width, tile.height)
      close(tile.illustration.width / tile.illustration.height, 4 / 3)
      close(tile.caption.y, tile.illustration.y + tile.illustration.height)
      close(tile.caption.y + tile.caption.height, tile.height)
      close(tile.illustration.x + tile.illustration.width / 2, tile.width / 2)
      assert.ok(tile.width >= 44 && tile.height >= 44)
    }
    const [first, second, third, fourth] = tiles
    close(first!.y, second!.y)
    close(third!.y, fourth!.y)
    close(first!.x, third!.x)
    close(second!.x, fourth!.x)
    assert.ok(first!.x + first!.width < second!.x)
    assert.ok(first!.y + first!.height < third!.y)
    close((first!.x + second!.x + second!.width) / 2, width / 2)
    close((first!.y + third!.y + third!.height) / 2, height / 2)
  }
})

test('tall phones retain natural postcard proportions while short landscape reduces only the art window', () => {
  const normal = getGardenOverviewLayout(374, 768, true)[0]!
  const tall = getGardenOverviewLayout(374, 1200, true)[0]!
  assert.deepEqual(tall.illustration, normal.illustration)
  close(tall.height, normal.height)
  close(normal.illustration.width, normal.width)
  assert.ok(tall.y > normal.y)
  const landscape = getGardenOverviewLayout(828, 310, true)[0]!
  assert.ok(landscape.illustration.width < landscape.width)
  assert.ok(landscape.caption.width > landscape.illustration.width)
  assert.ok(landscape.caption.height >= 68)
  close(gardenOverviewPreviewSize.width / gardenOverviewPreviewSize.height, 4 / 3)
})

test('invalid and transient tiny viewport sizes cannot create negative or non-finite rectangles', () => {
  for (const [width, height] of [[0, 0], [-1, -1], [NaN, Infinity], [1, 1], [.5, .25], [10, 20]]) {
    const normalizedWidth = Number.isFinite(width) && width! > 0 ? width! : 1
    const normalizedHeight = Number.isFinite(height) && height! > 0 ? height! : 1
    for (const compact of [false, true]) {
      for (const tile of getGardenOverviewLayout(width!, height!, compact)) {
        for (const rect of [tile, tile.illustration, tile.caption]) {
          assert.ok(Object.values({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }).every(Number.isFinite))
        }
        inside(tile, normalizedWidth, normalizedHeight)
        inside(tile.illustration, tile.width, tile.height)
        if (compact) inside(tile.caption, tile.width, tile.height)
      }
    }
  }
})

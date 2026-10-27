import assert from 'node:assert/strict'
import test from 'node:test'
import { gardenBoundsVisible, getGardenProjection } from '../../app/utils/gardenProjection'

function close(actual: number, expected: number, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`)
}

test('portrait and landscape viewports contain the entire fixed world with one uniform centered scale', () => {
  for (const [viewWidth, viewHeight] of [[1440, 900], [390, 844], [844, 390], [1100, 780], [1920, 650], [1, 1]] as const) {
    const worldWidth = 1200, worldHeight = 1000
    const projection = getGardenProjection(viewWidth, viewHeight, worldWidth, worldHeight)
    assert.ok(Object.values(projection).every(Number.isFinite))
    assert.ok(projection.scale > 0)
    close(projection.width / worldWidth, projection.height / worldHeight)
    close(projection.width / projection.height, worldWidth / worldHeight)
    assert.ok(projection.width <= viewWidth + 1e-8 && projection.height <= viewHeight + 1e-8, 'the full garden must fit without cropping either axis')
    close(projection.offsetX + projection.width / 2, viewWidth / 2)
    close(projection.offsetY + projection.height / 2, viewHeight / 2)
    assert.ok(projection.offsetX >= -1e-8 && projection.offsetY >= -1e-8)
    for (const [worldX, worldY] of [[0, 0], [1200, 0], [0, 1000], [1200, 1000]]) {
      const x = worldX! * projection.scale + projection.offsetX
      const y = worldY! * projection.scale + projection.offsetY
      assert.ok(x >= -1e-8 && x <= viewWidth + 1e-8, 'a world edge must never fall outside the viewport')
      assert.ok(y >= -1e-8 && y <= viewHeight + 1e-8, 'a world edge must never fall outside the viewport')
    }
  }
  const landscape = getGardenProjection(1440, 900, 1200, 1000)
  close(landscape.scale, 0.9)
  close(landscape.offsetX, 180)
  close(landscape.offsetY, 0)
  const portrait = getGardenProjection(390, 844, 1200, 1000)
  close(portrait.scale, 0.325)
  close(portrait.offsetX, 0)
  close(portrait.offsetY, (844 - 325) / 2)
})

test('a screen padding keeps the complete garden frame away from every viewport edge', () => {
  for (const [viewWidth, viewHeight] of [[1440, 900], [390, 844], [844, 390], [1920, 650]] as const) {
    const padding = 16
    const projection = getGardenProjection(viewWidth, viewHeight, 1200, 1000, padding)
    close(projection.scale, Math.min((viewWidth - padding * 2) / 1200, (viewHeight - padding * 2) / 1000))
    assert.ok(projection.offsetX >= padding - 1e-8)
    assert.ok(projection.offsetY >= padding - 1e-8)
    assert.ok(projection.offsetX + projection.width <= viewWidth - padding + 1e-8)
    assert.ok(projection.offsetY + projection.height <= viewHeight - padding + 1e-8)
    close(projection.offsetX + projection.width / 2, viewWidth / 2)
    close(projection.offsetY + projection.height / 2, viewHeight / 2)
    close(projection.width / projection.height, 1.2)
  }
})

test('projected world positions and visible world boundaries round-trip at any supported zoom', () => {
  for (const [viewWidth, viewHeight] of [[1440, 900], [390, 844], [844, 390]] as const) {
    const projection = getGardenProjection(viewWidth, viewHeight, 1200, 1000)
    for (const zoom of [1, 1.25, 2.44140625, 4]) {
      const scale = projection.scale * zoom
      const x = projection.offsetX - 123, y = projection.offsetY + 37
      const view = { left: -x / scale, right: (viewWidth - x) / scale, top: -y / scale, bottom: (viewHeight - y) / scale }
      assert.ok(Object.values(view).every(Number.isFinite))
      close(view.left * scale + x, 0)
      close(view.right * scale + x, viewWidth)
      close(view.top * scale + y, 0)
      close(view.bottom * scale + y, viewHeight)
      for (const [worldX, worldY] of [[0, 0], [600, 500], [1200, 1000], [327.25, 719.75]]) {
        const screenX = worldX! * scale + x, screenY = worldY! * scale + y
        close((screenX - x) / scale, worldX!)
        close((screenY - y) / scale, worldY!)
      }
    }
  }
})

test('chunk visibility includes a bounded overscan margin on every edge without rendering distant chunks', () => {
  const view = { left: 100, right: 300, top: 200, bottom: 500 }
  assert.equal(gardenBoundsVisible({ left: 150, right: 180, top: 250, bottom: 280 }, view), true)
  assert.equal(gardenBoundsVisible({ left: 0, right: 400, top: 100, bottom: 600 }, view), true, 'a chunk enclosing the viewport is visible')
  assert.equal(gardenBoundsVisible({ left: 20, right: 61, top: 250, bottom: 280 }, view), true)
  assert.equal(gardenBoundsVisible({ left: 20, right: 60, top: 250, bottom: 280 }, view), false)
  assert.equal(gardenBoundsVisible({ left: 339, right: 400, top: 250, bottom: 280 }, view), true)
  assert.equal(gardenBoundsVisible({ left: 340, right: 400, top: 250, bottom: 280 }, view), false)
  assert.equal(gardenBoundsVisible({ left: 150, right: 180, top: 100, bottom: 161 }, view), true)
  assert.equal(gardenBoundsVisible({ left: 150, right: 180, top: 100, bottom: 160 }, view), false)
  assert.equal(gardenBoundsVisible({ left: 150, right: 180, top: 539, bottom: 580 }, view), true)
  assert.equal(gardenBoundsVisible({ left: 150, right: 180, top: 540, bottom: 580 }, view), false)
  assert.equal(gardenBoundsVisible({ left: 1000, right: 1100, top: 200, bottom: 300 }, view), false)
  assert.equal(gardenBoundsVisible({ left: 45, right: 75, top: 250, bottom: 280 }, view, 0), false)
  assert.equal(gardenBoundsVisible({ left: 45, right: 75, top: 250, bottom: 280 }, view, 30), true)
  assert.equal(gardenBoundsVisible({ left: 99, right: 100, top: 200, bottom: 300 }, view, 0), false, 'touching an edge alone has no visible area')
})

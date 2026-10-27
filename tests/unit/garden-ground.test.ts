import assert from 'node:assert/strict'
import test from 'node:test'
import { Graphics } from 'pixi.js'
import { demoGardens } from '../../app/data/demoGardens'
import { getMemorialLayout } from '../../app/data/demoMemorials'
import { drawGardenGround, getGardenGroundTexture } from '../../app/utils/gardenGround'

const sizes = [[1200, 1000]] as const // The garden world is fixed; viewport changes only move the camera.
const previews = [[451, 276], [271, 371], [271, 608]] as const

test('ground textures have repeatable, sparse detail and leave memorial names clear in every garden', () => {
  for (const { id } of demoGardens) {
    for (const [width, height] of sizes) {
      const layout = getGardenGroundTexture(width, height, id, false)
      assert.deepEqual(layout, getGardenGroundTexture(width, height, id, false))
      assert.equal(layout.patches.length, 22)
      assert.ok(layout.grass.length <= 138 && layout.moss.length <= 34 && layout.flecks.length <= 54)
      assert.ok(layout.grass.length > 0 && layout.moss.length > 0 && layout.flecks.length > 0)
      for (const mark of [...layout.grass, ...layout.moss, ...layout.flecks]) {
        for (const place of getMemorialLayout(width, height, id).places) {
          const overlap = mark.x + mark.size > place.x - 65 && mark.x - mark.size < place.x + 65
            && mark.y + mark.size > place.y - 52 && mark.y - mark.size < place.y + 65
          assert.equal(overlap, false, `ground flecks overlap ${id} place ${place.place}`)
        }
      }
    }
  }
})

test('field texture stays inside the garden and preview art, has a fixed static budget and releases geometry', () => {
  for (const { id } of demoGardens) {
    for (const [preview, dimensions] of [[false, sizes], [true, previews]] as const) {
      for (const [width, height] of dimensions) {
        const first = new Graphics()
        const second = new Graphics()
        const contexts = [first.context, second.context]
        try {
          drawGardenGround(first, width, height, id, preview)
          drawGardenGround(second, width, height, id, preview)
          const artHeight = preview ? height - 99 : height
          for (const value of [first.bounds.minX, first.bounds.minY, first.bounds.maxX, first.bounds.maxY]) assert.ok(Number.isFinite(value))
          assert.ok(first.bounds.minX >= 8 && first.bounds.maxX <= width - 8)
          assert.ok(first.bounds.minY >= 8 && first.bounds.maxY <= artHeight - 8)
          assert.ok(first.bounds.width > width * 0.65 && first.bounds.height > artHeight * 0.65)
          assert.equal(first.context.instructions.length, second.context.instructions.length)
          assert.ok(first.context.instructions.length > 0 && first.context.instructions.length <= (preview ? 180 : 650))
          assert.deepEqual(
            [first.bounds.minX, first.bounds.maxX, first.bounds.minY, first.bounds.maxY],
            [second.bounds.minX, second.bounds.maxX, second.bounds.minY, second.bounds.maxY]
          )
          assert.ok(!first.filters || first.filters.length === 0)
        } finally {
          first.destroy({ context: true })
          second.destroy({ context: true })
        }
        for (const context of contexts) assert.equal(context.destroyed, true)
      }
    }
  }
})

test('small unfinished viewports produce no invalid or overflowing ground geometry', () => {
  for (const [width, height, preview] of [[0, 0, false], [20, 20, false], [271, 100, true]] as const) {
    const graphic = new Graphics()
    try {
      drawGardenGround(graphic, width, height, 'meadow', preview)
      assert.equal(graphic.context.instructions.length, 0)
    } finally { graphic.destroy({ context: true }) }
  }
})

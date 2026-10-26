import assert from 'node:assert/strict'
import test from 'node:test'
import { Container } from 'pixi.js'
import type { Graphics } from 'pixi.js'
import { getMeadowInsectLayout } from '../../app/data/meadowLife'
import { getMemorialLayout } from '../../app/data/demoMemorials'
import { createMeadowAmbience } from '../../app/utils/meadowAmbience'

const sizes = [[1000, 650], [640, 840], [640, 1340], [1900, 650]] as const

test('meadow insect flight envelopes stay at flowered edges and clear of every place and name', () => {
  for (const [width, height] of sizes) {
    const layout = getMeadowInsectLayout(width, height)
    assert.deepEqual(getMeadowInsectLayout(width, height), layout)
    assert.equal(layout.bees.length, 3)
    assert.equal(layout.butterflies.length, 4)
    for (const [flights, radius] of [[layout.butterflies, 15], [layout.bees, 11]] as const) {
      for (const flight of flights) {
        const left = flight.x - flight.rx - radius
        const right = flight.x + flight.rx + radius
        const top = flight.y - flight.ry - radius
        const bottom = flight.y + flight.ry + radius
        assert.ok(left >= 8 && right <= width - 8 && top >= 8 && bottom <= height - 8)
        for (const place of getMemorialLayout(width, height, 'meadow').places) {
          assert.equal(right > place.x - 65 && left < place.x + 65 && bottom > place.y - 52 && top < place.y + 65, false)
        }
      }
    }
  }
})

test('meadow insects animate only transforms with a fixed small geometry budget and release their contexts', () => {
  for (const [width, height] of sizes) {
    const parent = new Container()
    const update = createMeadowAmbience(parent, width, height)
    const children = [...parent.children]
    const graphics = children.flatMap(child => child.children as Graphics[])
    const contexts = graphics.map(graphic => graphic.context)
    const instructions = contexts.map(context => ({ array: context.instructions, count: context.instructions.length }))
    assert.equal(children.length, 7)
    assert.equal(graphics.length, 14)
    assert.ok(instructions.reduce((total, item) => total + item.count, 0) < 100)
    try {
      for (const child of children) assert.equal(child.eventMode, 'none')
      for (const node of [parent, ...children, ...graphics]) assert.ok(!node.filters || node.filters.length === 0)
      update(0)
      const initial = children.map(child => [child.x, child.y, child.rotation])
      for (let step = 0; step < 120; step++) {
        update(step * 1.3)
        for (const child of children) {
          const bounds = child.getBounds()
          assert.ok(bounds.minX >= 0 && bounds.maxX <= width && bounds.minY >= 0 && bounds.maxY <= height)
          assert.ok(child.visible && child.alpha > 0, 'reduced motion must retain visible static insects')
          for (const value of [child.x, child.y, child.rotation, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]) assert.ok(Number.isFinite(value))
          for (const place of getMemorialLayout(width, height, 'meadow').places) {
            assert.equal(bounds.maxX > place.x - 65 && bounds.minX < place.x + 65 && bounds.maxY > place.y - 52 && bounds.minY < place.y + 65, false)
          }
        }
      }
      assert.notDeepEqual(children.map(child => [child.x, child.y, child.rotation]), initial)
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

import assert from 'node:assert/strict'
import test from 'node:test'
import { Container, Graphics } from 'pixi.js'
import { getGroveSceneryLayout } from '../../app/data/groveScenery'
import { getMemorialLayout } from '../../app/data/demoMemorials'
import { drawGroveLandscape } from '../../app/utils/groveScenery'
import { drawGrassTuft, drawLeaf, drawShrub, drawWoodlandTree } from '../../app/utils/gardenDecor'
import { createGardenLife } from '../../app/utils/gardenLife'

type Rect = { left: number, right: number, top: number, bottom: number }
type Layout = ReturnType<typeof getGroveSceneryLayout>
const fullSizes = [[1000, 650], [1200, 900], [640, 1340], [640, 840], [1900, 650]] as const
const previewSizes = [[451, 276], [271, 371], [271, 608]] as const

function propBounds(layout: Layout): Rect[] {
  return [
    ...layout.trees.map(p => ({ left: p.x - p.size * 1.5, right: p.x + p.size * 1.5, top: p.y - p.size * 1.5, bottom: p.y + p.size * 1.4 })),
    ...layout.shrubs.map(p => ({ left: p.x - p.size * 1.4, right: p.x + p.size * 1.4, top: p.y - p.size * 1.5, bottom: p.y + p.size * 0.55 })),
    ...layout.grass.map(p => ({ left: p.x - p.size, right: p.x + p.size, top: p.y - p.size - 2, bottom: p.y + 4 })),
    ...layout.flowers.map(p => ({ left: p.x - 26, right: p.x + 26, top: p.y - 17, bottom: p.y + 18 })),
    ...layout.leaves.map(p => ({ left: p.x - p.size * 1.35, right: p.x + p.size * 1.35, top: p.y - p.size * 1.35, bottom: p.y + p.size * 1.35 })),
    ...layout.lanterns.map(p => ({ left: p.x - 12, right: p.x + 12, top: p.y - (p.hanging ? 37 : 28), bottom: p.y + 14 }))
  ]
}

function inside(rect: Rect, width: number, height: number) {
  for (const value of Object.values(rect)) assert.ok(Number.isFinite(value), 'geometry must have finite bounds')
  assert.ok(rect.left >= 0 && rect.right <= width, 'scenery must fit the world width')
  assert.ok(rect.top >= 0 && rect.bottom <= height, 'scenery must fit the world height')
}

function bounds(graphic: Graphics): Rect {
  return { left: graphic.bounds.minX, right: graphic.bounds.maxX, top: graphic.bounds.minY, bottom: graphic.bounds.maxY }
}

test('grove layouts remain deterministic, populated and bounded at desktop and mobile world sizes', () => {
  for (const [width, height] of fullSizes) {
    const layout = getGroveSceneryLayout(width, height)
    assert.deepEqual(getGroveSceneryLayout(width, height), layout)
    for (const [name, limit] of [['trees', 80], ['shrubs', 48], ['grass', 64], ['lanterns', 14]] as const) {
      assert.ok(layout[name].length > 0, `${name} should remain present after clearance filtering`)
      assert.ok(layout[name].length <= limit, `${name} must have a bounded prop budget`)
    }
    assert.ok(layout.flowers.length <= 13 && layout.leaves.length <= 65)
    for (const rect of propBounds(layout)) inside(rect, width, height)
  }
})

test('grove decorations reserve every memorial and its name, including the unoccupied places', () => {
  for (const [width, height] of fullSizes) {
    const places = getMemorialLayout(width, height, 'grove').places
    assert.equal(places.length, 16)
    for (const prop of propBounds(getGroveSceneryLayout(width, height))) {
      for (const place of places) {
        const overlap = prop.left < place.x + 65 && prop.right > place.x - 65
          && prop.top < place.y + 65 && prop.bottom > place.y - 52
        assert.equal(overlap, false, `scenery obscures place ${place.place} at ${width}×${height}`)
      }
    }
  }
})

test('overview grove composition remains populated and above its title panel', () => {
  for (const [width, height] of previewSizes) {
    const layout = getGroveSceneryLayout(width, height, true)
    assert.deepEqual(getGroveSceneryLayout(width, height, true), layout)
    assert.ok(layout.trees.length > 0 && layout.trees.length <= 11)
    assert.ok(layout.shrubs.length > 0 && layout.shrubs.length <= 11)
    assert.ok(layout.lanterns.length > 0 && layout.lanterns.length <= 2)
    assert.ok(layout.flowers.length <= 5 && layout.leaves.length <= 24)
    for (const rect of propBounds(layout)) inside(rect, width, height - 99)
  }
})

test('full and overview grove drawing stays static, repeatable and within a bounded geometry budget', () => {
  for (const [preview, sizes] of [[false, fullSizes], [true, previewSizes]] as const) {
    for (const [width, height] of sizes) {
      const first = new Graphics()
      const second = new Graphics()
      const contexts = [first.context, second.context]
      try {
        drawGroveLandscape(first, width, height, preview)
        drawGroveLandscape(second, width, height, preview)
        inside(bounds(first), width, height)
        assert.deepEqual(bounds(first), bounds(second))
        assert.ok(first.bounds.width > width * 0.6)
        assert.ok(first.bounds.height > (preview ? height - 99 : height) * 0.6)
        assert.ok(first.context.instructions.length > 0 && first.context.instructions.length < 4000)
        assert.equal(first.context.instructions.length, second.context.instructions.length)
      } finally {
        first.destroy({ context: true })
        second.destroy({ context: true })
      }
      for (const context of contexts) assert.equal(context.destroyed, true)
    }
  }
})

test('common trees, shrubs, grass and rotated leaves fit the clearance bounds used by their placement', () => {
  for (const size of [11, 16, 22, 30]) {
    for (const [draw, expected] of [
      [(g: Graphics) => drawWoodlandTree(g, 0, 0, size, 3), { left: -size * 1.5, right: size * 1.5, top: -size * 1.5, bottom: size * 1.4 }],
      [(g: Graphics) => drawShrub(g, { x: 0, y: 0, size, seed: 3 }), { left: -size * 1.4, right: size * 1.4, top: -size * 1.5, bottom: size * 0.55 }],
      [(g: Graphics) => drawGrassTuft(g, 0, 0, size, 3), { left: -size, right: size, top: -size - 2, bottom: Math.max(4, size / 26 * 5) }]
    ] as const) {
      const graphic = new Graphics()
      try {
        draw(graphic)
        const actual = bounds(graphic)
        assert.ok(actual.left >= expected.left && actual.right <= expected.right)
        assert.ok(actual.top >= expected.top && actual.bottom <= expected.bottom)
      } finally { graphic.destroy({ context: true }) }
    }
    for (const angle of [0, 0.7, 1.7, Math.PI]) {
      const leaf = new Graphics()
      try {
        leaf.context.rotate(angle)
        drawLeaf(leaf, size, 0x8ba16d)
        const actual = bounds(leaf)
        const extent = size * 1.35
        assert.ok(actual.left >= -extent && actual.right <= extent && actual.top >= -extent && actual.bottom <= extent)
      } finally { leaf.destroy({ context: true }) }
    }
  }
})

test('falling leaves and hill grass animate without replacing children or rebuilding geometry', () => {
  for (const garden of ['grove', 'hill'] as const) {
    const parent = new Container()
    try {
      const update = createGardenLife(parent, garden, 1000, 650)
      assert.ok(update)
      const children = [...parent.children] as Graphics[]
      assert.ok(children.length > 0 && children.length <= 40)
      if (garden === 'grove') assert.equal(children.length, 7)
      const contexts = children.map(child => child.context)
      const instructions = contexts.map(context => ({ array: context.instructions, count: context.instructions.length }))
      const before = children.map(child => [child.x, child.y, child.rotation, child.skew.x, child.scale.x, child.alpha])
      for (let step = 0; step < 120; step++) update(step * 0.5)
      assert.deepEqual(parent.children, children)
      children.forEach((child, index) => {
        assert.equal(child.context, contexts[index])
        assert.equal(child.context.instructions, instructions[index]!.array)
        assert.equal(child.context.instructions.length, instructions[index]!.count)
        for (const value of [child.x, child.y, child.rotation, child.skew.x, child.scale.x, child.alpha]) assert.ok(Number.isFinite(value))
        assert.ok(child.alpha >= 0 && child.alpha <= 1)
      })
      assert.notDeepEqual(children.map(child => [child.x, child.y, child.rotation, child.skew.x, child.scale.x, child.alpha]), before)
      parent.destroy({ children: true, context: true })
      for (const context of contexts) assert.equal(context.destroyed, true)
    } finally { parent.destroy({ children: true, context: true }) }
  }
})

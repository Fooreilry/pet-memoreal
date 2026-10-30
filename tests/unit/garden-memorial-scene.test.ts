import assert from 'node:assert/strict'
import test from 'node:test'
import { Graphics } from 'pixi.js'
import type { Container } from 'pixi.js'
import { createGardenMemorialScene, getMemorialSceneLayout } from '../../app/utils/gardenMemorialScene'
import { getMonumentKind } from '../../app/data/monuments'
import { gardenIds } from '../../shared/gardens'
import { getGardenLayout } from '../../app/data/gardenLayout'

function descendants(node: Container): Container[] {
  return [node, ...node.children.flatMap(child => descendants(child))]
}

test('memorial close-up reserves its reading panel and keeps the assigned monument inside its visual region', () => {
  for (const [width, height] of [[1440, 900], [900, 700], [760, 390], [390, 768], [320, 450], [844, 300]]) {
    const { visual, monument } = getMemorialSceneLayout(width!, height!)
    assert.equal(visual.left, width! >= 760 ? Math.max(320, Math.min(440, width! * .34)) : 0)
    assert.equal(visual.height, width! >= 760 ? height : Math.min(height!, Math.max(180, Math.min(340, height! * .42))))
    assert.ok(monument.x - 45 * monument.scale > visual.left)
    assert.ok(monument.x + 60 * monument.scale < visual.left + visual.width)
    assert.ok(monument.y - 45 * monument.scale >= visual.top)
    assert.ok(monument.y + 40 * monument.scale <= visual.top + visual.height)
    assert.ok(monument.scale <= 4.4)
    assert.ok(monument.y - 45 * monument.scale >= 72, 'the monument stays below the scene controls')
  }
  for (const [width, height] of [[0, 0], [Number.NaN, -1], [Infinity, Infinity]]) {
    const layout = getMemorialSceneLayout(width!, height!)
    for (const number of [...Object.values(layout.visual), ...Object.values(layout.monument)]) assert.ok(Number.isFinite(number))
  }
})

test('each close-up reuses its permanent monument shape and owns bounded scene geometry without another filter', () => {
  const budgets: number[] = []
  for (const garden of gardenIds) {
    const scene = createGardenMemorialScene(1440, 900, garden, 2)
    const objects = descendants(scene.root)
    const graphics = objects.filter((node): node is Graphics => node instanceof Graphics)
    const contexts = new Set(graphics.map(graphic => graphic.context))
    try {
      assert.equal(scene.root.label, 'memorial-detail-scene')
      assert.equal(scene.monument.label, `memorial-monument-${getMonumentKind(garden, 2)}`)
      assert.equal(scene.monument.x, scene.target.x)
      assert.equal(scene.monument.y, scene.target.y)
      assert.equal(scene.monument.scale.x, scene.target.scale)
      assert.ok(graphics.length < 40, 'static scenery must batch instead of creating a node per blade')
      const instructions = graphics.reduce((sum, graphic) => sum + graphic.context.instructions.length, 0)
      budgets.push(instructions)
      assert.ok(instructions > 150 && instructions < 8000, `${garden} has a bounded static drawing budget`)
      for (const node of objects) assert.ok(!node.filters || node.filters.length === 0)
      assert.equal(scene.root.eventMode, 'none')
    } finally { scene.destroy() }
    for (const context of contexts) assert.equal(context.destroyed, true)
    assert.doesNotThrow(() => scene.destroy())
  }
  assert.equal(new Set(budgets).size, 4, 'each landscape has its own static composition')
})

test('ambient animation changes only transforms and leaves close-up transition ownership to the camera', () => {
  for (const garden of gardenIds) {
    const scene = createGardenMemorialScene(390, 768, garden, 1)
    try {
      const nodes = descendants(scene.root)
      const instructions = nodes.filter((node): node is Graphics => node instanceof Graphics).map(node => node.context.instructions.length)
      scene.monument.position.set(123, 147)
      scene.monument.scale.set(.75)
      const snapshot = () => nodes.map(node => [node.x, node.y, node.scale.x, node.scale.y, node.rotation, node.alpha, node.skew.x])
      scene.update(0)
      const initial = snapshot()
      scene.update(25)
      const animated = snapshot()
      assert.notDeepEqual(animated, initial, `${garden} has gentle ambient motion`)
      scene.update(0)
      assert.deepEqual(snapshot(), initial, 'paused/reduced-motion callers can hold an exact frame')
      scene.update(25)
      assert.deepEqual(snapshot(), animated, 'time is supplied by the existing renderer rather than a second clock')
      assert.equal(scene.monument.x, 123)
      assert.equal(scene.monument.y, 147)
      assert.equal(scene.monument.scale.x, .75)
      assert.deepEqual(nodes.filter((node): node is Graphics => node instanceof Graphics).map(node => node.context.instructions.length), instructions)
      scene.update(Number.NaN)
      for (const row of snapshot()) for (const value of row) assert.ok(Number.isFinite(value))
    } finally { scene.destroy() }
  }
})

test('lake close-up aligns the existing rain ripple shader with its painted water', () => {
  const scene = createGardenMemorialScene(1200, 900, 'lake', 1)
  try {
    const pond = getGardenLayout(1200, 1000, 'lake').features.ponds[0]!
    const view = scene.atmosphereView
    const visual = scene.layout.visual
    assert.ok(view.scale > 0)
    assert.equal(pond.x * view.scale + view.x, visual.left + visual.width * .58)
    assert.equal(pond.y * view.scale + view.y, visual.height * .515)
  } finally { scene.destroy() }
})

test('close-up roots and monument foundations touch a continuous ground plane at every supported size', () => {
  for (const garden of gardenIds) {
    for (const [width, height] of [[1440, 900], [390, 768], [320, 450], [844, 300]]) {
      const scene = createGardenMemorialScene(width!, height!, garden, 1)
      try {
        const visual = scene.layout.visual
        assert.ok(scene.groundY >= visual.height * .7 && scene.groundY < visual.height)
        assert.equal(scene.groundY, scene.target.y + scene.target.scale * 32)
        assert.ok(scene.contacts.length >= 10)
        for (const contact of scene.contacts) {
          assert.equal(contact.node.x, contact.x)
          assert.equal(contact.node.y, contact.y)
          assert.ok(contact.x >= visual.left && contact.x <= visual.left + visual.width)
          assert.ok(contact.y + .001 >= visual.height * .63, `${garden} ${contact.kind} must grow from solid ground`)
          const bounds = contact.node.getLocalBounds()
          assert.ok(bounds.maxY >= 0, `${contact.kind} must reach its contact point`)
          assert.ok(bounds.minY < 0, `${contact.kind} must rise above its roots`)
          assert.ok(bounds.maxY <= contact.size * (contact.kind === 'tree' ? .15 : .36) + 6, `${contact.kind} must not hide a displaced origin under a tall shadow`)
        }
        if (garden === 'grove') assert.equal(scene.contacts.filter(contact => contact.kind === 'tree').length, 4)
        // The helper's random map bouquet is not enlarged into floating stems.
        const keepsakes = scene.monument.getChildByLabel('memorial-keepsakes')
        assert.ok(keepsakes)
        assert.equal(keepsakes.y, 0)
      } finally { scene.destroy() }
    }
  }
})

test('close-up overscan fills the reveal frame without moving its monument, roots or weather geography', () => {
  for (const garden of gardenIds) {
    for (const [width, height] of [[1440, 900], [390, 768]]) {
      const margin = { x: 160, y: 100 }
      const original = createGardenMemorialScene(width!, height!, garden, 1)
      const extended = createGardenMemorialScene(width!, height!, garden, 1, margin)
      try {
        assert.deepEqual(extended.layout, original.layout)
        assert.deepEqual(extended.target, original.target)
        assert.deepEqual(extended.atmosphereView, original.atmosphereView)
        assert.equal(extended.groundY, original.groundY)
        assert.deepEqual(extended.contacts.map(({ kind, x, y, size }) => ({ kind, x, y, size })), original.contacts.map(({ kind, x, y, size }) => ({ kind, x, y, size })))
        assert.equal(extended.monument.x, original.monument.x)
        assert.equal(extended.monument.y, original.monument.y)
        assert.equal(extended.monument.scale.x, original.monument.scale.x)
        const background = extended.root.getChildByLabel('memorial-scenery')!
        const bounds = background.getLocalBounds()
        assert.ok(bounds.minX <= -margin.x && bounds.minY <= -margin.y)
        assert.ok(bounds.maxX >= width! + margin.x && bounds.maxY >= height! + margin.y)
        const resolution = background.renderGroup!.textureOptions.resolution!
        assert.ok(resolution > 0 && resolution <= 2)
        assert.ok(Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * resolution <= 2048.001, 'the actual extended cache fits the texture budget')
        assert.equal(descendants(extended.root).length, descendants(original.root).length, 'overscan extends existing artwork rather than adding scene nodes')
      } finally { original.destroy(); extended.destroy() }
    }
  }
})

test('close-up overscan keeps small-view safety margins finite and clamps malformed input', () => {
  for (const margin of [{ x: 32, y: 32 }, { x: Number.NaN, y: -30 }, { x: Infinity, y: 1e9 }]) {
    const scene = createGardenMemorialScene(1, 1, 'meadow', 1, margin)
    try {
      const bounds = scene.root.getChildByLabel('memorial-scenery')!.getLocalBounds()
      assert.ok([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite))
      if (margin.x === 32) assert.ok(bounds.minX <= -32 && bounds.maxX >= 33)
      if (margin.y === 32) assert.ok(bounds.minY <= -32 && bounds.maxY >= 33)
    } finally { scene.destroy() }
  }
})

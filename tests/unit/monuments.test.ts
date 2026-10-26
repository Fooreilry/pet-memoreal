import assert from 'node:assert/strict'
import test from 'node:test'
import { Container, Graphics } from 'pixi.js'
import { getMonumentKind, monumentKinds } from '../../app/data/monuments'
import { createMonumentArt } from '../../app/utils/monumentArt'
import { gardenCapacity, gardenDemoPlaces, gardenIds } from '../../shared/gardens'

test('each garden shows all four monument kinds and every place keeps a stable assignment', () => {
  assert.equal(new Set(monumentKinds).size, 4)
  for (const garden of gardenIds) {
    const demoKinds = gardenDemoPlaces[garden].map(place => getMonumentKind(garden, place))
    assert.deepEqual(new Set(demoKinds), new Set(monumentKinds))
    const places = Array.from({ length: gardenCapacity[garden] }, (_, index) => index + 1)
    const initial = new Map(places.map(place => [place, getMonumentKind(garden, place)]))
    for (const place of [...places].reverse()) {
      const kind = getMonumentKind(garden, place)
      assert.ok(monumentKinds.includes(kind))
      assert.equal(kind, initial.get(place))
    }
  }
})

test('monument templates have distinct silhouettes within existing hit targets and bounded drawing work', () => {
  const draw = createMonumentArt()
  const root = new Container()
  const silhouettes = new Set<string>()
  try {
    for (const kind of monumentKinds) {
      const graphic = draw(kind)
      root.addChild(graphic)
      const bounds = graphic.bounds
      assert.ok(bounds.minX >= -45 && bounds.maxX <= 45, `${kind} must fit the hit target width`)
      assert.ok(bounds.minY >= -45 && bounds.maxY <= 55, `${kind} must fit the hit target height`)
      assert.ok(bounds.width > 40 && bounds.height > 45, `${kind} must remain legible at garden scale`)
      assert.ok(graphic.context.instructions.length > 0 && graphic.context.instructions.length < 120, `${kind} must have bounded static geometry`)
      assert.equal(graphic.eventMode, 'none')
      silhouettes.add([bounds.minY, bounds.maxY, bounds.width].map(value => Math.round(value * 10)).join(':'))
    }
    assert.equal(silhouettes.size, 4)
  } finally {
    root.destroy({ children: true, context: true })
  }
})

test('matching monuments share immutable geometry only within their scene factory', () => {
  const draw = createMonumentArt()
  const root = new Container()
  const otherRoot = new Container()
  try {
    const firstPass = monumentKinds.map(kind => root.addChild(draw(kind)))
    const secondPass = monumentKinds.map(kind => root.addChild(draw(kind)))
    assert.equal(new Set([...firstPass, ...secondPass].map(graphic => graphic.context)).size, 4)
    for (const [index, first] of firstPass.entries()) {
      const second = secondPass[index]!
      const instructions = first.context.instructions.length
      const bounds = { minX: first.bounds.minX, minY: first.bounds.minY, maxX: first.bounds.maxX, maxY: first.bounds.maxY }
      assert.notEqual(first, second)
      assert.equal(first.context, second.context)
      first.position.set(120, 240)
      second.scale.set(3)
      assert.deepEqual({ minX: first.bounds.minX, minY: first.bounds.minY, maxX: first.bounds.maxX, maxY: first.bounds.maxY }, bounds)
      assert.equal(second.context.instructions.length, instructions)
    }
    const otherDraw = createMonumentArt()
    const other = otherRoot.addChild(otherDraw(monumentKinds[0]))
    assert.notEqual(other.context, firstPass[0]!.context)
    root.destroy({ children: true, context: true })
    assert.equal(other.context.destroyed, false)
    assert.ok(other.bounds.width > 0)
  } finally {
    root.destroy({ children: true, context: true })
    otherRoot.destroy({ children: true, context: true })
  }
})

test('scene disposal releases shared and owned contexts once while destroying one view preserves its siblings', () => {
  const draw = createMonumentArt()
  const root = new Container()
  const first = root.addChild(draw('arch'))
  const sibling = root.addChild(draw('arch'))
  const owned = root.addChild(new Graphics().circle(0, 0, 5).fill(0x123456))
  const sharedContext = first.context
  const ownedContext = owned.context
  let unloads = 0
  sharedContext.on('unload', () => { unloads++ })
  try {
    first.destroy()
    assert.equal(sharedContext.destroyed, false)
    assert.ok(sibling.bounds.width > 0)
    root.destroy({ children: true, context: true })
    for (const object of [root, first, sibling, owned]) assert.equal(object.destroyed, true)
    assert.equal(sharedContext.destroyed, true)
    assert.equal(ownedContext.destroyed, true)
    assert.equal(unloads, 1)
    assert.doesNotThrow(() => root.destroy({ children: true, context: true }))
    assert.equal(unloads, 1)
  } finally {
    root.destroy({ children: true, context: true })
  }
})

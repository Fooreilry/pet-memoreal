import assert from 'node:assert/strict'
import test from 'node:test'
import { Container, Graphics } from 'pixi.js'
import type { Application } from 'pixi.js'
import type { GardenDiagnostics } from '../../app/utils/gardenDiagnostics'
import { gardenDiagnosticsAllowed } from '../../app/utils/gardenDiagnosticsFlag'
import { countGardenResources, observeGardenRenderer } from '../../app/utils/gardenDiagnosticsRuntime'

type DrawOptions = { container: Container, target?: unknown }
type Recorded = { cpuMs: number, active: boolean, path: 'automatic' | 'manual' }

function rendererFixture() {
  const stage = new Container()
  const draws: DrawOptions[] = []
  const samples: Recorded[] = []
  let active = true, manual = false, recording = true, activeReads = 0, manualReads = 0
  let implementation: ((options: DrawOptions) => unknown) | undefined
  const renderer = {
    render(options: DrawOptions): unknown {
      assert.equal(this, renderer, 'the renderer retains its receiver through the wrapper')
      draws.push(options)
      return implementation?.(options) ?? 'rendered'
    }
  }
  const application = { stage, renderer, render() { return this.renderer.render({ container: this.stage }) } }
  // Pixi registers this bound application callback before diagnostics attaches.
  const automaticRender = application.render.bind(application)
  const diagnostics = { get recording() { return recording }, render: (cpuMs: number, isActive: boolean, path: Recorded['path']) => samples.push({ cpuMs, active: isActive, path }) } as unknown as GardenDiagnostics
  const original = renderer.render
  const release = observeGardenRenderer(application as unknown as Application, diagnostics, () => { activeReads++; return active }, () => { manualReads++; return manual })
  return {
    application, renderer, original, stage, draws, samples, automaticRender, release,
    setRecording: (value: boolean) => { recording = value }, reads: () => ({ active: activeReads, manual: manualReads }),
    setActive: (value: boolean) => { active = value }, setManual: (value: boolean) => { manual = value },
    setImplementation: (value?: (options: DrawOptions) => unknown) => { implementation = value }
  }
}

test('diagnostics runtime flag accepts only explicit booleans and supported environment strings', () => {
  for (const value of [true, 'true', '1']) assert.equal(gardenDiagnosticsAllowed(value), true)
  for (const value of [undefined, null, false, '', 'false', '0', 0, 1, -1, 'TRUE', 'True', ' true ', 'yes', {}, [], ['true'], new Boolean(true)]) {
    assert.equal(gardenDiagnosticsAllowed(value), false)
  }
})

test('idle recording preserves real draws without reporting samples or reading measurement context', () => {
  const fixture = rendererFixture()
  try {
    fixture.setRecording(false)
    assert.equal(fixture.automaticRender(), 'rendered')
    fixture.setManual(true)
    assert.equal(fixture.application.render(), 'rendered')
    assert.equal(fixture.draws.length, 2)
    assert.deepEqual(fixture.samples, [])
    assert.deepEqual(fixture.reads(), { active: 0, manual: 0 })
    fixture.setRecording(true)
    fixture.application.render()
    assert.equal(fixture.samples.length, 1)
    assert.equal(fixture.samples[0]!.path, 'manual')
    assert.deepEqual(fixture.reads(), { active: 1, manual: 1 })
    fixture.setRecording(false)
    fixture.automaticRender()
    assert.equal(fixture.draws.length, 4)
    assert.equal(fixture.samples.length, 1)
    assert.deepEqual(fixture.reads(), { active: 1, manual: 1 })
  } finally { fixture.release(); fixture.stage.destroy() }
})

test('renderer entry observes the pre-bound automatic callback and later manual draws', () => {
  const fixture = rendererFixture()
  try {
    assert.equal(fixture.automaticRender(), 'rendered')
    assert.equal(fixture.samples.length, 1)
    assert.equal(fixture.samples[0]!.path, 'automatic')
    assert.equal(fixture.samples[0]!.active, true)
    fixture.setManual(true)
    fixture.application.render()
    fixture.setActive(false)
    fixture.application.render()
    assert.deepEqual(fixture.samples.map(({ path, active }) => ({ path, active })), [
      { path: 'automatic', active: true }, { path: 'manual', active: true }, { path: 'manual', active: false }
    ])
    assert.equal(fixture.draws.length, 3)
    for (const sample of fixture.samples) assert.ok(Number.isFinite(sample.cpuMs) && sample.cpuMs >= 0)
  } finally { fixture.release(); fixture.stage.destroy() }
})

test('offscreen targets, child cache passes and recursive renderer calls never count as main draws', () => {
  const fixture = rendererFixture()
  const child = new Container()
  fixture.stage.addChild(child)
  try {
    fixture.renderer.render({ container: fixture.stage, target: {} })
    fixture.renderer.render({ container: child })
    fixture.renderer.render({ container: child, target: {} })
    assert.equal(fixture.samples.length, 0)
    let nested = false
    fixture.setImplementation(() => {
      if (!nested) {
        nested = true
        fixture.renderer.render({ container: child, target: {} })
        fixture.renderer.render({ container: fixture.stage, target: {} })
        fixture.renderer.render({ container: fixture.stage })
      }
    })
    fixture.automaticRender()
    assert.equal(fixture.samples.length, 1, 'one outer main draw is recorded even if internal passes re-enter the renderer')
    assert.equal(fixture.samples[0]!.path, 'automatic')
    assert.equal(fixture.draws.length, 7)
    fixture.setImplementation(undefined)
    fixture.renderer.render({ container: fixture.stage, target: null })
    assert.equal(fixture.samples.length, 2, 'the default framebuffer remains a main draw when its explicit target is null')
  } finally { fixture.release(); fixture.stage.destroy({ children: true }) }
})

test('a failed main draw is not measured and cannot leave the observer in nested-render state', () => {
  const fixture = rendererFixture()
  try {
    fixture.setImplementation(() => { throw new Error('GPU fixture failed') })
    assert.throws(() => fixture.automaticRender(), /GPU fixture failed/)
    assert.equal(fixture.samples.length, 0)
    fixture.setImplementation(undefined)
    assert.doesNotThrow(() => fixture.automaticRender())
    assert.equal(fixture.samples.length, 1)
    assert.equal(fixture.samples[0]!.path, 'automatic')
  } finally { fixture.release(); fixture.stage.destroy() }
})

test('observer cleanup restores its renderer entry and preserves a later installed wrapper', () => {
  const fixture = rendererFixture()
  try {
    fixture.automaticRender()
    fixture.release()
    assert.equal(fixture.renderer.render, fixture.original)
    fixture.automaticRender()
    assert.equal(fixture.samples.length, 1)
    fixture.release()
    assert.equal(fixture.renderer.render, fixture.original)
  } finally { fixture.release(); fixture.stage.destroy() }

  const layered = rendererFixture()
  try {
    const previous = layered.renderer.render
    let externalCalls = 0
    const external = (options: DrawOptions) => { externalCalls++; return previous.call(layered.renderer, options) }
    layered.renderer.render = external
    layered.release()
    assert.equal(layered.renderer.render, external, 'cleanup cannot overwrite another owner’s wrapper')
    layered.automaticRender()
    assert.equal(externalCalls, 1)
  } finally { layered.release(); layered.stage.destroy() }
})

test('resource inventory counts live containers, graphics and cache nodes without estimating GPU memory', () => {
  const stage = new Container(), branch = new Container(), cached = new Container()
  const first = new Graphics(), second = new Graphics(), cachedArt = new Graphics()
  stage.addChild(branch, cached)
  branch.addChild(first, second)
  cached.addChild(cachedArt)
  cached.cacheAsTexture({ resolution: 1 })
  try {
    assert.deepEqual(countGardenResources(stage, 2, 1), { containers: 3, graphics: 3, texts: 0, cacheNodes: 1, renderTextures: 2, atmospherePasses: 1, totalNodes: 6 })
    second.destroy({ context: true })
    assert.deepEqual(countGardenResources(stage), { containers: 3, graphics: 2, texts: 0, cacheNodes: 1, renderTextures: 0, atmospherePasses: 0, totalNodes: 5 })
    // A disposed child can briefly remain in a consumer's stale scene snapshot.
    branch.children.push(second)
    try { assert.equal(countGardenResources(stage).totalNodes, 5) } finally { branch.children.pop() }
    cached.cacheAsTexture(false)
    assert.equal(countGardenResources(stage).cacheNodes, 0)
  } finally { stage.destroy({ children: true, context: true }) }
  assert.deepEqual(countGardenResources(), { containers: 0, graphics: 0, texts: 0, cacheNodes: 0, renderTextures: 0, atmospherePasses: 0, totalNodes: 0 })
  assert.equal(countGardenResources(stage).totalNodes, 0, 'a destroyed stage itself is excluded')
})

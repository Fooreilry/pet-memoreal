import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { DOMAdapter } from 'pixi.js'
import type { Filter, GlProgram, Graphics, WebGLRenderer } from 'pixi.js'
import { createGardenAtmosphere, gardenAtmosphereResolution } from '../../app/utils/gardenAtmosphere'
import { gardenIds } from '../../shared/gardens'
import { getGardenLayout } from '../../app/data/gardenLayout'

// Shader construction probes precision only; actual GL compilation is browser-tested.
const browserAdapter = DOMAdapter.get()
DOMAdapter.set({ ...browserAdapter, createCanvas: () => ({ getContext: () => null }) as unknown as ReturnType<typeof browserAdapter.createCanvas> })
after(() => DOMAdapter.set(browserAdapter))

function rendererFixture(linked: boolean | Error = true) {
  let compilations = 0, linkChecks = 0, disposals = 0, resets = 0
  const deleted: WebGLProgram[] = []
  const programs: Record<number, { program: WebGLProgram, destroy: () => void }> = {}
  const sync: Record<number, unknown> = {}
  const uniform: Record<string, Record<number, unknown>> = { atmosphere: {} }
  const gl = {
    LINK_STATUS: 35714,
    getProgramParameter: (_program: WebGLProgram, name: number) => {
      assert.equal(name, 35714)
      linkChecks++
      return linked
    },
    deleteProgram: (program: WebGLProgram) => { deleted.push(program) }
  }
  const shader = {
    _programDataHash: programs,
    _shaderSyncFunctions: sync,
    _activeProgram: null as GlProgram | null,
    _getProgramData: (program: GlProgram) => {
      compilations++
      if (linked instanceof Error) throw linked
      const data = { program: {} as WebGLProgram, destroy: () => { disposals++ } }
      programs[program._key] = data
      sync[program._key] = () => {}
      uniform.atmosphere![program._key] = () => {}
      return data
    },
    resetState: () => { shader._activeProgram = null; resets++ }
  }
  const renderer = { gl, shader, uniformGroup: { _uniformGroupSyncHash: uniform } } as unknown as WebGLRenderer
  return { renderer, shader, programs, sync, uniform, deleted, counts: () => ({ compilations, linkChecks, disposals, resets }) }
}

test('preparation validates a silent GL link failure before any filtered pass and avoids duplicate compilation', () => {
  for (const linked of [true, false, new Error('GPU compile unavailable')]) {
    const fixture = rendererFixture(linked)
    const atmosphere = createGardenAtmosphere(390, 844, 'lake')
    try {
      assert.equal(atmosphere.prepare(fixture.renderer), linked === true)
      if (!(linked instanceof Error)) {
        assert.equal(atmosphere.prepare(fixture.renderer), linked)
        assert.deepEqual(fixture.counts(), { compilations: 1, linkChecks: 1, disposals: 0, resets: 0 })
      }
    } finally { atmosphere.destroy() }
    assert.equal(fixture.deleted.length, linked instanceof Error ? 0 : 1)
    assert.equal(Object.keys(fixture.programs).length, 0)
    assert.equal(Object.keys(fixture.sync).length, 0)
    assert.equal(Object.keys(fixture.uniform.atmosphere!).length, 0)
    assert.equal(atmosphere.prepare(fixture.renderer), false)
  }
})

test('prepared GPU programs and aliases are released once without invalidating another atmosphere', () => {
  const fixture = rendererFixture()
  const first = createGardenAtmosphere(1440, 1000, 'lake')
  const second = createGardenAtmosphere(390, 844, 'grove')
  const firstProgram = ((first.root.children[0] as Graphics).filters![0] as Filter).glProgram!
  const secondProgram = ((second.root.children[0] as Graphics).filters![0] as Filter).glProgram!
  try {
    assert.notEqual(firstProgram._key, secondProgram._key)
    assert.equal(first.prepare(fixture.renderer), true)
    assert.equal(second.prepare(fixture.renderer), true)
    fixture.shader._activeProgram = firstProgram
    first.destroy()
    assert.equal(fixture.programs[firstProgram._key], undefined)
    assert.ok(fixture.programs[secondProgram._key])
    assert.ok(secondProgram.vertex)
    assert.equal(fixture.deleted.length, 1)
    assert.deepEqual(fixture.counts(), { compilations: 2, linkChecks: 2, disposals: 1, resets: 1 })
    first.destroy()
    assert.equal(fixture.deleted.length, 1)
  } finally { first.destroy(); second.destroy() }
  assert.equal(fixture.deleted.length, 2)
  assert.equal(Object.keys(fixture.programs).length, 0)
})

test('atmosphere work is bounded by viewport size rather than device pixel ratio or the garden world', () => {
  for (const [width, height] of [[390, 844], [1440, 1000], [3840, 2160], [7680, 4320]]) {
    const resolution = gardenAtmosphereResolution(width!, height!)
    assert.ok(resolution > 0 && resolution <= 0.5)
    assert.ok(Math.max(width!, height!) * resolution <= 768)
  }
})

test('weather tracks the camera and real lake geography without rebuilding geometry or uniform arrays', () => {
  const atmosphere = createGardenAtmosphere(1440, 1000, 'lake')
  try {
    const surface = atmosphere.root.children[0] as Graphics
    const filter = surface.filters![0] as Filter
    const uniforms = filter.resources.atmosphereUniforms.uniforms
    const view = uniforms.uView
    const viewport = uniforms.uViewport
    const [first, second] = getGardenLayout(1200, 1000, 'lake').features.ponds
    assert.deepEqual([...uniforms.uPond0], [first!.x, first!.y, first!.rx, first!.ry])
    assert.deepEqual([...uniforms.uPond1], [second!.x, second!.y, second!.rx, second!.ry])
    const geometry = surface.context
    atmosphere.setView({ x: -35, y: 18, scale: 1.5 })
    assert.equal(uniforms.uView, view)
    assert.deepEqual([...view], [-35, 18, 1.5, 0])
    atmosphere.resize(390, 844)
    assert.equal(uniforms.uViewport, viewport)
    assert.deepEqual([...viewport], [390, 844])
    atmosphere.setView({ x: 15, y: -400, scale: 4 })
    assert.deepEqual([...view], [15, -400, 4, 0])
    assert.equal(surface.context, geometry)
    assert.equal(surface.context.instructions.length, 1)
    atmosphere.setGarden('meadow')
    atmosphere.setGarden('lake')
    assert.deepEqual([...uniforms.uPond0], [first!.x, first!.y, first!.rx, first!.ry])
    atmosphere.setView({ x: Number.NaN, y: Number.POSITIVE_INFINITY, scale: 0 })
    assert.equal(view[0], 0)
    assert.equal(view[1], 0)
    assert.ok(view[2] > 0)
  } finally { atmosphere.destroy() }
})

test('rain has a seconds clock that freezes with the atmosphere and repeats its bounded cycle', () => {
  const atmosphere = createGardenAtmosphere(390, 844, 'lake')
  try {
    const uniforms = ((atmosphere.root.children[0] as Graphics).filters![0] as Filter).resources.atmosphereUniforms.uniforms
    atmosphere.update(0)
    assert.equal(uniforms.uWeatherTime, 0)
    atmosphere.update(0.4)
    assert.equal(uniforms.uWeatherTime, 0.4)
    assert.ok(Math.abs(uniforms.uTime - 0.01) < 1e-12)
    atmosphere.setEnabled(false)
    atmosphere.update(1)
    assert.equal(uniforms.uWeatherTime, 0.4)
    atmosphere.setEnabled(true)
    atmosphere.update(128.4)
    assert.ok(Math.abs(uniforms.uWeatherTime - 0.4) < 1e-10)
    atmosphere.update(Number.NaN)
    assert.equal(uniforms.uWeatherTime, 0)
  } finally { atmosphere.destroy() }
})

test('one non-interactive atmospheric pass reuses its geometry and uniforms across themes and time', () => {
  const atmosphere = createGardenAtmosphere(390, 844, 'meadow')
  try {
    const surface = atmosphere.root.children[0] as Graphics
    const filter = surface.filters![0] as Filter
    const context = surface.context
    const uniforms = filter.resources.atmosphereUniforms.uniforms
    const themes = new Set<number>()
    assert.equal(atmosphere.root.eventMode, 'none')
    assert.equal(atmosphere.root.interactiveChildren, false)
    assert.equal(surface.eventMode, 'none')
    assert.equal(atmosphere.root.children.length, 1)
    assert.equal(surface.filters!.length, 1)
    assert.equal(filter.blendRequired, false)
    assert.equal(filter.padding, 0)
    assert.equal(filter.antialias, 'off')
    assert.equal(filter.resolution, 0.5)
    for (const id of gardenIds) {
      atmosphere.setGarden(id)
      themes.add(uniforms.uTheme)
      atmosphere.update(40)
      assert.equal(uniforms.uTime, 1)
      assert.equal(surface.context, context)
      assert.equal(surface.context.instructions.length, 1)
      assert.equal(surface.filters![0], filter)
    }
    assert.equal(themes.size, gardenIds.length)
    atmosphere.resize(3840, 2160)
    assert.equal(filter.resolution, 0.2)
    assert.equal(uniforms.uAspect, 3840 / 2160)
    assert.equal(surface.context.instructions.length, 1)
    assert.equal(surface.filterArea!.width, 3840)
    assert.equal(surface.filterArea!.height, 2160)
    atmosphere.update(Number.NaN)
    assert.equal(uniforms.uTime, 0)
    atmosphere.update(40)
    atmosphere.setEnabled(false)
    atmosphere.update(80)
    assert.equal(atmosphere.root.visible, false)
    assert.equal(uniforms.uTime, 1)
    atmosphere.setEnabled(true)
    atmosphere.update(80)
    assert.equal(uniforms.uTime, 2)
  } finally { atmosphere.destroy() }
})

test('disposing an atmosphere releases its filter, program and drawing context without breaking another scene', () => {
  const first = createGardenAtmosphere(1440, 1000, 'lake')
  const second = createGardenAtmosphere(390, 844, 'grove')
  const surface = first.root.children[0] as Graphics
  const context = surface.context
  const filter = surface.filters![0] as Filter
  const program = filter.glProgram!
  const otherFilter = (second.root.children[0] as Graphics).filters![0] as Filter
  let destroyed = 0
  filter.on('destroy', () => { destroyed++ })
  try {
    assert.notEqual(program, otherFilter.glProgram)
    // The same disposal path is used when the parent destroys the whole stage.
    first.root.destroy({ children: true, context: true })
    assert.equal(first.root.destroyed, true)
    assert.equal(context.destroyed, true)
    assert.equal(filter.glProgram, null)
    assert.equal(program.vertex, null)
    assert.equal(program.fragment, null)
    assert.equal(destroyed, 1)
    first.destroy()
    first.resize(640, 480)
    first.setGarden('hill')
    first.update(120)
    first.setEnabled(true)
    assert.equal(destroyed, 1)
    assert.ok(otherFilter.glProgram!.vertex)
    second.update(80)
    assert.equal(otherFilter.resources.atmosphereUniforms.uniforms.uTime, 2)
  } finally { first.destroy(); second.destroy() }
})

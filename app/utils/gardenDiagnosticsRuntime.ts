import { Graphics, Text } from 'pixi.js'
import type { Application, Container } from 'pixi.js'
import type { GardenDiagnostics, GardenDiagnosticResources } from './gardenDiagnostics'

/** Inventory of live scene objects, not an estimate of GPU memory or driver allocations. */
export function countGardenResources(stage?: Container, renderTextures = 0, atmospherePasses = 0): GardenDiagnosticResources {
  const result = { containers: 0, graphics: 0, texts: 0, cacheNodes: 0, renderTextures, atmospherePasses, totalNodes: 0 }
  const stack = stage ? [stage] : []
  while (stack.length) {
    const node = stack.pop()!
    if (node.destroyed) continue
    result.totalNodes++
    if (node instanceof Graphics) result.graphics++
    else if (node instanceof Text) result.texts++
    else result.containers++
    if (node.isCachedAsTexture) result.cacheNodes++
    stack.push(...node.children)
  }
  return result
}

/** Renderer entry captures both Pixi's bound ticker callback and manual app.render(). */
export function observeGardenRenderer(app: Application, diagnostics: GardenDiagnostics, active: () => boolean, manual: () => boolean) {
  const renderer = app.renderer
  const original = renderer.render
  let depth = 0
  const observed = function (...args: unknown[]) {
    const options = args[0] as { container?: Container, target?: unknown } | undefined
    const main = diagnostics.recording && depth === 0 && options?.container === app.stage && options?.target == null
    const started = main ? performance.now() : 0
    depth++
    try {
      const value = Reflect.apply(original, renderer, args)
      if (main) diagnostics.render(performance.now() - started, active(), manual() ? 'manual' : 'automatic')
      return value
    } finally { depth-- }
  } as typeof original
  renderer.render = observed
  return () => { if (renderer.render === observed) renderer.render = original }
}

import { Container, Graphics } from 'pixi.js'
import { getLakeSceneryLayout } from '../data/lakeScenery'

// Two small cached wisps, never a full-screen translucent layer or blur filter.
export function createLakeAmbience(parent: Container, width: number, height: number) {
  const { ponds } = getLakeSceneryLayout(width, height)
  const mist = [ponds[0]!, ponds.at(-1)!].map((pond, index) => {
    const wisp = new Container()
    wisp.eventMode = 'none'
    const art = new Graphics()
    const rx = Math.min(90, pond.rx * 0.53)
    const ry = Math.min(9, pond.ry * 0.22)
    art.ellipse(0, 0, rx, ry).fill({ color: 0xd8e9dc, alpha: 0.035 })
      .ellipse(-rx * 0.15, -ry * 0.1, rx * 0.76, ry * 0.76).fill({ color: 0xd8e9dc, alpha: 0.05 })
      .ellipse(rx * 0.15, ry * 0.15, rx * 0.56, ry * 0.54).fill({ color: 0xe4eedf, alpha: 0.04 })
      .ellipse(0, ry * 0.05, rx * 0.36, ry * 0.35).fill({ color: 0xe4eedf, alpha: 0.04 })
    wisp.addChild(art)
    wisp.cacheAsTexture({ resolution: 1, antialias: false })
    parent.addChild(wisp)
    return { wisp, x: pond.x - pond.rx * 0.08, y: pond.y - pond.ry * 0.08, phase: index * 2.8 }
  })
  const ripples = Array.from({ length: 3 }, (_, index) => {
    const pond = index === 2 ? ponds.at(-1)! : ponds[0]!
    const ripple = new Graphics().ellipse(0, 0, 18 + index * 7, 3 + index).stroke({ color: 0xc8e2cf, width: 0.8 })
    ripple.eventMode = 'none'
    ripple.position.set(pond.x + pond.rx * (index % 2 ? 0.15 : -0.2), pond.y + pond.ry * 0.18)
    parent.addChild(ripple)
    return ripple
  })
  return (time: number) => {
    for (const { wisp, x, y, phase } of mist) {
      wisp.position.set(x + Math.sin(time * 0.055 + phase) * 6, y + Math.cos(time * 0.07 + phase) * 1.5)
      wisp.alpha = 0.74 + Math.sin(time * 0.09 + phase) * 0.08
    }
    for (let index = 0; index < ripples.length; index++) {
      const ripple = ripples[index]!
      const progress = (time * 0.1 + index / 3) % 1
      ripple.scale.set(0.5 + progress)
      ripple.alpha = Math.sin(progress * Math.PI) * 0.3
    }
  }
}

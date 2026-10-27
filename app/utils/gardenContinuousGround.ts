import type { Graphics } from 'pixi.js'
import type { GardenId } from '../data/demoGardens'
import type { GardenView } from './gardenProjection'
import { getGardenLayout, sampleGardenCurve } from '../data/gardenLayout'
import { streamBounds } from '../data/gardenPlacement'
import { gardenWorldCellSeed, gardenWorldContains, gardenWorldIntersects, gardenWorldRandom } from '../data/gardenSurroundings'

type GroundMark = { id: string, x: number, y: number, size: number, lean: number, seed: number }
type GroundPatch = { id: string, x: number, y: number, rx: number, ry: number, shade: boolean }
export const continuousGroundColors = {
  meadow: { ground: 0x477451, shade: 0x234e36, turf: 0x8eae77, light: 0xb2c78f, earth: 0xa9a781, moss: 0x739456 },
  lake: { ground: 0x2e605a, shade: 0x173f38, turf: 0x80a78a, light: 0xa7c6a4, earth: 0x9ba997, moss: 0x648b64 },
  grove: { ground: 0x305e4a, shade: 0x173e30, turf: 0x789b6a, light: 0xa8ba88, earth: 0x9a9b72, moss: 0x6c8d56 },
  hill: { ground: 0x3d6b52, shade: 0x214c37, turf: 0x8dac75, light: 0xb0c594, earth: 0xa3ad8d, moss: 0x77995b }
}

// One world-anchored texture continues through the former map boundary.
export function getContinuousGroundLayout(bounds: GardenView, garden: GardenId, seed: number, extraObstacles: GardenView[] = []) {
  const layout = getGardenLayout(1200, 1000, garden)
  const obstacles = [
    ...layout.places.map(place => ({ left: place.x - 70, right: place.x + 70, top: place.y - 55, bottom: place.y + 70 })),
    ...layout.features.ponds.map(pond => ({ left: pond.x - pond.rx - 10, right: pond.x + pond.rx + 10, top: pond.y - pond.ry - 10, bottom: pond.y + pond.ry + 10 })),
    ...streamBounds(layout.features.stream, 20),
    ...layout.paths.flatMap(path => streamBounds(Array.from({ length: 41 }, (_, index) => sampleGardenCurve(path.curve, index / 40)), path.width / 2 + 6)),
    ...extraObstacles
  ]
  const patches: GroundPatch[] = [], grass: GroundMark[] = [], moss: GroundMark[] = [], flecks: GroundMark[] = []
  if (![bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite)
    || bounds.right <= bounds.left || bounds.bottom <= bounds.top) return { patches, grass, moss, flecks, obstacles }
  let cells = 0
  for (let cy = Math.floor(bounds.top / 160); cy <= Math.floor(bounds.bottom / 160) && cells < 768; cy++) {
    for (let cx = Math.floor(bounds.left / 160); cx <= Math.floor(bounds.right / 160) && cells < 768; cx++, cells++) {
      const cellSeed = gardenWorldCellSeed(cx, cy, garden, seed + 1709)
      const random = gardenWorldRandom(cellSeed)
      if (random() < 0.42) {
        const patch = { id: `${cx}:${cy}`, x: cx * 160 + 55 + random() * 50, y: cy * 160 + 40 + random() * 80,
          rx: 46 + random() * 28, ry: 18 + random() * 15, shade: random() < 0.3 }
        if (gardenWorldContains(bounds, { left: patch.x - patch.rx, right: patch.x + patch.rx, top: patch.y - patch.ry, bottom: patch.y + patch.ry })) patches.push(patch)
      }
      for (let index = 0; index < 5; index++) {
        const size = index < 3 ? 2 + random() * 4 : index === 3 ? 3 + random() * 4 : 1 + random() * 1.8
        const mark = { id: `${cx}:${cy}:${index}`, x: cx * 160 + 9 + random() * 142, y: cy * 160 + 9 + random() * 142,
          size, lean: random() * 2 - 1, seed: cellSeed + index }
        const footprint = { left: mark.x - size - 1, right: mark.x + size + 1, top: mark.y - size - 1, bottom: mark.y + size + 1 }
        if (!gardenWorldContains(bounds, footprint) || obstacles.some(rect => gardenWorldIntersects(footprint, rect))) continue
        if (index < 3) grass.push(mark)
        else if (index === 3) moss.push(mark)
        else flecks.push(mark)
      }
    }
  }
  return { patches, grass, moss, flecks, obstacles }
}

export function drawContinuousGardenGround(g: Graphics, bounds: GardenView, garden: GardenId, seed: number, extraObstacles: GardenView[] = []) {
  const palette = continuousGroundColors[garden]
  const plan = getContinuousGroundLayout(bounds, garden, seed, extraObstacles)
  g.rect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top).fill(palette.ground)
  for (const shade of [false, true]) {
    for (const { x, y, rx, ry } of plan.patches.filter(patch => patch.shade === shade)) {
      g.moveTo(x - rx, y)
        .bezierCurveTo(x - rx * 0.8, y - ry, x + rx * 0.2, y - ry * 0.7, x + rx * 0.8, y - ry * 0.3)
        .bezierCurveTo(x + rx, y + ry * 0.2, x + rx * 0.4, y + ry * 0.8, x - rx * 0.3, y + ry * 0.65)
        .bezierCurveTo(x - rx * 0.75, y + ry * 0.6, x - rx, y + ry * 0.2, x - rx, y).closePath()
    }
    g.fill({ color: shade ? palette.shade : palette.turf, alpha: shade ? 0.1 : 0.075 })
  }
  for (const tone of [0, 1]) {
    for (const { x, y, size, lean } of plan.grass.filter(mark => mark.seed % 2 === tone)) {
      for (let blade = 0; blade < 3; blade++) {
        const xx = x + (blade - 1) * size * 0.3, length = size * (blade === 1 ? 1 : 0.65)
        g.moveTo(xx, y).quadraticCurveTo(xx + lean * size * 0.25, y - length * 0.6, xx + lean * size * 0.6, y - length)
      }
    }
    g.stroke({ color: tone ? palette.light : palette.shade, width: 0.8, alpha: tone ? 0.2 : 0.25 })
    for (const { x, y, size, lean } of plan.moss.filter(mark => mark.seed % 2 === tone)) {
      g.ellipse(x - size * 0.35, y, size * 0.48, size * 0.28)
        .ellipse(x + size * 0.28, y - size * 0.25, size * 0.38, size * 0.28)
        .ellipse(x + lean * size * 0.25, y + size * 0.2, size * 0.35, size * 0.22)
    }
    g.fill({ color: tone ? palette.moss : palette.turf, alpha: 0.23 })
    for (const { x, y, size, lean } of plan.flecks.filter(mark => mark.seed % 2 === tone)) {
      g.moveTo(x - size, y).lineTo(x + size * lean, y - size * 0.5).lineTo(x + size * 0.7, y + size * 0.15).closePath()
    }
    g.fill({ color: tone ? palette.earth : palette.shade, alpha: 0.2 })
  }
  return plan
}

import type { GardenId } from './demoGardens'
import { getGardenLayout, sampleGardenCurve } from './gardenLayout'
import { sceneryBounds, sceneryIntersects, sceneryRandom, streamBounds } from './gardenPlacement'

export type GardenEdgePatch = { x: number, y: number, rx: number, ry: number, light: number }
export type GardenEdgeDetail = { x: number, y: number, size: number, angle: number }

export function getGardenFrameLayout(width: number, height: number, garden: GardenId) {
  const patches: GardenEdgePatch[] = [], details: GardenEdgeDetail[] = []
  if (width < 128 || height < 128) return { patches, details }
  const layout = getGardenLayout(width, height, garden)
  const scale = Math.min(width / 1200, height / 1000)
  const band = layout.frame.inset
  const random = sceneryRandom(layout.seed + 1709)
  const obstacles = [
    ...layout.chunks.map(chunk => chunk.protectedBounds),
    ...layout.features.ponds.map(pond => sceneryBounds(pond.x, pond.y, pond.rx + 12 * scale, pond.ry + 12 * scale, pond.ry + 12 * scale)),
    ...streamBounds(layout.features.stream, 25 * scale),
    ...layout.paths.flatMap(path => streamBounds(Array.from({ length: 49 }, (_, index) => sampleGardenCurve(path.curve, index / 48)), path.width / 2 + 8 * scale))
  ]
  for (let side = 0; side < 4; side++) {
    const horizontal = side < 2
    const length = horizontal ? width : height
    const count = horizontal ? 10 : 8
    for (let index = 0; index < count; index++) {
      const long = (18 + random() * 22) * scale
      const short = (8 + random() * 10) * scale
      // Uneven small groups leave broad breaks instead of tracing a continuous rim.
      const groups = Math.ceil(count / 3)
      const along = Math.max(long, Math.min(length - long, (0.04 + (Math.floor(index / 3) + 0.15 + random() * 0.7) / groups * 0.92) * length))
      const depth = short + random() * Math.max(0, band - short * 2)
      const x = horizontal ? along : side === 2 ? depth : width - depth
      const y = horizontal ? side === 0 ? depth : height - depth : along
      const rx = horizontal ? long : short, ry = horizontal ? short : long
      if (obstacles.some(rect => sceneryIntersects(sceneryBounds(x, y, rx, ry, ry), rect, 4 * scale))) continue
      patches.push({ x, y, rx, ry, light: 0.7 + random() * 0.3 })
      if (index % 2) continue
      const size = (2.5 + random() * 2.5) * scale
      // Flat flecks stay within their accepted bank patch, leaving every route open.
      details.push({ x: x + (random() - 0.5) * rx, y: y + (random() - 0.5) * ry, size, angle: random() * Math.PI })
    }
  }
  return { patches, details }
}

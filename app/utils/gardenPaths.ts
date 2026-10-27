import type { Graphics } from 'pixi.js'
import type { GardenId } from '../data/demoGardens'
import { getGardenPaths, getPathSurface } from '../data/gardenPaths'
import type { GardenPath, PathPoint } from '../data/gardenPaths'
import { getMemorialLayout } from '../data/demoMemorials'

const palettes = {
  meadow: { earth: 0x617048, seam: 0xa39c72, stones: [0x9caa85, 0xa8b490, 0x94a37e, 0xb0b996], edge: 0xd1d4ae, moss: 0x6d945d },
  lake: { earth: 0x416857, seam: 0x9aa08a, stones: [0x8b9f8d, 0x97ab97, 0x809b89, 0xa4b29d], edge: 0xc7cfb3, moss: 0x648b63 },
  grove: { earth: 0x36543c, seam: 0x727957, stones: [0x819271, 0x91a080, 0x788a69, 0x9ba588], edge: 0xb9c19a, moss: 0x678d53 },
  hill: { earth: 0x3d6049, seam: 0x637b60, stones: [0x8f9e87, 0x9dac92, 0x84967e, 0xa9b69b], edge: 0xd0d4b4, moss: 0x73975c }
}

const surfaces = {
  meadow: { shoulder: 0.2, soil: 0.37, stoneInterval: 9, stoneAlpha: 0.58 },
  lake: { shoulder: 0.2, soil: 0.3, stoneInterval: 3, stoneAlpha: 0.7 },
  grove: { shoulder: 0.15, soil: 0.23, stoneInterval: 6, stoneAlpha: 0.52 },
  hill: { shoulder: 0, soil: 0, stoneInterval: 1, stoneAlpha: 0 }
}

function tracePolygon(g: Graphics, points: PathPoint[]) {
  g.moveTo(points[0]!.x, points[0]!.y)
  for (const point of points.slice(1)) g.lineTo(point.x, point.y)
  return g.closePath()
}

export function drawGardenPaths(g: Graphics, width: number, height: number, garden: GardenId, preview: boolean) {
  return drawGardenPathSegments(g, getGardenPaths(width, height, garden, preview), garden, preview ? [] : getMemorialLayout(width, height, garden).places, preview)
}

export function drawGardenPathSegments(g: Graphics, paths: GardenPath[], garden: GardenId, places: PathPoint[] = [], preview = false) {
  const palette = palettes[garden]
  const material = surfaces[garden]
  for (const path of paths) {
    const { left, right, stones: paving, tufts } = getPathSurface(path, preview, places)
    // Sparse stones leave the meadow as worn earth and the grove as a forest footpath.
    const stones = paving.filter((_, index) => index % material.stoneInterval === 0)
    const outline = [...left, ...right.toReversed()]
    const shoulder = (side: PathPoint[], opposite: PathPoint[]) => side.map((point, index) => ({ x: point.x + (point.x - opposite[index]!.x) * 0.13, y: point.y + (point.y - opposite[index]!.y) * 0.13 }))
    tracePolygon(g, [...shoulder(left, right), ...shoulder(right, left).toReversed()]).fill({ color: palette.earth, alpha: material.shoulder })
    tracePolygon(g, outline).fill({ color: palette.seam, alpha: material.soil })
    for (let index = 1; index < left.length - 1; index += 2) {
      const a = left[index]!, b = right[index]!
      const fraction = index % 3 === 0 ? 0.3 : 0.68
      g.ellipse(a.x + (b.x - a.x) * fraction, a.y + (b.y - a.y) * fraction, preview ? 0.7 : 1.2, 0.55)
    }
    g.fill({ color: palette.earth, alpha: 0.24 })
    // Batch equal materials and edge strokes, rather than issuing several fills per stone.
    for (let tone = 0; tone < 4; tone++) {
      const group = stones.filter(stone => stone.tone === tone)
      for (const stone of group) tracePolygon(g, stone.points)
      if (group.length) g.fill({ color: palette.stones[tone]!, alpha: material.stoneAlpha })
    }
    for (const stone of stones) {
      const [a, b, c] = stone.points
      g.moveTo(a!.x, a!.y).lineTo(b!.x, b!.y).lineTo(c!.x, c!.y)
    }
    if (stones.length) g.stroke({ color: palette.edge, width: 0.65, alpha: 0.4 })
    for (const stone of stones) {
      const [d, e, f] = stone.points.slice(3)
      g.moveTo(d!.x, d!.y).lineTo(e!.x, e!.y).lineTo(f!.x, f!.y)
    }
    if (stones.length) g.stroke({ color: palette.earth, width: 0.8, alpha: 0.5 })
    const cracks = stones.filter(stone => stone.cracked)
    for (const stone of cracks) {
      const start = stone.points[1]!, end = stone.points[5]!
      g.moveTo(start.x, start.y).lineTo((start.x + end.x) / 2 + 1, (start.y + end.y) / 2).lineTo(end.x, end.y)
    }
    if (cracks.length) g.stroke({ color: palette.earth, width: 0.65, alpha: 0.45 })
    const mossy = stones.filter(stone => stone.moss)
    for (const stone of mossy) {
      const point = stone.points[5]!
      g.ellipse(point.x, point.y, preview ? 1.5 : 2.4, 1.1).ellipse(point.x + 2, point.y - 0.5, 1.4, 0.8)
    }
    if (mossy.length) g.fill({ color: palette.moss, alpha: 0.85 })
    for (const point of tufts) g.ellipse(point.x, point.y, 3.8, 1.6)
    if (tufts.length) g.fill({ color: palette.moss, alpha: 0.65 })
    for (const point of tufts) {
      g.moveTo(point.x - 2, point.y).lineTo(point.x - 1, point.y - 3)
        .moveTo(point.x + 1, point.y).lineTo(point.x + 3, point.y - 2)
    }
    if (tufts.length) g.stroke({ color: palette.edge, width: 0.7, alpha: 0.4 })
  }
}

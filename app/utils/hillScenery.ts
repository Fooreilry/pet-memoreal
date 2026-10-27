import type { Graphics } from 'pixi.js'
import { getHillSceneryLayout } from '../data/hillScenery'
import type { HillPoint, HillRock, HillRockKind } from '../data/hillScenery'
import { drawShrub } from './gardenDecor'
import { drawGardenPaths } from './gardenPaths'
import { drawGardenGround } from './gardenGround'

type Point = readonly [number, number]
const outlines: Record<HillRockKind, readonly Point[]> = {
  boulder: [[-1, 0.3], [-1.05, -0.25], [-0.65, -0.9], [0.1, -1.03], [0.8, -0.65], [1, 0.15], [0.63, 0.45], [-0.45, 0.5]],
  slab: [[-1.3, 0.3], [-1.1, -0.2], [-0.55, -0.6], [0.25, -0.7], [1.12, -0.45], [1.3, 0.2], [0.45, 0.5]],
  spire: [[-0.6, 0.5], [-0.78, 0.12], [-0.55, -0.75], [0.05, -1.45], [0.55, -0.8], [0.72, 0.38], [0.2, 0.55]],
  cluster: [[-1.2, 0.32], [-1.15, -0.2], [-0.75, -0.72], [-0.18, -0.85], [0.25, -0.55], [0.73, -0.7], [1.15, -0.27], [1.25, 0.3], [0.4, 0.5]]
}

function polygon(g: Graphics, points: readonly Point[], x: number, y: number, size: number, color: number, alpha = 1) {
  for (const [index, point] of points.entries()) {
    if (index === 0) g.moveTo(x + point[0] * size, y + point[1] * size)
    else g.lineTo(x + point[0] * size, y + point[1] * size)
  }
  g.closePath().fill({ color, alpha })
}

export function drawHillRock(g: Graphics, rock: HillRock) {
  const { x, y, size, kind } = rock
  const outline = outlines[kind]
  g.ellipse(x + size * 0.2, y + size * 0.4, size * 1.35, size * 0.38).fill({ color: 0x163b31, alpha: 0.3 })
  polygon(g, outline, x, y, size, 0x596b61)
  // Broad planes make each stone read as a solid object even at the whole-garden scale.
  polygon(g, [outline[0]!, outline[1]!, outline[2]!, [-0.12, -0.18], [-0.3, 0.35]], x, y, size, 0x849184)
  polygon(g, [outline[2]!, outline[3]!, outline[4]!, [0.2, -0.12], [-0.12, -0.18]], x, y, size, 0xa6af99)
  polygon(g, [[-0.12, -0.18], [0.2, -0.12], [0.45, 0.4], [-0.3, 0.35]], x, y, size, 0x6b7d70)
  g.moveTo(x - size * 0.45, y - size * 0.4).lineTo(x - size * 0.12, y - size * 0.18).lineTo(x + size * 0.07, y + size * 0.2)
    .stroke({ color: 0x364f43, width: 0.8, alpha: 0.5 })
  g.moveTo(x + size * 0.2, y - size * 0.12).lineTo(x + size * 0.54, y - size * 0.3).stroke({ color: 0xc6ceb2, width: 0.7, alpha: 0.6 })
  // A few connected moss patches follow the upper left plane and its crevice.
  const top = kind === 'spire' ? -1.04 : kind === 'slab' ? -0.45 : -0.66
  g.ellipse(x - size * 0.45, y + size * top, size * 0.3, size * 0.11)
    .ellipse(x - size * 0.7, y + size * (top + 0.17), size * 0.13, size * 0.2)
    .ellipse(x - size * 0.23, y + size * (top - 0.08), size * 0.17, size * 0.1).fill(0x8fa85e)
  g.ellipse(x - size * 0.42, y + size * (top - 0.03), size * 0.15, size * 0.045).fill(0xb5c783)
  g.ellipse(x + size * 0.52, y + size * 0.32, size * 0.18, size * 0.08).fill(0x779555)
  if (kind === 'cluster') {
    polygon(g, [[-1.22, 0.35], [-1.12, -0.1], [-0.72, -0.25], [-0.4, 0.1], [-0.45, 0.52]], x, y, size, 0x8d9b89)
    g.moveTo(x - size * 0.72, y - size * 0.22).lineTo(x - size * 0.8, y + size * 0.2).stroke({ color: 0xb6c3a5, width: 1 })
  }
  g.ellipse(x + size * 0.95, y + size * 0.45, size * 0.15, size * 0.11).fill(0x96a38b)
}

function streamRibbon(g: Graphics, points: HillPoint[], halfWidth: number, bank: number, color: number, alpha = 1, phase = 0) {
  const widths = points.map((_, index) => halfWidth * (0.85 + Math.sin((index + phase) * 0.72) * 0.16 + Math.cos((index + phase) * 0.3) * 0.08) + bank)
  const left = points.map((point, index) => ({ x: point.x - widths[index]!, y: point.y }))
  const right = points.map((point, index) => ({ x: point.x + widths[index]!, y: point.y })).reverse()
  g.moveTo(left[0]!.x, left[0]!.y)
  for (const edge of [left, right]) {
    g.lineTo(edge[0]!.x, edge[0]!.y)
    for (let index = 1; index < edge.length - 1; index++) {
      const point = edge[index]!
      const next = edge[index + 1]!
      g.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2)
    }
    g.lineTo(edge.at(-1)!.x, edge.at(-1)!.y)
  }
  g.closePath().fill({ color, alpha })
}

export function drawHillStream(g: Graphics, points: HillPoint[], preview: boolean, phase = 0) {
  const width = preview ? 5.5 : 8
  streamRibbon(g, points, width, 7, 0x234f3e, 0.4, phase)
  streamRibbon(g, points, width, 4.5, 0x89a778, 1, phase)
  streamRibbon(g, points, width, 0, 0x4d9690, 1, phase)
  for (let index = 2; index < points.length - 1; index += 3) {
    const point = points[index]!
    g.moveTo(point.x - 4, point.y).quadraticCurveTo(point.x, point.y + 2, point.x + 4, point.y - 1)
      .stroke({ color: 0xcde4cd, width: 1, alpha: 0.65 })
    g.moveTo(point.x - 1, point.y - 6).quadraticCurveTo(point.x + 2, point.y - 2, point.x + 1, point.y + 7)
      .stroke({ color: 0x82beb1, width: 2, alpha: 0.5 })
    g.ellipse(point.x + 10, point.y + 7, 3.5, 2).fill(0x849b8b)
  }
}

export function drawHillTerrain(g: Graphics, width: number, height: number, preview: boolean) {
  const { stream } = getHillSceneryLayout(width, height, preview)
  if (preview) {
    const artHeight = height - 99
    g.moveTo(0, artHeight * 0.4).quadraticCurveTo(width * 0.35, -20, width, artHeight * 0.15).lineTo(width, height).lineTo(0, height).closePath().fill(0x6c946d)
    g.moveTo(0, artHeight * 0.7).quadraticCurveTo(width * 0.55, artHeight * 0.05, width, artHeight * 0.6).lineTo(width, height).lineTo(0, height).closePath().fill(0x4c7d5a)
    drawGardenGround(g, width, height, 'hill', true)
    drawGardenPaths(g, width, height, 'hill', true)
    drawHillStream(g, stream, true)
  } else {
    for (const [x, y, rx, ry] of [[0.35, 0.27, 0.25, 0.13], [0.62, 0.58, 0.3, 0.17], [0.3, 0.82, 0.24, 0.11]]) {
      g.ellipse(width * x!, height * y!, width * rx!, height * ry!).fill({ color: 0x8eae79, alpha: 0.055 })
    }
    drawGardenPaths(g, width, height, 'hill', false)
    drawHillStream(g, stream, false)
  }
}

export function drawHillDecor(g: Graphics, { rocks, shrubs }: ReturnType<typeof getHillSceneryLayout>) {
  for (const rock of rocks) drawHillRock(g, rock)
  for (const shrub of shrubs) drawShrub(g, shrub)
}

export function drawHillLandscape(g: Graphics, width: number, height: number, preview: boolean) {
  drawHillTerrain(g, width, height, preview)
  drawHillDecor(g, getHillSceneryLayout(width, height, preview))
}

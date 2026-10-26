import type { Graphics } from 'pixi.js'
import { getMeadowSceneryLayout } from '../data/meadowScenery'
import type { MeadowPlant } from '../data/meadowScenery'
import { getMemorialLayout } from '../data/demoMemorials'
import { drawFlowers, drawGrassTuft, drawLantern, drawShrub } from './gardenDecor'

export function drawClover(g: Graphics, { x, y, size, seed }: MeadowPlant) {
  g.ellipse(x, y + size * 0.2, size * 1.2, size * 0.35).fill({ color: 0x284e39, alpha: 0.2 })
  for (let stem = 0; stem < 3; stem++) {
    const px = x + (stem - 1) * size * 0.7
    const py = y - (stem % 2 ? size * 0.45 : size * 0.05)
    g.moveTo(x, y + size * 0.35).quadraticCurveTo(px, y + size * 0.2, px, py)
      .stroke({ color: 0x93ad70, width: 0.7, alpha: 0.7 })
    const r = size * 0.24
    for (let leaf = 0; leaf < 3; leaf++) {
      const angle = leaf / 3 * Math.PI * 2 - Math.PI / 2
      const lx = px + Math.cos(angle) * r
      const ly = py + Math.sin(angle) * r
      g.ellipse(lx, ly, r * 1.15, r).fill(stem % 2 ? 0x749664 : 0x60865b)
      g.moveTo(px, py).lineTo(lx, ly).stroke({ color: 0xb4c793, width: 0.5, alpha: 0.55 })
    }
    if ((seed + stem) % 4 === 0) {
      g.circle(px, py - size * 0.45, size * 0.16).fill(0xd8d4ba)
      g.circle(px - size * 0.03, py - size * 0.51, size * 0.07).fill(0xeee7cc)
    }
  }
}

export function drawFlowerSpires(g: Graphics, { x, y, size, seed }: MeadowPlant) {
  const color = seed % 2 ? 0xb9b3cc : 0xd8bdb9
  g.ellipse(x, y + 2, size * 0.65, 2.5).fill({ color: 0x254b38, alpha: 0.2 })
  for (let stem = 0; stem < 3; stem++) {
    const spread = stem - 1
    const px = x + spread * size * 0.46
    const py = y - size * (stem === 1 ? 1.45 : 1.12)
    g.moveTo(x + spread * size * 0.12, y).quadraticCurveTo(px - 2, y - size * 0.6, px, py)
      .stroke({ color: 0x95ad79, width: 1 })
    for (const side of [-1, 1]) {
      const sy = y - size * 0.35
      g.moveTo(x + spread * size * 0.2, sy).quadraticCurveTo(px + side * size * 0.4, sy - size * 0.45, px + side * size * 0.3, sy - size * 0.1)
        .quadraticCurveTo(px + side * size * 0.1, sy + size * 0.1, x + spread * size * 0.2, sy).fill(side === 1 ? 0x729968 : 0x527e58)
    }
    for (let bud = 0; bud < 4; bud++) {
      const yy = py + bud * size * 0.14
      const dx = (bud % 2 ? 1 : -1) * size * (0.07 + bud * 0.012)
      g.ellipse(px + dx, yy, size * 0.12, size * 0.085).fill(color)
      g.ellipse(px + dx - size * 0.025, yy - size * 0.025, size * 0.05, size * 0.03).fill({ color: 0xf0e7dc, alpha: 0.6 })
    }
  }
}

function groundTexture(g: Graphics, width: number, height: number, preview: boolean) {
  let seed = 7051
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  // Low rolling shapes and short, grouped blades replace the old uniform diagonal hatching.
  for (let index = 0; index < (preview ? 8 : 16); index++) {
    const x = width * (0.14 + random() * 0.72)
    const y = height * (0.15 + random() * 0.7)
    const rx = Math.min(width * 0.13, 100) * (0.7 + random() * 0.5)
    const ry = 12 + random() * Math.min(28, height * 0.08)
    g.moveTo(x - rx, y).bezierCurveTo(x - rx * 0.75, y - ry, x + rx * 0.35, y - ry * 0.8, x + rx, y)
      .bezierCurveTo(x + rx * 0.7, y + ry * 0.5, x - rx * 0.6, y + ry * 0.65, x - rx, y)
      .fill({ color: index % 3 ? 0x8cae79 : 0x203f31, alpha: index % 3 ? 0.075 : 0.09 })
  }
  for (let index = 0; index < (preview ? 70 : 220); index++) {
    const x = 15 + random() * (width - 30)
    const y = 22 + random() * (height - 37)
    const length = 2 + random() * 3
    for (let blade = 0; blade < 3; blade++) {
      const px = x + blade * 2
      g.moveTo(px, y).quadraticCurveTo(px - 1, y - length * 0.6, px + blade - 1, y - length - blade % 2)
    }
    g.stroke({ color: index % 3 ? 0xa8c28a : 0x214d37, width: 0.8, alpha: index % 3 ? 0.2 : 0.24 })
  }
}

export function drawMeadowLandscape(g: Graphics, width: number, height: number, preview: boolean) {
  const artHeight = preview ? height - 99 : height
  const decor = getMeadowSceneryLayout(width, height, preview)
  groundTexture(g, width, artHeight, preview)
  if (preview) {
    g.moveTo(width * 0.46, artHeight - 10).bezierCurveTo(width * 0.2, artHeight * 0.65, width * 0.75, artHeight * 0.43, width * 0.53, 14)
      .stroke({ color: 0xadc28d, width: 16, alpha: 0.42 })
    g.moveTo(width * 0.46, artHeight - 10).bezierCurveTo(width * 0.2, artHeight * 0.65, width * 0.75, artHeight * 0.43, width * 0.53, 14)
      .stroke({ color: 0xd1d5a4, width: 6, alpha: 0.15 })
  } else {
    const { rows, cellH, places } = getMemorialLayout(width, height, 'meadow')
    for (const place of places) {
      g.ellipse(place.x, place.y + 8, 57, 33).fill({ color: 0xa3ba83, alpha: 0.085 })
    }
    for (let row = 1; row < rows; row++) {
      const y = 87 + row * cellH
      for (const [lineWidth, color, alpha] of [[20, 0x94ae7b, 0.25], [9, 0xc6cf9e, 0.11]] as const) {
        g.moveTo(24, y).bezierCurveTo(width * 0.3, y + 22, width * 0.66, y - 19, width - 24, y + 5)
          .stroke({ color, width: lineWidth, alpha })
      }
    }
  }
  for (const plant of decor.clover) drawClover(g, plant)
  for (const plant of decor.grass) drawGrassTuft(g, plant.x, plant.y, plant.size, plant.seed)
  for (const shrub of decor.shrubs) drawShrub(g, shrub)
  for (const flower of decor.flowers) {
    if (flower.kind === 'spire') drawFlowerSpires(g, flower)
    else drawFlowers(g, flower.x, flower.y, [0xe9e2c5, 0xdec0b4, 0xc6bed5][flower.seed % 3]!, flower.seed, 5)
  }
  for (const light of decor.lanterns) drawLantern(g, light.x, light.y)
}

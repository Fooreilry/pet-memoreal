import type { Graphics } from 'pixi.js'
import { getLakeSceneryLayout } from '../data/lakeScenery'
import type { LakeLily, LakePlant, LakePond } from '../data/lakeScenery'
import { getMemorialLayout } from '../data/demoMemorials'
import { drawFlowers, drawLantern, drawShrub, drawTree } from './gardenDecor'
import { drawGardenPlant } from './gardenBotany'

function waterShape(g: Graphics, x: number, y: number, rx: number, ry: number) {
  return g.moveTo(x - rx * 0.95, y)
    .bezierCurveTo(x - rx * 0.95, y - ry * 0.65, x - rx * 0.5, y - ry * 0.95, x - rx * 0.08, y - ry * 0.9)
    .bezierCurveTo(x + rx * 0.25, y - ry * 0.98, x + rx * 0.85, y - ry * 0.78, x + rx * 0.98, y - ry * 0.18)
    .bezierCurveTo(x + rx * 1.02, y + ry * 0.38, x + rx * 0.62, y + ry * 0.96, x + rx * 0.18, y + ry * 0.92)
    .bezierCurveTo(x - rx * 0.12, y + ry * 0.79, x - rx * 0.15, y + ry * 0.56, x - rx * 0.42, y + ry * 0.65)
    .bezierCurveTo(x - rx * 0.8, y + ry * 0.82, x - rx * 1.04, y + ry * 0.38, x - rx * 0.95, y).closePath()
}

function drawPond(g: Graphics, pond: LakePond) {
  const { x, y, rx, ry } = pond
  waterShape(g, x + 1, y + 2, rx + 9, ry + 7).fill(0x325c4b)
  waterShape(g, x, y, rx + 5, ry + 4).fill(0x7b9978)
  waterShape(g, x, y, rx, ry).fill(0x245d65)
  waterShape(g, x - rx * 0.03, y - ry * 0.04, rx * 0.94, ry * 0.9).fill(0x3c7c7c)
  waterShape(g, x - rx * 0.15, y - ry * 0.12, rx * 0.7, ry * 0.65).fill({ color: 0x73a8a0, alpha: 0.23 })
  g.moveTo(x - rx * 0.88, y - ry * 0.15).bezierCurveTo(x - rx * 0.75, y - ry * 0.68, x - rx * 0.3, y - ry * 0.94, x + rx * 0.05, y - ry * 0.9)
    .stroke({ color: 0xb0bea0, width: 1.4, alpha: 0.65 })
  for (let index = 0; index < 7; index++) {
    const yy = y - ry * 0.62 + index * ry * 0.19
    const xx = x + Math.sin(index * 1.7) * rx * 0.25
    g.moveTo(xx - rx * 0.18, yy).quadraticCurveTo(xx, yy + 2, xx + rx * 0.18, yy)
      .stroke({ color: 0xbad8c4, width: 1, alpha: 0.22 })
  }
  // A few shore pebbles and short roots break up the bank without a noise texture.
  for (let index = 0; index < 9; index++) {
    const angle = index / 9 * Math.PI * 2
    const px = x + Math.cos(angle) * (rx + 3)
    const py = y + Math.sin(angle) * (ry + 3)
    g.ellipse(px, py, 2 + index % 2, 1.4).fill(index % 2 ? 0x9ead94 : 0x5a7e70)
  }
}

function drawLily(g: Graphics, lily: LakeLily) {
  const { x, y, size, bloom } = lily
  const ry = size * 0.56
  g.ellipse(x + 1, y + 2, size * 1.06, ry).fill({ color: 0x164f50, alpha: 0.32 })
  g.moveTo(x, y + ry * 0.08).lineTo(x + size * 0.65, y - ry * 0.83)
    .bezierCurveTo(x - size * 0.2, y - ry * 1.2, x - size, y - ry * 0.8, x - size, y)
    .bezierCurveTo(x - size, y + ry, x + size, y + ry, x + size, y)
    .quadraticCurveTo(x + size, y - ry * 0.5, x + size * 0.65, y - ry * 0.83)
    .lineTo(x, y + ry * 0.08).closePath().fill(0x84aa70)
  g.moveTo(x - size * 0.78, y - ry * 0.2).quadraticCurveTo(x - size * 0.3, y - ry * 0.8, x + size * 0.35, y - ry * 0.65)
    .stroke({ color: 0xc3d49a, width: 0.7, alpha: 0.7 })
  g.moveTo(x, y).lineTo(x - size * 0.58, y + ry * 0.5).moveTo(x, y).lineTo(x + size * 0.6, y + ry * 0.4)
    .stroke({ color: 0x4d805c, width: 0.6, alpha: 0.6 })
  if (bloom) {
    const s = size / 8
    g.ellipse(x, y - s * 3, s * 4, s * 1.5).fill(0x547f59)
    for (const direction of [-1, 1]) {
      g.moveTo(x, y - s * 2).quadraticCurveTo(x + direction * s * 6, y - s * 10, x + direction * s * 4, y - s * 3)
        .quadraticCurveTo(x + direction * s * 2, y, x, y - s * 2).fill(0xe1c9bd)
    }
    g.moveTo(x, y - s * 1).quadraticCurveTo(x - s * 4, y - s * 6, x, y - s * 9)
      .quadraticCurveTo(x + s * 4, y - s * 6, x, y - s * 1).fill(0xf3e7ce)
    g.ellipse(x, y - s * 3, s * 1.2, s * 1.5).fill(0xe5c980)
  }
}

function drawPebble(g: Graphics, { x, y, size, seed }: LakePlant) {
  g.ellipse(x + size * 0.1, y + size * 0.18, size * 1.3, size * 0.38).fill({ color: 0x193f35, alpha: 0.22 })
  g.moveTo(x - size * 1.25, y).lineTo(x - size * 0.65, y - size * 0.6)
    .lineTo(x + size * 0.45, y - size * 0.78).lineTo(x + size * 1.15, y - size * 0.1)
    .lineTo(x + size * 0.8, y + size * 0.3).lineTo(x - size * 0.75, y + size * 0.3).closePath()
    .fill(seed % 2 ? 0x819080 : 0x6c8277)
  g.moveTo(x - size * 0.65, y - size * 0.6).lineTo(x + size * 0.45, y - size * 0.78)
    .lineTo(x + size * 0.1, y - size * 0.13).lineTo(x - size * 1.25, y).closePath()
    .fill({ color: 0xb7bda0, alpha: 0.45 })
}

export function drawLakeLandscape(g: Graphics, width: number, height: number, preview: boolean) {
  const decor = getLakeSceneryLayout(width, height, preview)
  if (preview) {
    const artHeight = height - 99
    g.moveTo(width * 0.28, artHeight + 8).bezierCurveTo(width * 0.15, artHeight * 0.55, width * 0.42, artHeight * 0.35, width * 0.34, 8)
      .stroke({ color: 0xa8b99a, width: 11, alpha: 0.5 })
  } else {
    const { rows, cellH } = getMemorialLayout(width, height, 'lake')
    for (let row = 1; row < rows; row++) {
      const y = 88 + row * cellH
      g.moveTo(44, y).bezierCurveTo(width * 0.3, y - 9, width * 0.7, y + 9, width - 84, y)
        .stroke({ color: 0x9fb69a, width: 12, alpha: 0.22 })
      for (let index = 0; index < 12; index++) {
        g.ellipse(58 + index * (width - 160) / 11, y + Math.sin(index) * 3, 4 + index % 2, 2).fill({ color: 0xc3c9a6, alpha: 0.35 })
      }
      drawLantern(g, 55, y - 5)
    }
  }
  for (const pond of decor.ponds) drawPond(g, pond)
  for (const lily of decor.lilies) drawLily(g, lily)
  for (const reed of decor.reeds) drawGardenPlant(g, { ...reed, kind: 'sedge' })
  for (const pebble of decor.pebbles) drawPebble(g, pebble)
  for (const shrub of decor.shrubs) drawShrub(g, shrub)
  for (const tree of decor.trees) drawTree(g, tree.x, tree.y, tree.size, 0x5d8d72, tree.seed)
  for (const lantern of decor.lanterns) drawLantern(g, lantern.x, lantern.y)
  if (!preview) {
    drawFlowers(g, 38, height - 76, 0xe1dac2, 92, 4)
    drawFlowers(g, width - 38, height - 64, 0xe1dac2, 97, 4)
  }
}

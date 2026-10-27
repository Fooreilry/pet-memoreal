import type { Graphics } from 'pixi.js'
import { getMeadowSceneryLayout } from '../data/meadowScenery'
import type { MeadowPlant } from '../data/meadowScenery'
import { getMemorialLayout } from '../data/demoMemorials'
import { drawFlowers, drawGrassTuft, drawLantern, drawShrub } from './gardenDecor'
import { drawGardenPaths } from './gardenPaths'

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

export function drawMeadowTerrain(g: Graphics, width: number, height: number, preview: boolean) {
  if (!preview) {
    const { places } = getMemorialLayout(width, height, 'meadow')
    for (const place of places) {
      g.ellipse(place.x, place.y + 8, 57, 33).fill({ color: 0xa3ba83, alpha: 0.085 })
    }
  }
  drawGardenPaths(g, width, height, 'meadow', preview)
}

export function drawMeadowDecor(g: Graphics, decor: ReturnType<typeof getMeadowSceneryLayout>) {
  for (const plant of decor.clover) drawClover(g, plant)
  for (const plant of decor.grass) drawGrassTuft(g, plant.x, plant.y, plant.size, plant.seed)
  for (const shrub of decor.shrubs) drawShrub(g, shrub)
  for (const flower of decor.flowers) {
    if (flower.kind === 'spire') drawFlowerSpires(g, flower)
    else drawFlowers(g, flower.x, flower.y, [0xe9e2c5, 0xdec0b4, 0xc6bed5][flower.seed % 3]!, flower.seed, 5)
  }
  for (const light of decor.lanterns) drawLantern(g, light.x, light.y)
}

export function drawMeadowLandscape(g: Graphics, width: number, height: number, preview: boolean) {
  drawMeadowTerrain(g, width, height, preview)
  drawMeadowDecor(g, getMeadowSceneryLayout(width, height, preview))
}

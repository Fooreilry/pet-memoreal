import type { Graphics } from 'pixi.js'
import type { GardenPlant } from '../data/gardenPlants'

function fern(g: Graphics, { x, y, size, seed }: GardenPlant) {
  for (let frond = 0; frond < 5; frond++) {
    const spread = (frond - 2) / 2
    const tipX = x + spread * size
    const tipY = y - size * (1.4 - Math.abs(spread) * 0.55)
    const controlX = x + spread * size * 0.25
    const controlY = y + (tipY - y) * 0.6
    g.moveTo(x, y).quadraticCurveTo(controlX, controlY, tipX, tipY).stroke({ color: 0x7c9d68, width: size * 0.045, alpha: 0.85 })
    for (let pair = 0; pair < 4; pair++) {
      const t = (pair + 1) / 5
      const px = (1 - t) ** 2 * x + 2 * (1 - t) * t * controlX + t * t * tipX
      const py = (1 - t) ** 2 * y + 2 * (1 - t) * t * controlY + t * t * tipY
      const length = size * (0.25 - pair * 0.04)
      for (const side of [-1, 1]) {
        g.moveTo(px, py).quadraticCurveTo(px + side * length * 0.45, py - length * 0.65, px + side * length, py - length * 0.45)
          .quadraticCurveTo(px + side * length * 0.6, py + length * 0.12, px, py).closePath()
      }
    }
    g.fill([0x4d7d58, 0x648d63, 0x7a9e6b][(frond + seed) % 3]!)
  }
  g.moveTo(x, y - size * 0.15).quadraticCurveTo(x - size * 0.04, y - size * 0.8, x, y - size * 1.35)
    .stroke({ color: 0xb5c88e, width: size * 0.025, alpha: 0.45 })
}

function sedge(g: Graphics, { x, y, size, seed }: GardenPlant) {
  const colors = [0x4a7f5d, 0x639565, 0x7ba36e]
  for (let blade = 0; blade < 7; blade++) {
    const spread = (blade - 3) / 3
    const root = x + spread * size * 0.13
    const tipX = x + spread * size * (0.7 + blade % 2 * 0.25)
    const tipY = y - size * (1.35 - Math.abs(spread) * 0.5)
    g.moveTo(root - size * 0.025, y).quadraticCurveTo(x + spread * size * 0.12, y - size * 0.72, tipX, tipY)
      .quadraticCurveTo(x + spread * size * 0.36, y - size * 0.55, root + size * 0.06, y).closePath()
      .fill(colors[(blade + seed) % colors.length]!)
    if (blade === 1 || blade === 4) {
      g.moveTo(root, y - size * 0.08).quadraticCurveTo(x + spread * size * 0.23, y - size * 0.65, tipX, tipY + size * 0.08)
        .stroke({ color: 0xbed093, width: size * 0.025, alpha: 0.35 })
    }
  }
}

function blossom(g: Graphics, { x, y, size, seed }: GardenPlant) {
  const scale = size / 14
  const petal = [0xe6dfc2, 0xd8bcb2, 0xc6c6d8][seed % 3]!
  for (let stem = 0; stem < 3; stem++) {
    const spread = stem - 1
    const topX = x + spread * size * 0.5
    const topY = y - size * (stem === 1 ? 1.2 : 0.9)
    g.moveTo(x + spread * size * 0.12, y).quadraticCurveTo(x + spread * size * 0.17, y - size * 0.5, topX, topY)
      .stroke({ color: 0x7f9e6b, width: scale, alpha: 0.9 })
    const py = y - size * (0.35 + stem % 2 * 0.1)
    for (const side of [-1, 1]) {
      const px = x + spread * size * 0.25
      g.moveTo(px, py).quadraticCurveTo(px + side * size * 0.26, py - size * 0.35, px + side * size * 0.43, py - size * 0.22)
        .quadraticCurveTo(px + side * size * 0.28, py + size * 0.04, px, py).closePath()
    }
    g.fill(stem % 2 ? 0x6d9768 : 0x527e5b)
    for (let p = 0; p < 5; p++) {
      const angle = p / 5 * Math.PI * 2
      g.circle(topX + Math.cos(angle) * 1.65 * scale, topY + Math.sin(angle) * 1.65 * scale, 1.45 * scale)
    }
    g.fill(petal)
    g.circle(topX, topY, scale).fill(0xe9d393)
    g.circle(topX - scale * 0.3, topY - scale * 0.3, scale * 0.4).fill(0xf9edc7)
  }
}

// Small static accents share the existing ground cache; there is no plant ticker.
export function drawGardenPlant(g: Graphics, plant: GardenPlant) {
  const { x, y, size } = plant
  g.ellipse(x + size * 0.06, y + size * 0.1, size * 1.05, size * 0.2).fill({ color: 0x173d30, alpha: 0.18 })
  if (plant.kind === 'fern') fern(g, plant)
  else if (plant.kind === 'sedge') sedge(g, plant)
  else blossom(g, plant)
}

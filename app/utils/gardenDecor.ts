import type { Graphics } from 'pixi.js'

type Shrub = { x: number, y: number, size: number, seed: number }

function random(seed: number) {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

export function drawFlowers(g: Graphics, x: number, y: number, color: number, seed: number, count = 7) {
  const rand = random(seed)
  for (let index = 0; index < count; index++) {
    const px = x + (rand() - 0.5) * 36
    const py = y + (rand() - 0.5) * 15
    const petal = 1.6 + rand() * 0.35
    g.moveTo(px, py + 7).quadraticCurveTo(px - 2, py + 1, px, py - 4).stroke({ color: 0x83a27a, width: 1, alpha: 0.85 })
    g.moveTo(px, py + 3).quadraticCurveTo(px - 7, py - 1, px - 5, py + 4).quadraticCurveTo(px - 2, py + 7, px, py + 3)
      .moveTo(px, py + 1).quadraticCurveTo(px + 6, py - 3, px + 6, py + 1).quadraticCurveTo(px + 3, py + 4, px, py + 1).fill(0x70966e)
    g.circle(px, py - 2, petal + 0.5).fill({ color: 0x345943, alpha: 0.3 })
    g.circle(px - 2, py - 4, petal).circle(px + 2, py - 4, petal)
      .circle(px, py - 6, petal).circle(px, py - 2, petal).fill(color)
    g.circle(px - 0.4, py - 4.2, 1.3).fill(0xf8e5b8)
    g.circle(px - 0.7, py - 4.5, 0.5).fill(0xfff6dc)
  }
}

export function drawLantern(g: Graphics, x: number, y: number, hanging = false) {
  for (let layer = 4; layer > 0; layer--) g.circle(x, y - 9, layer * 7).fill({ color: 0xffcc7d, alpha: 0.025 + (4 - layer) * 0.013 })
  if (hanging) g.moveTo(x, y - 36).lineTo(x, y - 26).stroke({ color: 0x99a07d, width: 1.1, alpha: 0.8 })
  else g.ellipse(x + 2, y + 9, 10, 3).fill({ color: 0x16382e, alpha: 0.35 })
  g.circle(x, y - 24, 3).stroke({ color: 0xada37d, width: 1.1 })
  g.roundRect(x - 5.5, y - 18, 11, 24, 2).fill(0x42594b)
  g.roundRect(x - 3.8, y - 15.5, 7.6, 17.5, 1.8).fill(0xe9b86a)
  g.roundRect(x - 2.8, y - 14, 4, 14, 1.3).fill(0xffd78d)
  g.moveTo(x - 7, y - 18).lineTo(x, y - 23).lineTo(x + 7, y - 18).closePath().fill(0xaaa07c)
  g.moveTo(x - 5, y - 19).lineTo(x, y - 22).lineTo(x + 4, y - 19).stroke({ color: 0xd2c295, width: 0.8, alpha: 0.75 })
  g.moveTo(x - 4.7, y - 15).lineTo(x - 4.7, y + 2).moveTo(x + 4.7, y - 15).lineTo(x + 4.7, y + 2)
    .stroke({ color: 0x536754, width: 1.2 })
  g.roundRect(x - 6, y + 2.5, 12, 3.5, 1.2).fill(0x67765a)
  g.moveTo(x - 3, y - 12).lineTo(x - 3, y - 5).stroke({ color: 0xfff0ba, width: 1, alpha: 0.8 })
  g.ellipse(x + 0.7, y - 4, 1.8, 3.5).fill({ color: 0xffedb0, alpha: 0.9 })
}

export function drawShrub(g: Graphics, { x, y, size, seed }: Shrub) {
  const leaf = [0x487b57, 0x58885e, 0x3d7356][seed % 3]!
  g.ellipse(x + size * 0.15, y + size * 0.18, size * 1.15, size * 0.34).fill({ color: 0x173b2d, alpha: 0.25 })
  g.moveTo(x, y + size * 0.2).lineTo(x - size * 0.2, y - size * 0.6)
    .moveTo(x + size * 0.05, y + size * 0.15).lineTo(x + size * 0.5, y - size * 0.5).stroke({ color: 0x819064, width: 1.5, alpha: 0.8 })
  g.ellipse(x - size * 0.5, y - size * 0.35, size * 0.55, size * 0.43)
    .ellipse(x + size * 0.5, y - size * 0.35, size * 0.6, size * 0.48)
    .ellipse(x, y - size * 0.7, size * 0.7, size * 0.65).fill(0x2c5840)
  g.ellipse(x - size * 0.5, y - size * 0.5, size * 0.5, size * 0.4)
    .ellipse(x + size * 0.45, y - size * 0.52, size * 0.57, size * 0.43)
    .ellipse(x - size * 0.06, y - size * 0.83, size * 0.64, size * 0.58).fill(leaf)
  g.ellipse(x - size * 0.22, y - size * 1.08, size * 0.4, size * 0.19).fill({ color: 0xa5bd7b, alpha: 0.2 })
  for (let index = 0; index < 8; index++) {
    const angle = index * 2.4 + seed
    const px = x + Math.cos(angle) * size * 0.65
    const py = y - size * 0.7 + Math.sin(angle) * size * 0.35
    const dx = index % 2 ? 1 : -1
    g.moveTo(px - size * 0.12, py).quadraticCurveTo(px, py - size * 0.12, px + size * 0.13, py - dx * size * 0.04)
      .quadraticCurveTo(px, py + size * 0.07, px - size * 0.12, py).fill({ color: index % 3 ? 0xb4cc8e : 0x254f3a, alpha: index % 3 ? 0.4 : 0.35 })
  }
}

export function drawGrassTuft(g: Graphics, x: number, y: number, height: number, seed = 0) {
  const scale = height / 26
  g.ellipse(x + scale, y + scale * 2, scale * 12, scale * 3).fill({ color: 0x183f32, alpha: 0.16 })
  const colors = [0x3d7552, 0x579867, 0x73a973, 0x4b885d, 0x82b780]
  for (let blade = 0; blade < 5; blade++) {
    const spread = (blade - 2) * 3 * scale
    const tip = -height + Math.abs(blade - 2) * 3 * scale
    const tipX = spread * 1.5 + (seed % 2 ? 4 : 5) * scale
    g.moveTo(x + spread - 1.5 * scale, y + scale).quadraticCurveTo(x + spread - 4 * scale, y + tip * 0.5, x + tipX, y + tip)
      .quadraticCurveTo(x + spread + 3 * scale, y + tip * 0.45, x + spread + 2 * scale, y + scale).closePath().fill({ color: colors[blade]!, alpha: 0.92 })
    if (blade === 1 || blade === 3) g.moveTo(x + spread, y - 2 * scale).quadraticCurveTo(x + spread + scale, y + tip * 0.4, x + tipX, y + tip + 3 * scale)
      .stroke({ color: 0xb0ca8b, width: 0.7 * scale, alpha: 0.35 })
  }
}

export function drawLeaf(g: Graphics, size: number, color: number) {
  g.moveTo(0, -size).bezierCurveTo(size * 0.8, -size * 0.55, size * 0.8, size * 0.4, 0, size)
    .bezierCurveTo(-size * 0.65, size * 0.45, -size * 0.65, -size * 0.35, 0, -size).fill(color)
  g.moveTo(0, -size).quadraticCurveTo(-size * 0.6, 0, 0, size).lineTo(0, -size).fill({ color: 0xe2d7a3, alpha: 0.2 })
  g.moveTo(0, -size * 0.75).quadraticCurveTo(size * 0.08, 0, 0, size * 1.25)
    .moveTo(0, -size * 0.25).lineTo(-size * 0.28, -size * 0.45)
    .moveTo(0, size * 0.15).lineTo(size * 0.3, -size * 0.12)
    .moveTo(0, size * 0.48).lineTo(-size * 0.25, size * 0.2).stroke({ color: 0xd6cf98, width: size * 0.09, alpha: 0.65 })
}

export function drawTree(g: Graphics, x: number, y: number, radius: number, color: number, seed: number) {
  g.ellipse(x + radius * 0.2, y + radius * 0.8, radius * 1.15, radius * 0.34).fill({ color: 0x0e3028, alpha: 0.3 })
  g.moveTo(x - radius * 0.07, y + radius).lineTo(x - radius * 0.08, y - radius * 0.2)
    .lineTo(x + radius * 0.09, y - radius * 0.25).lineTo(x + radius * 0.08, y + radius).closePath().fill(0x9c9c78)
  drawCanopy(g, x, y, radius, color, seed)
}

function drawCanopy(g: Graphics, x: number, y: number, radius: number, color: number, seed: number) {
  const rand = random(seed)
  g.ellipse(x, y + radius * 0.02, radius * 0.97, radius * 0.9).fill(0x234c37)
  for (let index = 0; index < 7; index++) {
    const angle = index / 7 * Math.PI * 2
    const px = x + Math.cos(angle) * radius * 0.48
    const py = y + Math.sin(angle) * radius * 0.39 - radius * 0.14
    const r = radius * (0.46 + rand() * 0.08)
    g.ellipse(px, py, r, r * 0.85).fill(color)
    g.ellipse(px - r * 0.2, py - r * 0.28, r * 0.65, r * 0.37).fill({ color: 0xa7c181, alpha: 0.17 })
  }
  for (let index = 0; index < 15; index++) {
    const angle = rand() * Math.PI * 2
    const distance = Math.sqrt(rand()) * radius * 0.75
    const px = x + Math.cos(angle) * distance
    const py = y + Math.sin(angle) * distance * 0.8 - radius * 0.1
    const leaf = radius * (0.08 + rand() * 0.04)
    g.moveTo(px - leaf, py).quadraticCurveTo(px, py - leaf, px + leaf, py)
      .quadraticCurveTo(px, py + leaf * 0.55, px - leaf, py).fill({ color: index % 3 ? 0xc2d49c : 0x193f30, alpha: 0.27 })
  }
}

export function drawWoodlandTree(g: Graphics, x: number, y: number, size: number, seed: number) {
  g.ellipse(x + size * 0.25, y + size * 0.9, size * 1.05, size * 0.32).fill({ color: 0x0e2923, alpha: 0.2 })
  g.moveTo(x - size * 0.09, y + size * 1.12).lineTo(x - size * 0.08, y - size * 0.3)
    .lineTo(x + size * 0.09, y - size * 0.3).lineTo(x + size * 0.08, y + size * 1.12).closePath().fill(0xb0b69a)
  g.moveTo(x - size * 0.045, y + size).lineTo(x - size * 0.04, y - size * 0.1).stroke({ color: 0xe0dfba, width: size * 0.035, alpha: 0.75 })
  for (let index = 0; index < 5; index++) {
    const yy = y + size * (index * 0.21 + 0.05)
    g.moveTo(x - size * 0.07, yy).lineTo(x + size * (index % 2 ? 0.03 : 0.07), yy + size * 0.015).stroke({ color: 0x627962, width: size * 0.035 })
  }
  g.moveTo(x, y + size * 1.08).quadraticCurveTo(x - size * 0.2, y + size * 1.12, x - size * 0.32, y + size * 1.18)
    .moveTo(x + size * 0.04, y + size * 1.08).quadraticCurveTo(x + size * 0.2, y + size * 1.12, x + size * 0.35, y + size * 1.16)
    .stroke({ color: 0x7e9873, width: size * 0.06 })
  drawCanopy(g, x, y - size * 0.15, size, seed % 2 ? 0x4c7956 : 0x648960, seed)
}

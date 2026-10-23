import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { demoGardens } from '../data/demoGardens'
import type { GardenId } from '../data/demoGardens'
import { getMemorialLayout } from '../data/demoMemorials'
import { createGardenLife } from './gardenLife'
import type { PublicMemorial } from '../../shared/memorials'

type Garden = typeof demoGardens[number]
type Translate = (key: string, values?: Record<string, string | number>) => string
const moods = {
  meadow: { ground: 0x3b6050, leaf: 0x668362, light: 0xf1cf95, flower: 0xf0c1ae },
  lake: { ground: 0x284f50, leaf: 0x4f786b, light: 0xaadad1, flower: 0xc5c8eb },
  grove: { ground: 0x294b40, leaf: 0x527355, light: 0xe8c98d, flower: 0xe1d7a2 },
  hill: { ground: 0x5c6952, leaf: 0x80906c, light: 0xf0d5a1, flower: 0xe8c59d }
}

function label(parent: Container, text: string, x: number, y: number, size: number, color = 0xfaf5eb, serif = false) {
  const item = new Text({ text, style: { fontFamily: serif ? 'Georgia' : 'Segoe UI, sans-serif', fontSize: size, fill: color } })
  item.position.set(x, y)
  parent.addChild(item)
  return item
}

function random(seed: number) {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

function glow(g: Graphics, x: number, y: number, radius: number, color: number) {
  for (let i = 5; i > 0; i--) g.circle(x, y, radius * i / 5).fill({ color, alpha: 0.025 + (5 - i) * 0.009 })
}

function tree(g: Graphics, x: number, y: number, radius: number, color: number, seed: number) {
  const rand = random(seed)
  g.ellipse(x + 12, y + radius * 0.75, radius * 1.2, radius * 0.55).fill({ color: 0x0b2528, alpha: 0.28 })
  g.moveTo(x + 2, y + radius).lineTo(x - 2, y - 5).stroke({ color: 0x9a9171, width: 5 })
  g.circle(x, y + 4, radius).fill(0x203e34)
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2
    g.circle(x + Math.cos(angle) * radius * 0.48, y + Math.sin(angle) * radius * 0.38 - 4, radius * (0.48 + rand() * 0.15)).fill(color)
  }
  g.ellipse(x - radius * 0.22, y - radius * 0.28, radius * 0.61, radius * 0.48).fill({ color: 0xb8c88b, alpha: 0.13 })
  for (let i = 0; i < 22; i++) {
    const angle = rand() * Math.PI * 2
    const distance = Math.sqrt(rand()) * radius * 0.82
    g.ellipse(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance - 5, 3 + rand() * 4, 1.5).fill({ color: i % 3 ? 0xc5d59d : 0x102e2c, alpha: 0.16 })
  }
}

function flowers(g: Graphics, x: number, y: number, color: number, seed: number, count = 7) {
  const rand = random(seed)
  for (let i = 0; i < count; i++) {
    const px = x + (rand() - 0.5) * 36
    const py = y + (rand() - 0.5) * 15
    g.moveTo(px, py + 7).quadraticCurveTo(px - 3, py + 2, px, py - 3).stroke({ color: 0x89a27a, width: 1.2, alpha: 0.75 })
    g.ellipse(px + 3, py + 3, 3, 1.5).fill(0x809778)
    g.circle(px - 2, py - 3, 2).circle(px + 2, py - 3, 2).circle(px, py - 5, 2).fill(color)
    g.circle(px, py - 3, 1.2).fill(0xf8e5b8)
  }
}

function lantern(g: Graphics, x: number, y: number) {
  glow(g, x, y - 9, 29, 0xffc775)
  g.ellipse(x, y + 9, 9, 3).fill({ color: 0x132e2b, alpha: 0.4 })
  g.roundRect(x - 5, y - 17, 10, 20, 3).fill(0x4d5545)
  g.roundRect(x - 3, y - 14, 6, 13, 2).fill(0xffd58c)
  g.moveTo(x - 7, y - 17).lineTo(x, y - 22).lineTo(x + 7, y - 17).fill(0x9e9774)
  g.circle(x, y - 8, 1.5).fill(0xfff3c9)
}

function pond(g: Graphics, x: number, y: number, rx: number, ry: number) {
  g.ellipse(x, y + 4, rx + 8, ry + 6).fill(0x587268)
  g.ellipse(x, y, rx, ry).fill(0x1c474e)
  g.ellipse(x - rx * 0.1, y - ry * 0.12, rx * 0.86, ry * 0.8).fill(0x35676b)
  for (let i = 0; i < 8; i++) {
    const yy = y - ry * 0.65 + i * ry * 0.18
    const xx = x + Math.sin(i * 2) * rx * 0.3
    g.moveTo(xx - rx * 0.22, yy).quadraticCurveTo(xx, yy + 3, xx + rx * 0.22, yy).stroke({ color: 0xb4d4c4, width: 1.5, alpha: 0.25 })
  }
  for (let i = 0; i < 4; i++) {
    const px = x + rx * (0.35 + i * 0.1)
    const py = y + ry * (i % 2 ? 0.25 : -0.15)
    g.ellipse(px, py, 7, 3).fill(0x809a78)
    if (i % 2) g.circle(px, py - 2, 2.5).fill(0xeac5b6)
  }
}

function rock(g: Graphics, x: number, y: number, size: number) {
  g.ellipse(x + 5, y + 5, size * 1.2, size * 0.5).fill({ color: 0x213c32, alpha: 0.25 })
  g.moveTo(x - size, y + 2).lineTo(x - size * 0.6, y - size * 0.6).lineTo(x + size * 0.3, y - size * 0.8).lineTo(x + size, y).lineTo(x + size * 0.6, y + size * 0.4).closePath().fill(0x92977f)
  g.moveTo(x - size * 0.6, y - size * 0.6).lineTo(x + size * 0.3, y - size * 0.8).lineTo(x + size * 0.15, y).lineTo(x - size, y + 2).closePath().fill(0xb5b49a)
}

function grass(g: Graphics, x: number, y: number, size: number, color = 0xb9bc86) {
  for (let i = 0; i < 5; i++) {
    const dx = (i - 2) * size * 0.24
    g.moveTo(x, y).quadraticCurveTo(x + dx, y - size * 0.65, x + dx + size * 0.3, y - size).stroke({ color, width: 1.5, alpha: 0.7 })
  }
}

function woodlandTree(g: Graphics, x: number, y: number, size: number, seed: number) {
  g.ellipse(x + size * 0.6, y + size * 0.9, size, size * 0.36).fill({ color: 0x0e2626, alpha: 0.28 })
  g.moveTo(x - 4, y + size).lineTo(x - 2, y - 5).lineTo(x + 5, y - 5).lineTo(x + 4, y + size).closePath().fill(0xc2bda0)
  for (let i = 0; i < 4; i++) g.moveTo(x - 2, y + i * size / 4).lineTo(x + 3, y + i * size / 4 + 2).stroke({ color: 0x65705b, width: 2 })
  tree(g, x, y - size * 0.2, size, seed % 2 ? 0x45694f : 0x648163, seed)
  g.moveTo(x, y + size).lineTo(x - 9, y + size + 4).moveTo(x + 2, y + size).lineTo(x + 11, y + size + 3).stroke({ color: 0x8a9578, width: 2 })
}

function meadowLandscape(g: Graphics, w: number, h: number, preview: boolean) {
  const rand = random(194)
  const artH = preview ? h - 95 : h
  // An open field: broad flower ribbons, no enclosing wall of trees.
  g.ellipse(w * 0.6, artH * 0.45, w * 0.5, artH * 0.4).fill({ color: 0xa2b77b, alpha: 0.09 })
  if (preview) {
    g.moveTo(w * 0.45, artH + 20).bezierCurveTo(w * 0.1, artH * 0.65, w * 0.8, artH * 0.45, w * 0.55, -10).stroke({ color: 0xd4c698, width: 23, alpha: 0.65 })
  } else {
    const { rows, cellH } = getMemorialLayout(w, h, 'meadow')
    // Soft mown paths follow the flower beds rather than a rigid stone grid.
    for (let row = 1; row < rows; row++) {
      const y = 88 + row * cellH
      g.moveTo(30, y).bezierCurveTo(w * 0.3, y + 26, w * 0.6, y - 22, w - 30, y + 10).stroke({ color: 0xafb986, width: 23, alpha: 0.25 })
      for (let i = 0; i < 12; i++) {
        const x = 45 + i * (w - 90) / 11
        flowers(g, x, y + 20 + Math.sin(i) * 8, i % 3 ? 0xf1dca7 : 0xd0b8d8, row * 32 + i, 5)
      }
    }
  }
  const count = preview ? 28 : 55
  for (let i = 0; i < count; i++) {
    const x = 20 + rand() * (w - 40)
    const y = preview ? 25 + rand() * (artH - 30) : (i % 2 ? 30 + rand() * 35 : h - 30 - rand() * 35)
    flowers(g, x, y, [0xf6e4b9, 0xe8b3ac, 0xc4b5dc][i % 3]!, 200 + i, 7)
    grass(g, x + 15, y + 8, 13)
  }
  if (!preview) {
    for (let i = 0; i < 12; i++) {
      const y = 95 + i * (h - 150) / 12
      flowers(g, i % 2 ? 24 : w - 24, y, 0xf2dba0, 300 + i, 10)
    }
    tree(g, w - 22, 24, 29, 0x6d8a63, 55)
    lantern(g, 40, h - 80)
    lantern(g, w - 40, h - 80)
  }
}

function groveLandscape(g: Graphics, w: number, h: number, preview: boolean) {
  const rand = random(481)
  if (preview) {
    g.ellipse(w * 0.5, h * 0.38, w * 0.24, h * 0.24).fill({ color: 0x9da578, alpha: 0.22 })
    g.moveTo(w * 0.5, h - 80).quadraticCurveTo(w * 0.4, h * 0.4, w * 0.52, h * 0.16).stroke({ color: 0xad9e75, width: 13, alpha: 0.55 })
    for (let i = 0; i < 13; i++) {
      const side = i % 2 ? 0.17 : 0.84
      woodlandTree(g, w * side + (rand() - 0.5) * w * 0.13, 25 + rand() * (h * 0.43), 27 + rand() * 15, i + 41)
    }
    woodlandTree(g, w * 0.47, 12, 40, 77)
    lantern(g, w * 0.5, h * 0.43)
    return
  }
  const { places, rows, cellH } = getMemorialLayout(w, h, 'grove')
  const columns = w < 800 ? 3 : 4
  const cellW = (w - 140) / columns
  // Individual moss clearings and stepping stones connect sheltered groups.
  for (const { x, y } of places) {
    g.ellipse(x, y + 6, 65, 48).fill({ color: 0x8c9e70, alpha: 0.16 })
    for (let i = 0; i < 3; i++) g.ellipse(x + 48 + i * 12, y + 47 + Math.sin(i) * 3, 7, 4).fill({ color: 0xacad8c, alpha: 0.5 })
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns - 1; column++) {
      if ((row + column) % 2) continue
      const x = 70 + (column + 1) * cellW + (row % 2 ? 1 : -1) * cellW * 0.06
      const y = 78 + (row + 0.5) * cellH
      woodlandTree(g, x, y - 4, w < 800 ? 28 : 43, row * 14 + column)
      grass(g, x + 15, y + 40, 16, 0x7eaa79)
      flowers(g, x - 12, y + 43, 0xd9d5a1, row + column, 3)
    }
  }
  for (let i = 0; i < 18; i++) {
    const x = 15 + i * (w - 30) / 17
    woodlandTree(g, x, i % 2 ? 20 : h - 25, 27 + rand() * 22, i + 81)
  }
  for (let i = 0; i < 9; i++) {
    woodlandTree(g, i % 2 ? 12 : w - 12, 80 + i * (h - 160) / 8, 32 + rand() * 10, i + 101)
  }
  // Hanging lights across the upper canopy.
  g.moveTo(w * 0.22, 37).quadraticCurveTo(w * 0.5, 90, w * 0.78, 37).stroke({ color: 0xaca383, width: 1.5, alpha: 0.65 })
  for (let i = 0; i < 5; i++) {
    const f = (i + 1) / 6
    lantern(g, w * (0.22 + 0.56 * f), 37 + 106 * f * (1 - f) + 12)
  }
}

function hillLandscape(g: Graphics, w: number, h: number, preview: boolean) {
  const rand = random(786)
  if (preview) {
    // Overlapping slopes and a switchback staircase make the elevation readable.
    g.moveTo(0, h * 0.32).quadraticCurveTo(w * 0.3, -40, w, h * 0.2).lineTo(w, h).lineTo(0, h).closePath().fill(0x879075)
    g.moveTo(0, h * 0.53).quadraticCurveTo(w * 0.65, -30, w, h * 0.38).lineTo(w, h).lineTo(0, h).closePath().fill(0x697b60)
    g.moveTo(w * 0.36, h * 0.65).lineTo(w * 0.64, h * 0.42).lineTo(w * 0.43, h * 0.28).lineTo(w * 0.6, h * 0.12).stroke({ color: 0xd4c6a2, width: 13 })
    for (let i = 0; i < 7; i++) rock(g, 30 + rand() * (w - 60), 35 + rand() * h * 0.36, 10 + rand() * 8)
    grass(g, w * 0.8, h * 0.48, 29)
    grass(g, w * 0.2, h * 0.38, 22)
    lantern(g, w * 0.6, h * 0.12)
    return
  }
  const { rows, cellH } = getMemorialLayout(w, h, 'hill')
  for (let row = 0; row < rows; row++) {
    const y = 78 + (row + 0.5) * cellH + 69
    g.moveTo(24, y - cellH - 15).quadraticCurveTo(w * 0.55, y - cellH - 4, w - 24, y - cellH + 15).lineTo(w - 24, y + 15).quadraticCurveTo(w * 0.55, y - 4, 24, y - 15).closePath().fill({ color: row % 2 ? 0xb8bc8c : 0xe1d5a2, alpha: 0.07 })
    // Sloped stone retaining walls sit below each row of memorials.
    g.moveTo(24, y - 15).quadraticCurveTo(w * 0.55, y - 4, w - 24, y + 15).lineTo(w - 24, y + 30).quadraticCurveTo(w * 0.55, y + 11, 24, y).closePath().fill(0x414f42)
    g.moveTo(24, y - 15).quadraticCurveTo(w * 0.55, y - 4, w - 24, y + 15).stroke({ color: 0xb5b494, width: 5 })
    for (let i = 0; i < 24; i++) {
      const x = 30 + i * (w - 60) / 23
      const yy = y - 15 + 30 * x / w
      g.moveTo(x, yy + 4).lineTo(x + 2, yy + 12).stroke({ color: 0x8b9178, width: 1, alpha: 0.55 })
    }
    if (row < rows - 1) {
      const x = row % 2 ? w - 61 : 61
      g.moveTo(x, y - 22).lineTo(x, y + 30).stroke({ color: 0xd2c5a0, width: 28 })
      for (let i = 0; i < 7; i++) g.moveTo(x - 14, y - 20 + i * 8).lineTo(x + 14, y - 20 + i * 8).stroke({ color: 0x727b64, width: 2 })
      lantern(g, x + (row % 2 ? -26 : 26), y + 4)
    }
  }
  for (let i = 0; i < 18; i++) {
    const x = 28 + rand() * (w - 56)
    const y = i % 2 ? 28 + rand() * 32 : h - 22 - rand() * 20
    rock(g, x, y, 12 + rand() * 12)
    grass(g, x + 20, y + 3, 15 + rand() * 13)
  }
  for (let i = 0; i < 8; i++) {
    const x = i % 2 ? 25 : w - 25
    const y = 95 + i * (h - 180) / 7
    grass(g, x, y, 23)
    rock(g, x - 5, y + 12, 10)
  }
  // A small summit lookout, kept clear of the first memorial row.
  g.ellipse(w * 0.5, 38, 64, 22).fill({ color: 0xc7ba90, alpha: 0.3 })
  for (let i = 0; i < 3; i++) g.roundRect(w * 0.5 - 30, 21 + i * 5, 60, 3, 1).fill(0xb4a17b)
  g.moveTo(w * 0.5 - 24, 35).lineTo(w * 0.5 - 24, 44).moveTo(w * 0.5 + 24, 35).lineTo(w * 0.5 + 24, 44).stroke({ color: 0x47584a, width: 4 })
}

function landscape(g: Graphics, garden: Garden, w: number, h: number, preview: boolean) {
  const mood = moods[garden.id]
  const rand = random(garden.count * 77)
  g.roundRect(0, 0, w, h, 28).fill(mood.ground)
  // Broad translucent patches give the lawn depth without per-frame geometry work.
  for (let i = 0; i < 35; i++) {
    const x = 25 + rand() * (w - 50)
    const y = 25 + rand() * (h - 50)
    g.ellipse(x, y, 20 + rand() * 60, 10 + rand() * 25).fill({ color: i % 3 ? mood.leaf : 0x142f30, alpha: 0.1 })
  }
  for (let i = 0; i < 650; i++) {
    const x = 18 + rand() * (w - 36)
    const y = 18 + rand() * (h - 36)
    g.moveTo(x, y).lineTo(x + 2, y - 3 - rand() * 3).stroke({ color: i % 3 ? 0xb3c39a : 0x122e2c, width: 1, alpha: 0.12 })
  }
  if (garden.id === 'meadow') meadowLandscape(g, w, h, preview)
  else if (garden.id === 'grove') groveLandscape(g, w, h, preview)
  else if (garden.id === 'hill') hillLandscape(g, w, h, preview)
  else if (preview) {
    g.moveTo(w * 0.38, h - 65).bezierCurveTo(w * 0.22, h * 0.52, w * 0.75, h * 0.45, w * 0.46, 0).stroke({ color: 0xb8ac86, width: 16, alpha: 0.4 })
    pond(g, w * 0.7, h * 0.3, w * 0.23, h * 0.17)
    for (let i = 0; i < 7; i++) tree(g, 38 + rand() * w * 0.3, 28 + rand() * h * 0.48, 16 + rand() * 15, mood.leaf, i + 12)
    for (let i = 0; i < 9; i++) flowers(g, 25 + rand() * (w - 50), h * 0.52 + rand() * 10, mood.flower, i * 8 + 4)
    lantern(g, w * 0.4, h * 0.45)
    lantern(g, w * 0.53, h * 0.2)
  } else {
    pond(g, w * 0.52, 43, w * 0.23, 27)
    pond(g, w - 33, h * 0.55, 24, h * 0.29)
    const { rows, cellH } = getMemorialLayout(w, h, garden.id)
    for (let row = 1; row < rows; row++) {
      const y = 88 + row * cellH
      g.moveTo(42, y).bezierCurveTo(w * 0.3, y - 10, w * 0.7, y + 10, w - 42, y).stroke({ color: 0xc7b98e, width: 14, alpha: 0.36 })
      for (let i = 0; i < 15; i++) g.ellipse(65 + i * (w - 130) / 14, y + Math.sin(i) * 3, 5 + i % 3, 2).fill({ color: 0xe1d3ae, alpha: 0.25 })
      lantern(g, 57, y - 5)
      lantern(g, w - 57, y - 5)
    }
    for (let i = 0; i < 13; i++) {
      const x = 28 + i * (w - 56) / 12
      const radius = 21 + rand() * 11
      if (i < 3 || i > 9) tree(g, x, 26 + rand() * 14, radius, mood.leaf, i + 41)
      tree(g, x, h - 25 + rand() * 15, radius, mood.leaf, i + 90)
    }
    for (let i = 0; i < 9; i++) {
      const y = 85 + i * (h - 165) / 8
      tree(g, i % 2 ? 13 : w - 13, y, 22, mood.leaf, i + 123)
      flowers(g, i % 2 ? 45 : w - 45, y + 20, mood.flower, i + 71)
    }
  }
  g.roundRect(8, 8, w - 16, h - 16, 24).stroke({ color: 0xd8d4ad, width: 1, alpha: 0.16 })
}

export function createGardenScene(width: number, height: number, garden: Garden | undefined, t: Translate, onSelect: (id: GardenId) => void, saved: PublicMemorial[] = []) {
  const root = new Container()
  const staticArt = new Container()
  root.addChild(staticArt)
  staticArt.addChild(new Graphics().roundRect(0, 0, width, height, 28).fill(0x142e2e))
  if (!garden) {
    const gap = 26
    const margin = 36
    const tileW = (width - margin * 2 - gap) / 2
    const tileH = (height - margin * 2 - gap) / 2
    demoGardens.forEach((item, index) => {
      const tile = new Container()
      tile.position.set(margin + index % 2 * (tileW + gap), margin + Math.floor(index / 2) * (tileH + gap))
      tile.eventMode = 'static'
      tile.cursor = 'pointer'
      tile.hitArea = new Rectangle(0, 0, tileW, tileH)
      const art = new Graphics()
      landscape(art, item, tileW, tileH, true)
      art.roundRect(10, tileH - 99, tileW - 20, 89, 20).fill({ color: 0x142e2c, alpha: 0.92 })
      tile.addChild(art)
      label(tile, `0${index + 1}`, 23, 18, 18, 0xf5dfb2)
      label(tile, t(`garden.names.${item.id}`), 27, tileH - 87, 30, 0xfaf5eb, true)
      label(tile, t('garden.places', { count: item.count }), 27, tileH - 43, 18, 0xc9d5bf)
      const mask = new Graphics().roundRect(0, 0, tileW, tileH, 28).fill(0xffffff)
      tile.addChild(mask)
      tile.mask = mask
      // Cache artwork separately so the interactive border remains live when motion is paused.
      tile.cacheAsTexture({ resolution: 2, antialias: true })
      staticArt.addChild(tile)
      const border = new Graphics().roundRect(tile.x + 1, tile.y + 1, tileW - 2, tileH - 2, 28).stroke({ color: 0xefc681, width: 3 })
      border.eventMode = 'none'
      border.visible = false
      root.addChild(border)
      tile.on('pointerover', () => { border.visible = true })
      tile.on('pointerout', () => { border.visible = false })
      tile.on('pointertap', () => onSelect(item.id))
    })
  } else {
    const ground = new Graphics()
    landscape(ground, garden, width, height, false)
    staticArt.addChild(ground)
    const mood = moods[garden.id]
    for (const [index, { x, y, memorial }] of getMemorialLayout(width, height, garden.id, saved).places.entries()) {
      const marker = new Graphics()
      if (!memorial) {
        marker.ellipse(x, y + 15, 32, 12).fill({ color: 0x193e32, alpha: 0.22 })
        marker.circle(x, y - 4, 22).fill({ color: 0x183d32, alpha: 0.32 }).stroke({ color: 0xd6dfbc, width: 1.5, alpha: 0.6 })
        marker.moveTo(x - 7, y - 4).lineTo(x + 7, y - 4).moveTo(x, y - 11).lineTo(x, y + 3).stroke({ color: 0xe8e4c8, width: 2, alpha: 0.85 })
        staticArt.addChild(marker)
        label(staticArt, t('creation.add'), x, y + 30, 18, 0xd5dfc7).anchor.set(0.5, 0)
        continue
      }
      marker.ellipse(x + 5, y + 21, 48, 19).fill({ color: 0x112d2c, alpha: 0.28 })
      marker.ellipse(x, y + 21, 40, 14).fill(0x64816a)
      marker.ellipse(x, y + 22, 32, 10).fill(0x91a080)
      flowers(marker, x - 33, y + 16, mood.flower, index + 1, 5)
      marker.roundRect(x - 24, y - 34, 50, 62, 20).fill(0x9ba78d)
      marker.roundRect(x - 27, y - 40, 50, 62, 20).fill(0xe6dfc6)
      marker.roundRect(x - 22, y - 35, 40, 52, 17).stroke({ color: 0xb4ba9f, width: 1 })
      marker.ellipse(x - 2, y - 4, 7, 6).fill(0x7b8d74)
      for (const [dx, dy] of [[-11, -13], [-5, -18], [2, -18], [8, -12]]) marker.circle(x + dx!, y + dy!, 3).fill(0x7b8d74)
      marker.moveTo(x - 10, y + 10).lineTo(x + 6, y + 10).stroke({ color: 0xb0b498, width: 1 })
      lantern(marker, x + 34, y + 12)
      staticArt.addChild(marker)
      const name = label(staticArt, memorial.source === 'saved' ? memorial.name : t(`garden.pets.${memorial.profile}`), x, y + 36, 20, 0xfff6e3)
      if (name.width > 130) name.scale.set(130 / name.width)
      name.anchor.set(0.5, 0)
    }
    staticArt.cacheAsTexture({ resolution: 2, antialias: true })
  }
  const atmosphere = new Container()
  atmosphere.eventMode = 'none'
  root.addChild(atmosphere)
  const updateLife = createGardenLife(atmosphere, garden?.id, width, height)
  const ripples = garden?.id === 'lake'
    ? Array.from({ length: 3 }, (_, index) => {
        const ripple = new Graphics().ellipse(0, 0, 27 + index * 13, 4 + index * 2).stroke({ color: 0xc8e2cf, width: 1 })
        ripple.position.set(width * 0.52, 43)
        atmosphere.addChild(ripple)
        return ripple
      })
    : []
  const rand = random(981)
  const motes = Array.from({ length: garden ? 22 : 16 }, (_, index) => {
    const x = 35 + rand() * (width - 70)
    const y = 30 + rand() * (height - 60)
    const mote = new Graphics()
    glow(mote, 0, 0, 9, 0xf3d28a)
    mote.circle(0, 0, index % 3 ? 1.3 : 2).fill(0xffe1a1)
    mote.position.set(x, y)
    atmosphere.addChild(mote)
    return { mote, x, y, phase: rand() * Math.PI * 2 }
  })
  function update(time: number) {
    updateLife?.(time)
    ripples.forEach((ripple, index) => {
      const progress = (time * 0.1 + index / 3) % 1
      ripple.scale.set(0.5 + progress)
      ripple.alpha = Math.sin(progress * Math.PI) * 0.35
    })
    for (const { mote, x, y, phase } of motes) {
      mote.position.set(x + Math.sin(time * 0.23 + phase) * 13, y + Math.cos(time * 0.19 + phase) * 9)
      mote.alpha = 0.25 + (Math.sin(time * 0.7 + phase) + 1) * 0.3
    }
  }
  update(0)
  return { root, update }
}

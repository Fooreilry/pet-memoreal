import type { Graphics } from 'pixi.js'
import type { GardenId } from '../data/demoGardens'
import { getMemorialLayout } from '../data/demoMemorials'

type GroundMark = { x: number, y: number, size: number, lean: number, seed: number }
type TurfPatch = { x: number, y: number, rx: number, ry: number, seed: number }
const palettes = {
  meadow: { seed: 7051, shade: 0x234e36, turf: 0x8eae77, light: 0xb2c78f, earth: 0xa9a781, moss: 0x739456 },
  lake: { seed: 4267, shade: 0x173f38, turf: 0x80a78a, light: 0xa7c6a4, earth: 0x9ba997, moss: 0x648b64 },
  grove: { seed: 8119, shade: 0x173e30, turf: 0x789b6a, light: 0xa8ba88, earth: 0x9a9b72, moss: 0x6c8d56 },
  hill: { seed: 3581, shade: 0x214c37, turf: 0x8dac75, light: 0xb0c594, earth: 0xa3ad8d, moss: 0x77995b }
} as const

// Fixed construction counts: a wide monitor never creates a denser grass mesh.
export function getGardenGroundTexture(width: number, height: number, gardenId: GardenId, preview: boolean) {
  const artHeight = preview ? height - 99 : height
  let seed = palettes[gardenId].seed as number
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const places = preview ? [] : getMemorialLayout(width, height, gardenId).places
  const clear = (mark: GroundMark) => !places.some(place => mark.x + mark.size + 0.5 > place.x - 65
    && mark.x - mark.size - 0.5 < place.x + 65 && mark.y + mark.size + 0.5 > place.y - 52 && mark.y - mark.size - 0.5 < place.y + 65)
  const patches: TurfPatch[] = []
  const grass: GroundMark[] = []
  const moss: GroundMark[] = []
  const flecks: GroundMark[] = []
  if (width < 40 || artHeight < 40) return { artHeight, patches, grass, moss, flecks }
  for (let index = 0; index < (preview ? 8 : 22); index++) {
    const rx = Math.min(width * 0.14, preview ? 51 : 112) * (0.55 + random() * 0.45)
    const ry = Math.min(artHeight * 0.14, preview ? 23 : 34) * (0.55 + random() * 0.45)
    patches.push({ x: 9 + rx + random() * (width - 18 - rx * 2), y: 9 + ry + random() * (artHeight - 18 - ry * 2), rx, ry, seed: index })
  }
  for (const [marks, attempts, minSize, sizeRange] of [
    [grass, preview ? 36 : 138, 2, preview ? 2 : 4],
    [moss, preview ? 12 : 34, 3, preview ? 2 : 5],
    [flecks, preview ? 18 : 54, 1, 1.8]
  ] as const) {
    for (let index = 0; index < attempts; index++) {
      const size = minSize + random() * sizeRange
      const mark = { x: 10 + size + random() * (width - 20 - size * 2), y: 10 + size + random() * (artHeight - 20 - size * 2), size, lean: random() * 2 - 1, seed: index }
      if (clear(mark)) marks.push(mark)
    }
  }
  return { artHeight, patches, grass, moss, flecks }
}

export function drawGardenGround(g: Graphics, width: number, height: number, gardenId: GardenId, preview: boolean) {
  const palette = palettes[gardenId]
  const { patches, grass, moss, flecks } = getGardenGroundTexture(width, height, gardenId, preview)
  // Overlapping translucent washes keep the terrain soft, with no hard tiled boundary.
  for (const { x, y, rx, ry, seed } of patches) {
    g.moveTo(x - rx, y - ry * 0.1)
      .bezierCurveTo(x - rx * 0.75, y - ry * 0.9, x - rx * 0.15, y - ry * 0.65, x + rx * 0.2, y - ry * 0.8)
      .bezierCurveTo(x + rx * 0.65, y - ry, x + rx, y - ry * 0.25, x + rx * 0.93, y + ry * 0.25)
      .bezierCurveTo(x + rx * 0.6, y + ry * 0.9, x - rx * 0.1, y + ry * 0.5, x - rx * 0.5, y + ry * 0.65)
      .bezierCurveTo(x - rx * 0.85, y + ry * 0.5, x - rx * 0.95, y + ry * 0.25, x - rx, y - ry * 0.1)
      .closePath().fill({ color: seed % 3 ? palette.turf : palette.shade, alpha: seed % 3 ? 0.09 : 0.13 })
    if (seed % 2 === 0) {
      g.ellipse(x - rx * 0.1, y - ry * 0.12, rx * 0.65, ry * 0.35).fill({ color: palette.light, alpha: 0.035 })
    }
  }
  for (const { x, y, size, lean, seed } of grass) {
    // Three short curved blades form a loose tuft, with varied direction and length.
    for (let blade = 0; blade < 3; blade++) {
      const xx = x + (blade - 1) * size * 0.3
      const length = size * (blade === 1 ? 1 : 0.65)
      g.moveTo(xx, y).quadraticCurveTo(xx + lean * size * 0.25, y - length * 0.6, xx + lean * size * 0.6, y - length)
    }
    g.stroke({ color: seed % 3 ? palette.light : palette.shade, width: 0.8, alpha: seed % 3 ? 0.2 : 0.27 })
  }
  for (const { x, y, size, lean, seed } of moss) {
    // Small broken clusters suggest moss and clover rather than a uniform dot pattern.
    g.ellipse(x - size * 0.35, y, size * 0.48, size * 0.28)
      .ellipse(x + size * 0.28, y - size * 0.25, size * 0.38, size * 0.28)
      .ellipse(x + lean * size * 0.25, y + size * 0.2, size * 0.35, size * 0.22)
      .fill({ color: seed % 2 ? palette.moss : palette.turf, alpha: 0.25 })
    if (seed % 3 === 0) g.ellipse(x - size * 0.3, y - size * 0.12, size * 0.22, size * 0.1).fill({ color: palette.light, alpha: 0.24 })
  }
  for (const { x, y, size, lean, seed } of flecks) {
    g.moveTo(x - size, y).lineTo(x + size * lean, y - size * 0.5).lineTo(x + size * 0.7, y + size * 0.15)
      .closePath().fill({ color: seed % 3 ? palette.earth : palette.shade, alpha: 0.2 })
  }
}

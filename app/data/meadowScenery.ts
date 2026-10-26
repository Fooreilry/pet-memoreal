import { getMemorialLayout } from './demoMemorials'

export type MeadowPlant = { x: number, y: number, size: number, seed: number }
export type MeadowFlower = MeadowPlant & { kind: 'wildflower' | 'spire' }

// Keep the meadow open: flowers collect at its edges and in small gaps between places.
export function getMeadowSceneryLayout(width: number, height: number, preview = false) {
  const artHeight = preview ? height - 99 : height
  const layout = preview ? undefined : getMemorialLayout(width, height, 'meadow')
  const flowers: MeadowFlower[] = []
  const grass: MeadowPlant[] = []
  const clover: MeadowPlant[] = []
  const shrubs: MeadowPlant[] = []
  const lanterns: { x: number, y: number }[] = []
  let seed = 194
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  function clear(x: number, y: number, rx: number, up: number, down: number) {
    return x - rx >= 10 && x + rx <= width - 10 && y - up >= 10 && y + down <= artHeight - 10
      && !layout?.places.some(place => x + rx > place.x - 65 && x - rx < place.x + 65 && y + down > place.y - 52 && y - up < place.y + 65)
  }
  function flower(x: number, y: number, index: number, kind: MeadowFlower['kind'] = 'wildflower') {
    const size = preview ? 13 : 16 + index % 3
    if (clear(x, y, kind === 'spire' ? size * 0.85 : 26, kind === 'spire' ? size * 1.6 : 17, kind === 'spire' ? 5 : 18)) {
      flowers.push({ x, y, size, seed: index + 200, kind })
    }
  }
  function tuft(x: number, y: number, size: number, index: number) {
    if (clear(x, y, size, size + 2, 5)) grass.push({ x, y, size, seed: index })
  }
  const columns = preview ? Math.min(6, Math.floor(width / 65)) : Math.min(12, Math.floor(width / 85))
  for (let index = 0; index < columns; index++) {
    const x = 38 + (index + 0.5) * (width - 76) / columns
    for (const side of [0, 1]) {
      const y = side ? artHeight - 38 - random() * 12 : 37 + random() * 20
      flower(x + (random() - 0.5) * 12, y, index + side * 13, index % 4 === 1 ? 'spire' : 'wildflower')
      tuft(x - 20, y + 12, preview ? 13 : 18 + index % 3, index)
    }
  }
  if (preview) {
    for (let index = 0; index < 8; index++) {
      const y = 38 + random() * (artHeight - 70)
      flower(width * (index % 2 ? 0.76 : 0.26), y, index + 40, index % 3 ? 'wildflower' : 'spire')
    }
  } else {
    for (let index = 0; index < 8; index++) {
      const y = 94 + index * (height - 210) / 7
      for (const side of [0, 1]) {
        const x = side ? width - 38 : 38
        flower(x, y, index + side * 8 + 50, index % 3 === 0 ? 'spire' : 'wildflower')
        tuft(x + (side ? -7 : 7), y + 31, 17 + index % 3, index + side * 8)
      }
    }
    const cols = width < 800 ? 3 : 4
    for (let index = 1; index < layout!.places.length; index++) {
      if (index % cols === 0) continue
      const left = layout!.places[index - 1]!
      const right = layout!.places[index]!
      const x = (left.x + right.x) / 2
      const y = (left.y + right.y) / 2 + 6
      flower(x, y, 80 + index, width < 800 || index % 2 ? 'spire' : 'wildflower')
      tuft(x + (index % 2 ? -3 : 3), y + 34, 14, index)
    }
    for (const x of [55, width - 55]) {
      if (clear(x, height - 83, 12, 28, 14)) lanterns.push({ x, y: height - 83 })
    }
  }
  for (let index = 0; index < (preview ? 6 : 14); index++) {
    const size = preview ? 6 : 7 + index % 3
    const x = 24 + random() * (width - 48)
    const y = 27 + random() * (artHeight - 54)
    if (clear(x, y, size * 1.4, size * 1.1, size * 0.7)) clover.push({ x, y, size, seed: index })
  }
  for (let index = 0; index < (preview ? 2 : 6); index++) {
    const size = preview ? 11 : 14 + index % 2 * 2
    const x = index % 2 ? width - 32 : 32
    const y = preview ? artHeight * (index ? 0.8 : 0.3) : 45 + Math.floor(index / 2) * (height - 95) / 2
    if (clear(x, y, size * 1.4, size * 1.5, size * 0.55)) shrubs.push({ x, y, size, seed: index + 3 })
  }
  return { flowers, grass, clover, shrubs, lanterns }
}

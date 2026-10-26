import { getMemorialLayout } from './demoMemorials'

export const hillRockKinds = ['boulder', 'slab', 'spire', 'cluster'] as const
export type HillRockKind = typeof hillRockKinds[number]
export type HillPoint = { x: number, y: number }
export type HillRock = HillPoint & { size: number, kind: HillRockKind }
export type HillShrub = HillPoint & { size: number, seed: number }

export function getHillSceneryLayout(width: number, height: number, preview = false) {
  let seed = 786
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const artHeight = preview ? height - 99 : height
  const layout = preview ? undefined : getMemorialLayout(width, height, 'hill')
  const rocks: HillRock[] = []
  const shrubs: HillShrub[] = []
  // Reserve space for the entire button plus the name below it, including empty places.
  const clear = (x: number, y: number, rx: number, up: number, down: number) => !layout?.places.some(place =>
    x + rx > place.x - 65 && x - rx < place.x + 65 && y + down > place.y - 52 && y - up < place.y + 65)
  function addRock(x: number, y: number, size: number, index: number) {
    x = Math.max(size * 1.6 + 8, Math.min(width - size * 1.6 - 8, x))
    if (clear(x, y, size * 1.6, size * 1.5, size * 0.85)) rocks.push({ x, y, size, kind: hillRockKinds[index % hillRockKinds.length]! })
  }
  function addShrub(x: number, y: number, size: number, index: number) {
    x = Math.max(size * 1.4 + 8, Math.min(width - size * 1.4 - 8, x))
    if (clear(x, y, size * 1.4, size * 1.5, size * 0.55)) shrubs.push({ x, y, size, seed: index })
  }
  const stream = Array.from({ length: 25 }, (_, index) => {
    const t = index / 24
    return {
      x: preview ? width * (0.7 + Math.sin(t * 5) * 0.1) : 51 + Math.sin(t * 14) * 14 + Math.sin(t * 25) * 2,
      y: t * artHeight
    }
  })
  if (preview) {
    for (let index = 0; index < 8; index++) {
      addRock(25 + random() * (width - 50), 35 + random() * (artHeight - 55), 11 + random() * 9, index)
      addShrub(25 + random() * (width - 50), 35 + random() * (artHeight - 55), 13 + random() * 9, index)
    }
  } else {
    for (let index = 0; index < 12; index++) {
      const y = 54 + index * (height - 110) / 11
      addRock(index % 2 ? width - 28 : 25, y, 12 + index % 4 * 2, index)
      addShrub(index % 2 ? 27 : width - 30, y + 15, 15 + index % 3 * 3, index)
    }
    const columns = width < 800 ? 3 : 4
    for (let row = 0; row < layout!.rows; row++) {
      for (let column = 1; column < columns; column++) {
        const x = 70 + column * (width - 140) / columns
        const y = 78 + (row + 0.5) * layout!.cellH - 18
        const size = width < 800 ? 12 : 18
        if ((row + column) % 2) addShrub(x, y, size, row * 7 + column)
        else addRock(x, y, size, row + column)
      }
    }
    for (let index = 0; index < 5; index++) {
      addShrub(100 + index * (width - 200) / 4, height - 24, 16 + index % 2 * 3, index + 30)
      addRock(105 + index * (width - 210) / 4, 38, 12 + index % 3 * 3, index + 20)
    }
  }
  return { rocks, shrubs, stream }
}

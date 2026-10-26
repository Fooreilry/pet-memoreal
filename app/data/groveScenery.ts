import { getMemorialLayout } from './demoMemorials'

export type GrovePlant = { x: number, y: number, size: number, seed: number }
export type GroveLantern = { x: number, y: number, hanging: boolean }

export function getGroveSceneryLayout(width: number, height: number, preview = false) {
  let seed = 481
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const artHeight = preview ? height - 99 : height
  const memorials = preview ? [] : getMemorialLayout(width, height, 'grove').places
  const trees: GrovePlant[] = []
  const shrubs: GrovePlant[] = []
  const grass: GrovePlant[] = []
  const flowers: GrovePlant[] = []
  const leaves: GrovePlant[] = []
  const lanterns: GroveLantern[] = []
  function clear(x: number, y: number, rx: number, up: number, down: number) {
    return x - rx >= 0 && x + rx <= width && y - up >= 0 && y + down <= artHeight
      && !memorials.some(place => x + rx > place.x - 65 && x - rx < place.x + 65 && y + down > place.y - 52 && y - up < place.y + 65)
  }
  function plant(target: GrovePlant[], x: number, y: number, size: number, index: number, rx: number, up: number, down: number) {
    if (clear(x, y, rx, up, down)) target.push({ x, y, size, seed: index })
  }
  function tree(x: number, y: number, size: number, index: number) {
    plant(trees, x, y, size, index, size * 1.5, size * 1.5, size * 1.4)
  }
  function shrub(x: number, y: number, size: number, index: number) {
    plant(shrubs, x, y, size, index, size * 1.4, size * 1.5, size * 0.55)
  }
  function tuft(x: number, y: number, size: number, index: number) {
    plant(grass, x, y, size, index, size, size + 2, 4)
  }
  function light(x: number, y: number, hanging = false) {
    // Reserve the solid frame/handle; the translucent halo remains part of the ground.
    if (clear(x, y, 12, hanging ? 37 : 28, 14)) lanterns.push({ x, y, hanging })
  }
  if (preview) {
    for (let index = 0; index < 11; index++) {
      const size = 19 + random() * 7
      const x = index % 2 ? width - size * 1.5 - 6 : size * 1.5 + 6
      const y = size * 1.5 + 8 + random() * Math.max(0, artHeight - size * 3 - 16)
      tree(x, y, size, index)
      shrub(width * (index % 2 ? 0.65 : 0.32), 38 + random() * (artHeight - 55), 12 + random() * 5, index)
    }
    light(width * 0.48, artHeight * 0.42, true)
    light(width * 0.55, artHeight * 0.85)
  } else {
    const { rows, cellH } = getMemorialLayout(width, height, 'grove')
    const columns = width < 800 ? 3 : 4
    const cellW = (width - 140) / columns
    const sideCount = Math.min(18, Math.max(10, Math.ceil(height / 90)))
    for (let index = 0; index < sideCount; index++) {
      for (const side of [0, 1]) {
        const size = (width < 800 ? 20 : 27) + random() * (width < 800 ? 3 : 4)
        const offset = (random() - 0.5) * 5
        const x = side ? width - size * 1.5 - 5 + offset : size * 1.5 + 5 + offset
        const y = 62 + index * (height - 135) / (sideCount - 1) + (random() - 0.5) * 10
        tree(x, y, size, index * 2 + side)
        shrub(side ? width - 43 : 43, y + 35, 13 + index % 3 * 2, index + side)
        if (index % 4 === 1) light(side ? width - 61 : 61, y + 8)
        tuft(side ? width - 25 : 25, y + 20, 14 + index % 3, index)
      }
    }
    const borderCount = Math.min(14, Math.floor(width / 85))
    for (let index = 0; index < borderCount; index++) {
      const x = 50 + (index + 0.5) * (width - 100) / borderCount
      tree(x, 34, 18 + index % 3, index + 40)
      tree(x, height - 46, 22 + index % 4, index + 60)
    }
    for (let row = 0; row < rows; row++) {
      const shift = (row % 2 ? 1 : -1) * cellW * 0.06
      for (let column = 1; column < columns; column++) {
        const x = 70 + column * cellW + shift
        const y = 78 + (row + 0.5) * cellH - 8
        if (width >= 800 && (row + column) % 2 === 0) tree(x, y, 22, row * 7 + column)
        else shrub(x, y + 4, width < 800 ? 11 : 17, row * 7 + column)
        tuft(x + (column % 2 ? 5 : -5), y + 36, 14, row + column)
      }
    }
    // The final mobile row has fewer places; its unused cells become a sheltered grove.
    for (let cell = memorials.length; cell < rows * columns; cell++) {
      const row = Math.floor(cell / columns)
      const shift = (row % 2 ? 1 : -1) * cellW * 0.06
      const x = 70 + (cell % columns + 0.5) * cellW + shift
      const y = 78 + (row + 0.5) * cellH - 4
      tree(x - 12, y, 32 + cell % 2 * 3, cell + 70)
      shrub(x + 28, y + 30, 15, cell + 80)
    }
    for (let index = 0; index < 4; index++) {
      const f = (index + 1) / 5
      light(width * (0.27 + 0.46 * f), 32 + 53 * f * (1 - f), true)
    }
  }
  for (let index = 0; index < (preview ? 24 : 65); index++) {
    const x = 20 + random() * (width - 40)
    const y = 18 + random() * (artHeight - 36)
    const size = 2.5 + random() * 2
    plant(leaves, x, y, size, index, size * 1.35, size * 1.35, size * 1.35)
    if (index % 5 === 0) plant(flowers, x, y, 1, index, 26, 17, 18)
  }
  return { trees, shrubs, grass, flowers, leaves, lanterns }
}

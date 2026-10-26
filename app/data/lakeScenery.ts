import { getMemorialLayout } from './demoMemorials'

export type LakePond = { x: number, y: number, rx: number, ry: number }
export type LakePlant = { x: number, y: number, size: number, seed: number }
export type LakeLily = { x: number, y: number, size: number, bloom: boolean }

export function getLakeSceneryLayout(width: number, height: number, preview = false) {
  const artHeight = preview ? height - 99 : height
  const places = preview ? [] : getMemorialLayout(width, height, 'lake').places
  const ponds: LakePond[] = []
  const lilies: LakeLily[] = []
  const reeds: LakePlant[] = []
  const shrubs: LakePlant[] = []
  const trees: LakePlant[] = []
  const pebbles: LakePlant[] = []
  const lanterns: { x: number, y: number }[] = []
  function clear(x: number, y: number, rx: number, up: number, down: number) {
    return x - rx >= 0 && x + rx <= width && y - up >= 0 && y + down <= artHeight
      && !places.some(place => x + rx > place.x - 65 && x - rx < place.x + 65 && y + down > place.y - 52 && y - up < place.y + 65)
  }
  function onWater(x: number, y: number, margin: number) {
    return ponds.some(pond => x + margin > pond.x - pond.rx - 10 && x - margin < pond.x + pond.rx + 10
      && y + margin > pond.y - pond.ry - 10 && y - margin < pond.y + pond.ry + 10)
  }
  if (preview) {
    ponds.push({ x: width * 0.66, y: artHeight * 0.45, rx: width * 0.26, ry: artHeight * 0.28 })
  } else {
    const { cellH } = getMemorialLayout(width, height, 'lake')
    const columns = width < 800 ? 3 : 4
    const cellW = (width - 140) / columns
    const firstFreeColumn = places.length % columns
    const freeWidth = (columns - firstFreeColumn) * cellW
    ponds.push(
      { x: width * 0.52, y: 47, rx: width * 0.28, ry: 31 },
      { x: 70 + firstFreeColumn * cellW + freeWidth / 2, y: places.at(-1)!.y, rx: freeWidth / 2 - 34, ry: Math.min(cellH * 0.3, 56) }
    )
  }
  for (const [pondIndex, pond] of ponds.entries()) {
    const count = preview ? 6 : 4
    for (let index = 0; index < count; index++) {
      const angle = index * 2.4 + pondIndex
      const x = pond.x + Math.cos(angle) * pond.rx * 0.55
      const y = pond.y + Math.sin(angle) * pond.ry * 0.44
      const size = Math.min(9, pond.rx * 0.2, pond.ry * 0.24)
      lilies.push({ x, y, size: size + (index % 2 ? 0 : -1), bloom: index % 3 === 0 })
    }
    for (let index = 0; index < (preview ? 5 : 6); index++) {
      const angle = (index + 0.5) / 6 * Math.PI * 2
      const size = preview ? 12 : 15 + index % 2 * 2
      const x = pond.x + Math.cos(angle) * (pond.rx + 4)
      const y = pond.y + Math.sin(angle) * (pond.ry + 4)
      if (clear(x, y, size * 1.3, size * 1.6, size * 0.45)) reeds.push({ x, y, size, seed: pondIndex * 7 + index })
    }
  }
  const count = preview ? 5 : 12
  for (let index = 0; index < count; index++) {
    // The right edge stays open, with a few low shoreline groups instead of a long pool.
    if (!preview && index % 2 === 1) continue
    const size = preview ? 14 + index % 3 * 3 : 18 + index % 3 * 3
    const x = preview ? 28 + index % 2 * width * 0.14 : index % 2 ? width - 34 : 32
    const y = preview ? 30 + index * (artHeight - 60) / (count - 1) : 84 + index * (height - 145) / (count - 1)
    if (clear(x, y, size * 1.5, size * 1.5, size * 1.4) && !onWater(x, y, size * 1.5)) trees.push({ x, y, size, seed: index + 25 })
    if (clear(x + 8, y + 25, 20, 24, 10) && !onWater(x + 8, y + 25, 20)) shrubs.push({ x: x + 8, y: y + 25, size: 14, seed: index })
    if (index % 3 === 1 && clear(x + 26, y, 12, 28, 14) && !onWater(x + 26, y, 12)) lanterns.push({ x: x + 26, y })
  }
  if (!preview) {
    for (let index = 0; index < 3; index++) {
      const y = height * (0.3 + index * 0.21)
      const shrub = { x: width - 31, y, size: 15 + index % 2 * 2, seed: 61 + index }
      if (clear(shrub.x, shrub.y, shrub.size * 1.4, shrub.size * 1.5, shrub.size * 0.55)
        && !onWater(shrub.x, shrub.y, shrub.size * 1.5)) shrubs.push(shrub)
      const reed = { x: width - 60, y: y + 14, size: 15 + index % 2 * 2, seed: 64 + index }
      if (clear(reed.x, reed.y, reed.size * 1.3, reed.size * 1.6, reed.size * 0.45)
        && !onWater(reed.x, reed.y, reed.size * 1.6)) reeds.push(reed)
      for (let stone = 0; stone < 2; stone++) {
        const pebble = { x: width - 47 + stone * 11, y: y + 25 - stone * 4, size: 4 + stone, seed: index * 2 + stone }
        if (clear(pebble.x, pebble.y, pebble.size * 1.5, pebble.size, pebble.size * 0.6)
          && !onWater(pebble.x, pebble.y, pebble.size * 1.5)) pebbles.push(pebble)
      }
    }
  }
  return { ponds, lilies, reeds, shrubs, trees, lanterns, pebbles }
}

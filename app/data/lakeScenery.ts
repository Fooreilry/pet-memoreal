import { createGardenPlacement, sceneryBounds, sceneryCandidates, sceneryIntersects } from './gardenPlacement'
import type { SceneryRect } from './gardenPlacement'
import { getGardenLayout } from './gardenLayout'

export type LakePond = { x: number, y: number, rx: number, ry: number }
export type LakePlant = { x: number, y: number, size: number, seed: number, chunkId?: string }
export type LakeLily = { x: number, y: number, size: number, bloom: boolean }

export function getLakeSceneryLayout(width: number, height: number, preview = false) {
  const artHeight = preview ? height - 99 : height
  const ponds: LakePond[] = preview ? [{ x: width * 0.66, y: artHeight * 0.45, rx: width * 0.26, ry: artHeight * 0.28 }]
    : getGardenLayout(width, height, 'lake').features.ponds
  const banks = ponds.map(pond => sceneryBounds(pond.x, pond.y, pond.rx + 10, pond.ry + 10, pond.ry + 10))
  const placement = createGardenPlacement(width, height, 'lake', preview, preview ? banks : [])
  const lilies: LakeLily[] = [], reeds: LakePlant[] = [], shrubs: LakePlant[] = [], trees: LakePlant[] = [], pebbles: LakePlant[] = []
  const lanterns: { x: number, y: number, chunkId?: string }[] = []
  const waterOccupied: SceneryRect[] = []
  for (const [pondIndex, pond] of ponds.entries()) {
    for (let index = 0; index < 20; index++) {
      const angle = index * 2.4 + pondIndex
      const x = pond.x + Math.cos(angle) * pond.rx * (0.25 + index % 3 * 0.12)
      const y = pond.y + Math.sin(angle) * pond.ry * (0.23 + index % 2 * 0.18)
      const size = Math.max(3, Math.min(9, pond.rx * 0.15, pond.ry * 0.2)) - index % 2 * 0.5
      const footprint = sceneryBounds(x, y, size * 1.15, size * 1.2, size * 0.6 + 2)
      if (waterOccupied.some(other => sceneryIntersects(footprint, other, 4))) continue
      lilies.push({ x, y, size, bloom: index % 3 === 0 })
      waterOccupied.push(footprint)
      if (lilies.length >= (pondIndex + 1) * (preview ? 6 : 4)) break
    }
    for (let index = 0; index < 20; index++) {
      const angle = index * 2.4 + pondIndex
      const size = preview ? 10 : 13 + index % 3
      const x = pond.x + Math.cos(angle) * (pond.rx + 18 + size * 1.5)
      const y = pond.y + Math.sin(angle) * (pond.ry + 18 + size * 1.6)
      if (placement.reserve(sceneryBounds(x, y, size * 1.3, size * 1.6, size * 0.45), 6)) reeds.push({ x, y, size, seed: index + pondIndex * 23 })
      if (reeds.length >= (pondIndex + 1) * (preview ? 5 : 6)) break
    }
  }
  for (const candidate of sceneryCandidates(placement, 43, true)) {
    const size = preview ? 14 + candidate.seed % 4 : 25 + candidate.seed % 11
    if (placement.reserve(sceneryBounds(candidate.x, candidate.y, size * 1.5, size * 1.5, size * 1.4), 9)) trees.push({ ...candidate, size })
    if (trees.length >= (preview ? 4 : 9)) break
  }
  for (const candidate of sceneryCandidates(placement, 79)) {
    const size = preview ? 10 + candidate.seed % 3 : 17 + candidate.seed % 9
    if (placement.reserve(sceneryBounds(candidate.x, candidate.y, size * 1.4, size * 1.5, size * 0.55), 6)) shrubs.push({ ...candidate, size })
    if (shrubs.length >= (preview ? 4 : 10)) break
  }
  for (const candidate of sceneryCandidates(placement, 113, true)) {
    if (!placement.inside(sceneryBounds(candidate.x, candidate.y, 28, 37, 19))) continue
    if (placement.reserve(sceneryBounds(candidate.x, candidate.y, 12, 28, 14), 10)) lanterns.push(candidate)
    if (lanterns.length >= (preview ? 1 : 4)) break
  }
  if (!preview) {
    for (const candidate of sceneryCandidates(placement, 157)) {
      const size = 3.5 + candidate.seed % 3
      if (placement.reserve(sceneryBounds(candidate.x, candidate.y, size * 1.5, size, size * 0.6), 4)) pebbles.push({ ...candidate, size })
      if (pebbles.length >= 14) break
    }
  }
  return { ponds, lilies, reeds, shrubs, trees, lanterns, pebbles, occupied: placement.occupied, waterOccupied }
}

import { createGardenPlacement, sceneryBounds, sceneryCandidates } from './gardenPlacement'

export type MeadowPlant = { x: number, y: number, size: number, seed: number, chunkId?: string }
export type MeadowFlower = MeadowPlant & { kind: 'wildflower' | 'spire' }

export function getMeadowSceneryLayout(width: number, height: number, preview = false) {
  const placement = createGardenPlacement(width, height, 'meadow', preview)
  const flowers: MeadowFlower[] = [], grass: MeadowPlant[] = [], clover: MeadowPlant[] = [], shrubs: MeadowPlant[] = []
  const lanterns: { x: number, y: number, chunkId?: string }[] = []
  for (const candidate of sceneryCandidates(placement, 41, true)) {
    const size = preview ? 11 : 19 + candidate.seed % 7
    if (placement.reserve(sceneryBounds(candidate.x, candidate.y, size * 1.4, size * 1.5, size * 0.55), 7)) shrubs.push({ ...candidate, size })
    if (shrubs.length >= (preview ? 2 : 6)) break
  }
  if (!preview) {
    for (const candidate of sceneryCandidates(placement, 89)) {
      if (!placement.inside(sceneryBounds(candidate.x, candidate.y, 28, 37, 19))) continue
      if (placement.reserve(sceneryBounds(candidate.x, candidate.y, 12, 28, 14), 10)) lanterns.push(candidate)
      if (lanterns.length >= 2) break
    }
  }
  for (const candidate of sceneryCandidates(placement, 127)) {
    const kind = candidate.seed % 4 === 1 ? 'spire' : 'wildflower'
    const size = preview ? 13 : 16 + candidate.seed % 3
    const footprint = kind === 'spire' ? sceneryBounds(candidate.x, candidate.y, size * 0.85, size * 1.6, 5)
      : sceneryBounds(candidate.x, candidate.y, 26, 17, 18)
    if (placement.reserve(footprint, 9)) flowers.push({ ...candidate, size, kind })
    if (flowers.length >= (preview ? 13 : 36)) break
  }
  for (const candidate of sceneryCandidates(placement, 163)) {
    const size = preview ? 11 + candidate.seed % 3 : 14 + candidate.seed % 6
    if (placement.reserve(sceneryBounds(candidate.x, candidate.y, size, size + 2, 5), 7)) grass.push({ ...candidate, size })
    if (grass.length >= (preview ? 10 : 28)) break
  }
  for (const candidate of sceneryCandidates(placement, 191)) {
    const size = preview ? 6 : 7 + candidate.seed % 3
    if (placement.reserve(sceneryBounds(candidate.x, candidate.y, size * 1.4, size * 1.1, size * 0.7), 7)) clover.push({ ...candidate, size })
    if (clover.length >= (preview ? 6 : 14)) break
  }
  return { flowers, grass, clover, shrubs, lanterns, occupied: placement.occupied }
}

import { createGardenPlacement, sceneryBounds, sceneryCandidates, streamBounds } from './gardenPlacement'
import { getGardenLayout } from './gardenLayout'

export const hillRockKinds = ['boulder', 'slab', 'spire', 'cluster'] as const
export type HillRockKind = typeof hillRockKinds[number]
export type HillPoint = { x: number, y: number }
export type HillRock = HillPoint & { size: number, kind: HillRockKind, chunkId?: string }
export type HillShrub = HillPoint & { size: number, seed: number, chunkId?: string }

export function getHillSceneryLayout(width: number, height: number, preview = false) {
  const artHeight = preview ? height - 99 : height
  const stream = preview ? Array.from({ length: 25 }, (_, index) => {
    const t = index / 24
    return { x: width * (0.7 + Math.sin(t * 5) * 0.1), y: t * artHeight }
  }) : getGardenLayout(width, height, 'hill').features.stream
  const placement = createGardenPlacement(width, height, 'hill', preview, preview ? streamBounds(stream, 17) : [])
  const rocks: HillRock[] = [], shrubs: HillShrub[] = []
  for (const candidate of sceneryCandidates(placement, 47, true)) {
    const size = preview ? 10 + candidate.seed % 6 : 17 + candidate.seed % 12
    if (placement.reserve(sceneryBounds(candidate.x, candidate.y, size * 1.6, size * 1.5, size * 0.85), 8)) {
      rocks.push({ ...candidate, size, kind: hillRockKinds[rocks.length % hillRockKinds.length]! })
    }
    if (rocks.length >= (preview ? 8 : 24)) break
  }
  for (const candidate of sceneryCandidates(placement, 109)) {
    const size = preview ? 10 + candidate.seed % 4 : 18 + candidate.seed % 9
    if (placement.reserve(sceneryBounds(candidate.x, candidate.y, size * 1.4, size * 1.5, size * 0.55), 7)) shrubs.push({ ...candidate, size })
    if (shrubs.length >= (preview ? 7 : 20)) break
  }
  return { rocks, shrubs, stream, occupied: placement.occupied }
}

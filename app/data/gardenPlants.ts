import { gardenIds } from '../../shared/gardens'
import type { GardenId } from '../../shared/gardens'
import { getGroveSceneryLayout } from './groveScenery'
import { getHillSceneryLayout } from './hillScenery'
import { getLakeSceneryLayout } from './lakeScenery'
import { getMeadowSceneryLayout } from './meadowScenery'
import { createGardenPlacement, sceneryBounds, sceneryCandidates, streamBounds } from './gardenPlacement'

export const plantKinds = ['fern', 'sedge', 'blossom'] as const
export type PlantKind = typeof plantKinds[number]
export type GardenPlant = { x: number, y: number, size: number, kind: PlantKind, seed: number, chunkId?: string }

export function getPrimarySceneryBounds(width: number, height: number, garden: GardenId, preview: boolean) {
  if (garden === 'meadow') return getMeadowSceneryLayout(width, height, preview).occupied
  if (garden === 'grove') return getGroveSceneryLayout(width, height, preview).occupied
  if (garden === 'hill') return getHillSceneryLayout(width, height, preview).occupied
  return getLakeSceneryLayout(width, height, preview).occupied
}

const profiles: Record<GardenId, readonly PlantKind[]> = {
  meadow: ['blossom', 'sedge', 'blossom', 'fern'], lake: ['fern', 'sedge', 'sedge', 'blossom'],
  grove: ['fern', 'fern', 'blossom', 'sedge'], hill: ['sedge', 'blossom', 'fern', 'sedge']
}

export function getGardenPlantLayout(width: number, height: number, garden: GardenId, preview = false): GardenPlant[] {
  if (width < 80 || (preview ? height - 99 : height) < 50) return []
  const water = !preview ? [] : garden === 'lake'
    ? getLakeSceneryLayout(width, height, true).ponds.map(pond => sceneryBounds(pond.x, pond.y, pond.rx + 10, pond.ry + 10, pond.ry + 10))
    : garden === 'hill' ? streamBounds(getHillSceneryLayout(width, height, true).stream, 17) : []
  const placement = createGardenPlacement(width, height, garden, preview, [...getPrimarySceneryBounds(width, height, garden, preview), ...water])
  const plants: GardenPlant[] = []
  for (const candidate of sceneryCandidates(placement, 277)) {
    const kind = profiles[garden][plants.length % profiles[garden].length]!
    let size = preview ? 9 + candidate.seed % 3 : garden === 'grove' ? 14 + candidate.seed % 6 : 16 + candidate.seed % 6
    const reserve = () => placement.reserve(sceneryBounds(candidate.x, candidate.y, size * 1.3, size * 1.6, size * 0.45), 8)
    if (!reserve()) {
      if (preview) continue
      // A small fern can finish a narrow pocket without crowding a memorial clearing.
      size = garden === 'grove' ? 10 + candidate.seed % 3 : 13 + candidate.seed % 4
      if (!reserve()) continue
    }
    plants.push({ ...candidate, size, kind, seed: gardenIds.indexOf(garden) * 137 + candidate.seed })
    if (plants.length >= (preview ? 3 : 8)) break
  }
  return plants
}

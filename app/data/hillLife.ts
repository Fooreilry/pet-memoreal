import { createGardenPlacement, sceneryBounds, sceneryCandidates } from './gardenPlacement'
import { getHillSceneryLayout } from './hillScenery'
import { getGardenPlantLayout } from './gardenPlants'

export type HillWindTuft = { x: number, y: number, size: number, seed: number, chunkId?: string }

// The whole bending envelope is reserved once. Animation changes skew, never placement.
export function getHillWindLayout(width: number, height: number): HillWindTuft[] {
  const occupied = getHillSceneryLayout(width, height).occupied
  const accents = getGardenPlantLayout(width, height, 'hill').map(plant =>
    sceneryBounds(plant.x, plant.y, plant.size * 1.3, plant.size * 1.6, plant.size * 0.45))
  const placement = createGardenPlacement(width, height, 'hill', false, [...occupied, ...accents])
  const tufts: HillWindTuft[] = []
  for (const candidate of sceneryCandidates(placement, 349)) {
    const size = 20 + candidate.seed % 4 * 2
    if (!placement.reserve(sceneryBounds(candidate.x, candidate.y, size + 6, size + 2, 5), 6)) continue
    tufts.push({ ...candidate, size })
    if (tufts.length === 12) break
  }
  return tufts
}

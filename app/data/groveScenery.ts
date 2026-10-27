import { createGardenPlacement, sceneryBounds, sceneryCandidates } from './gardenPlacement'

export type GrovePlant = { x: number, y: number, size: number, seed: number, chunkId?: string }
export type GroveLantern = { x: number, y: number, hanging: boolean, chunkId?: string }

export function getGroveSceneryLayout(width: number, height: number, preview = false) {
  const placement = createGardenPlacement(width, height, 'grove', preview)
  const trees: GrovePlant[] = [], shrubs: GrovePlant[] = [], grass: GrovePlant[] = [], flowers: GrovePlant[] = [], leaves: GrovePlant[] = []
  const lanterns: GroveLantern[] = []
  // Place the quiet light sources first so compact previews retain their atmosphere.
  for (const candidate of sceneryCandidates(placement, 103)) {
    if (!placement.inside(sceneryBounds(candidate.x, candidate.y, 28, 37, 19))) continue
    const hanging = candidate.seed % 2 === 0
    if (placement.reserve(sceneryBounds(candidate.x, candidate.y, 12, hanging ? 37 : 28, 14), 12)) lanterns.push({ ...candidate, hanging })
    if (lanterns.length >= (preview ? 2 : 6)) break
  }
  for (const candidate of sceneryCandidates(placement, 37, true)) {
    const size = preview ? 17 + candidate.seed % 6 : 25 + candidate.seed % 14
    if (placement.reserve(sceneryBounds(candidate.x, candidate.y, size * 1.5, size * 1.5, size * 1.4), 8)) trees.push({ ...candidate, size })
    if (trees.length >= (preview ? 8 : 26)) break
  }
  for (const candidate of sceneryCandidates(placement, 67)) {
    const size = preview ? 11 + candidate.seed % 3 : 17 + candidate.seed % 9
    if (placement.reserve(sceneryBounds(candidate.x, candidate.y, size * 1.4, size * 1.5, size * 0.55), 6)) shrubs.push({ ...candidate, size })
    if (shrubs.length >= (preview ? 6 : 16)) break
  }
  for (const candidate of sceneryCandidates(placement, 137)) {
    const size = preview ? 10 + candidate.seed % 3 : 15 + candidate.seed % 8
    if (placement.reserve(sceneryBounds(candidate.x, candidate.y, size, size + 2, Math.max(4, size / 26 * 5)), 5)) grass.push({ ...candidate, size })
    if (grass.length >= (preview ? 8 : 20)) break
  }
  for (const candidate of sceneryCandidates(placement, 167)) {
    if (placement.reserve(sceneryBounds(candidate.x, candidate.y, 26, 17, 18), 8)) flowers.push({ ...candidate, size: 1 })
    if (flowers.length >= (preview ? 4 : 7)) break
  }
  for (const candidate of sceneryCandidates(placement, 199)) {
    const size = 2.5 + candidate.seed % 3 * 0.6
    if (placement.reserve(sceneryBounds(candidate.x, candidate.y, size * 1.35, size * 1.35, size * 1.35), 3)) leaves.push({ ...candidate, size })
    if (leaves.length >= (preview ? 20 : 42)) break
  }
  return { trees, shrubs, grass, flowers, leaves, lanterns, occupied: placement.occupied }
}

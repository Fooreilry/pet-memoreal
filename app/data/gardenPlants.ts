import { gardenIds } from '../../shared/gardens'
import type { GardenId } from '../../shared/gardens'
import { getMemorialLayout } from './demoMemorials'
import { getGroveSceneryLayout } from './groveScenery'
import { getHillSceneryLayout } from './hillScenery'
import { getLakeSceneryLayout } from './lakeScenery'
import { getMeadowSceneryLayout } from './meadowScenery'

export const plantKinds = ['fern', 'sedge', 'blossom'] as const
export type PlantKind = typeof plantKinds[number]
export type GardenPlant = { x: number, y: number, size: number, kind: PlantKind, seed: number }
type Rect = { left: number, right: number, top: number, bottom: number }

function bounds(x: number, y: number, rx: number, up: number, down: number): Rect {
  return { left: x - rx, right: x + rx, top: y - up, bottom: y + down }
}

function intersects(a: Rect, b: Rect, gap = 0) {
  return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap
}

function sceneryBounds(width: number, height: number, garden: GardenId, preview: boolean): Rect[] {
  if (garden === 'meadow') {
    const decor = getMeadowSceneryLayout(width, height, preview)
    return [
      ...decor.flowers.map(p => p.kind === 'spire' ? bounds(p.x, p.y, p.size * 0.85, p.size * 1.6, 5) : bounds(p.x, p.y, 26, 17, 18)),
      ...decor.grass.map(p => bounds(p.x, p.y, p.size, p.size + 2, 5)),
      ...decor.clover.map(p => bounds(p.x, p.y, p.size * 1.4, p.size * 1.1, p.size * 0.7)),
      ...decor.shrubs.map(p => bounds(p.x, p.y, p.size * 1.4, p.size * 1.5, p.size * 0.55)),
      ...decor.lanterns.map(p => bounds(p.x, p.y, 12, 28, 14))
    ]
  }
  if (garden === 'grove') {
    const decor = getGroveSceneryLayout(width, height, preview)
    return [
      ...decor.trees.map(p => bounds(p.x, p.y, p.size * 1.5, p.size * 1.5, p.size * 1.4)),
      ...decor.shrubs.map(p => bounds(p.x, p.y, p.size * 1.4, p.size * 1.5, p.size * 0.55)),
      ...decor.grass.map(p => bounds(p.x, p.y, p.size, p.size + 2, 4)),
      ...decor.flowers.map(p => bounds(p.x, p.y, 26, 17, 18)),
      ...decor.lanterns.map(p => bounds(p.x, p.y, 12, p.hanging ? 37 : 28, 14))
    ]
  }
  if (garden === 'hill') {
    const decor = getHillSceneryLayout(width, height, preview)
    return [
      ...decor.rocks.map(p => bounds(p.x, p.y, p.size * 1.6, p.size * 1.5, p.size * 0.85)),
      ...decor.shrubs.map(p => bounds(p.x, p.y, p.size * 1.4, p.size * 1.5, p.size * 0.55)),
      ...decor.stream.slice(1).map((p, index) => ({
        left: Math.min(p.x, decor.stream[index]!.x) - 18,
        right: Math.max(p.x, decor.stream[index]!.x) + 18,
        top: decor.stream[index]!.y - 18,
        bottom: p.y + 18
      }))
    ]
  }
  if (garden === 'lake') {
    const decor = getLakeSceneryLayout(width, height, preview)
    return [
      ...decor.ponds.map(p => bounds(p.x, p.y, p.rx + 10, p.ry + 10, p.ry + 10)),
      ...decor.reeds.map(p => bounds(p.x, p.y, p.size * 1.3, p.size * 1.6, p.size * 0.45)),
      ...decor.shrubs.map(p => bounds(p.x, p.y, p.size * 1.4, p.size * 1.5, p.size * 0.55)),
      ...decor.trees.map(p => bounds(p.x, p.y, p.size * 1.5, p.size * 1.5, p.size * 1.4)),
      ...decor.lanterns.map(p => bounds(p.x, p.y, 12, 28, 14)),
      ...decor.pebbles.map(p => bounds(p.x, p.y, p.size * 1.5, p.size, p.size * 0.6))
    ]
  }
  return []
}

const profiles: Record<GardenId, readonly PlantKind[]> = {
  meadow: ['blossom', 'sedge', 'blossom', 'fern'],
  lake: ['fern', 'sedge', 'sedge', 'blossom'],
  grove: ['fern', 'fern', 'blossom', 'sedge'],
  hill: ['sedge', 'blossom', 'fern', 'sedge']
}

// Accent plants are deliberately sparse and join each garden's existing static cache.
export function getGardenPlantLayout(width: number, height: number, garden: GardenId, preview = false): GardenPlant[] {
  const artHeight = preview ? height - 99 : height
  if (width < 80 || artHeight < 50) return []
  const gardenIndex = gardenIds.indexOf(garden)
  let seed = 2401 + gardenIndex * 137
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const layout = preview ? undefined : getMemorialLayout(width, height, garden)
  const protectedPlaces = layout?.places.map(p => bounds(p.x, p.y, 65, 52, 65)) ?? []
  const occupied = sceneryBounds(width, height, garden, preview)
  const candidates: { x: number, y: number }[] = []
  if (preview) {
    for (let index = 1; index < 6; index++) candidates.push({ x: width * index / 6, y: artHeight - 18 })
  }
  if (layout) {
    const columns = width < 800 ? 3 : 4
    for (const dy of [32, -12, 52]) {
      for (let index = 1; index < layout.places.length; index++) {
        if (index % columns === 0) continue
        const left = layout.places[index - 1]!
        const right = layout.places[index]!
        candidates.push({ x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 + dy })
      }
    }
  }
  for (let index = 0; index < (preview ? 36 : 24); index++) {
    const edge = preview ? 22 : 90
    candidates.push({ x: edge + random() * (width - edge * 2), y: 25 + random() * (artHeight - 50) })
  }
  // Shuffle only during construction, giving accents space across the whole location.
  for (let index = candidates.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    const candidate = candidates[index]!
    candidates[index] = candidates[other]!
    candidates[other] = candidate
  }
  const plants: GardenPlant[] = []
  const added: Rect[] = []
  const limit = preview ? 3 : 8
  for (const [index, candidate] of candidates.entries()) {
    const kind = profiles[garden][plants.length % profiles[garden].length]!
    const size = preview ? 9 + index % 3 : garden === 'grove' ? 10 + index % 3 : width < 800 ? 10 + index % 2 : 13 + index % 4
    const rect = bounds(candidate.x, candidate.y, size * 1.3, size * 1.6, size * 0.45)
    if (rect.left < 8 || rect.right > width - 8 || rect.top < 10 || rect.bottom > artHeight - 8) continue
    if (protectedPlaces.some(p => intersects(rect, p)) || occupied.some(p => intersects(rect, p, 5)) || added.some(p => intersects(rect, p, 18))) continue
    plants.push({ ...candidate, size, kind, seed: gardenIndex * 137 + index })
    added.push(rect)
    if (plants.length === limit) break
  }
  return plants
}

import type { GardenId } from './demoGardens'
import type { GardenView } from '../utils/gardenProjection'

export type SurroundingPlant = {
  id: string
  x: number
  y: number
  size: number
  seed: number
  kind: 'tree' | 'shrub' | 'fern' | 'grass' | 'flowers' | 'rock'
  bounds: GardenView
}
export const surroundingBudget = 100
export const gardenCoreBounds: GardenView = { left: 0, right: 1200, top: 0, bottom: 1000 }

const profiles = {
  meadow: ['shrub', 'flowers', 'grass', 'flowers'], lake: ['tree', 'fern', 'shrub', 'grass'],
  grove: ['tree', 'shrub', 'fern', 'tree'], hill: ['rock', 'grass', 'shrub', 'grass']
} as const

export function gardenWorldCellSeed(x: number, y: number, garden: GardenId, seed: number) {
  let value = (seed ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663)
    ^ Math.imul(['meadow', 'lake', 'grove', 'hill'].indexOf(garden) + 1, 83492791)) >>> 0
  value = Math.imul(value ^ value >>> 16, 2246822507) >>> 0
  return (value ^ value >>> 13) >>> 0
}

export function gardenWorldRandom(seed: number) {
  let value = seed
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296 }
}

export function gardenWorldIntersects(a: GardenView, b: GardenView, gap = 0) {
  return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap
}

export function gardenWorldContains(outer: GardenView, inner: GardenView) {
  return inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom
}

// Each cell owns its own random stream: resizing never moves an existing plant.
export function getGardenSurroundings(bounds: GardenView, garden: GardenId, seed: number, extraObstacles: GardenView[] = []) {
  const plants: SurroundingPlant[] = []
  if (![bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite)
    || bounds.right <= bounds.left || bounds.bottom <= bounds.top) return { plants, map: gardenCoreBounds }
  const cellWidth = 300, cellHeight = 280
  let cells = 0
  for (let cy = Math.floor(bounds.top / cellHeight); cy <= Math.floor(bounds.bottom / cellHeight) && cells < 512; cy++) {
    for (let cx = Math.floor(bounds.left / cellWidth); cx <= Math.floor(bounds.right / cellWidth) && cells < 512; cx++, cells++) {
      const cellSeed = gardenWorldCellSeed(cx, cy, garden, seed)
      const random = gardenWorldRandom(cellSeed)
      const local: SurroundingPlant[] = []
      // Physical scales match the decorations inside the garden, including silhouettes/shadows.
      for (let attempt = 0; attempt < 30 && local.length < 2; attempt++) {
        const kind = profiles[garden][Math.floor(random() * profiles[garden].length)]!
        const size = kind === 'flowers' ? 1 : kind === 'tree' ? 26 + random() * 12
          : kind === 'grass' ? 14 + random() * 10 : kind === 'shrub' ? 17 + random() * 10 : 13 + random() * 9
        const x = cx * cellWidth + 62 + random() * (cellWidth - 124)
        const y = cy * cellHeight + 64 + random() * (cellHeight - 128)
        const footprint = kind === 'flowers' ? { left: x - 24, right: x + 24, top: y - 15, bottom: y + 16 }
          : { left: x - size * (kind === 'rock' ? 1.6 : 1.5), right: x + size * (kind === 'rock' ? 1.6 : 1.5), top: y - size * 1.6, bottom: y + size * 1.4 }
        if (gardenWorldIntersects(footprint, gardenCoreBounds, 3)
          || extraObstacles.some(rect => gardenWorldIntersects(footprint, rect, 5))
          || local.some(other => gardenWorldIntersects(footprint, other.bounds, 8))) continue
        local.push({ id: `${cx}:${cy}:${attempt}`, x, y, size, seed: (cellSeed + attempt * 7919) >>> 0, kind, bounds: footprint })
      }
      for (const plant of local) {
        if (gardenWorldContains(bounds, plant.bounds) && plants.length < surroundingBudget) plants.push(plant)
      }
    }
  }
  return { plants, map: gardenCoreBounds }
}

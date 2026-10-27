import type { GardenId } from './demoGardens'
import type { GardenProjection, GardenView } from '../utils/gardenProjection'

const environmentSeeds: Record<GardenId, number> = { meadow: 6329, lake: 9719, grove: 4261, hill: 8147 }

export function getGardenEnvironmentSeed(garden: GardenId) { return environmentSeeds[garden] }

// At 100% the visible world is largest. All supported zoom/pan views fit this envelope.
export function getGardenEnvironmentBounds(width: number, height: number, projection: GardenProjection): GardenView {
  const cell = 64
  return {
    left: Math.floor((-projection.offsetX / projection.scale - cell) / cell) * cell,
    right: Math.ceil(((width - projection.offsetX) / projection.scale + cell) / cell) * cell,
    top: Math.floor((-projection.offsetY / projection.scale - cell) / cell) * cell,
    bottom: Math.ceil(((height - projection.offsetY) / projection.scale + cell) / cell) * cell
  }
}

export function getGardenOuterStream(bounds: GardenView, garden: GardenId) {
  if (garden !== 'hill') return []
  const step = 1000 / 24
  const point = (index: number) => {
    const t = index / 24
    return { x: 145 + Math.sin(t * 8.3 + 0.3) * 40 + Math.sin(t * 17) * 7, y: index * step }
  }
  return [[Math.floor(bounds.top / step), 0], [24, Math.ceil(bounds.bottom / step)]]
    .filter(([first, last]) => last! > first!)
    .map(([first, last]) => ({ phase: first!, points: Array.from({ length: last! - first! + 1 }, (_, index) => point(first! + index)) }))
}

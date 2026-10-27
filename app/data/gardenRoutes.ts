import type { GardenId } from '../../shared/gardens'

type RoutePoint = { x: number, y: number }
export type GardenRoutePath = { curve: [RoutePoint, RoutePoint, RoutePoint, RoutePoint], width: number, seed: number }

// Permanent route corridors belong to the garden's geography, not to its session decoration.
// Coordinates use the canonical 1200 × 1000 world; a garden may have no constructed path.
export function getGardenRoutePaths(garden: GardenId): GardenRoutePath[] {
  const route = (points: [number, number][], width: number, seed: number): GardenRoutePath => ({
    curve: points.map(([x, y]) => ({ x, y })) as GardenRoutePath['curve'], width, seed
  })
  if (garden === 'meadow') return [
    route([[90, 765], [255, 822], [315, 548], [565, 590]], 24, 3271),
    route([[565, 590], [810, 635], [810, 340], [1100, 365]], 24, 3444)
  ]
  if (garden === 'grove') return [
    route([[95, 680], [154, 573], [290, 560], [320, 417]], 13, 4567),
    route([[1085, 396], [982, 414], [1034, 593], [936, 660]], 12, 4740)
  ]
  if (garden === 'lake') return [
    route([[636, 122], [560, 240], [560, 375], [818, 365]], 17, 7193)
  ]
  return []
}

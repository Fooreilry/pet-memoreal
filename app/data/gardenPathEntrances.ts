import type { GardenId } from './demoGardens'
import type { GardenPath } from './gardenPaths'
import type { GardenView } from '../utils/gardenProjection'
import { getGardenRoutePaths } from './gardenRoutes'

// Pure fixed geography, safe to use before session vegetation is generated.
export function getGardenCoreRouteEntrances(garden: GardenId): GardenPath[] {
  const paths: GardenPath[] = []
  const routes = getGardenRoutePaths(garden)
  for (const [index, route] of routes.entries()) {
    for (const end of [0, 3] as const) {
      const start = route.curve[end]
      if (routes.some((other, item) => item !== index && [other.curve[0], other.curve[3]].some(point => Math.hypot(point.x - start.x, point.y - start.y) < 0.01))) continue
      const neighbour = route.curve[end === 0 ? 1 : 2]
      const delta = { x: start.x - neighbour.x, y: start.y - neighbour.y }
      const exits = [
        { axis: 'x' as const, edge: 0, distance: start.x, outward: -delta.x },
        { axis: 'x' as const, edge: 1200, distance: 1200 - start.x, outward: delta.x },
        { axis: 'y' as const, edge: 0, distance: start.y, outward: -delta.y },
        { axis: 'y' as const, edge: 1000, distance: 1000 - start.y, outward: delta.y }
      ].filter(exit => exit.distance <= 130 && exit.outward > 0).sort((a, b) => a.distance - b.distance)
      const exit = exits[0]
      if (!exit) continue
      const t = (exit.edge - start[exit.axis]) / delta[exit.axis]
      const finish = { x: start.x + delta.x * t, y: start.y + delta.y * t }
      finish[exit.axis] = exit.edge
      paths.push({ curve: [start,
        { x: start.x + (finish.x - start.x) / 3, y: start.y + (finish.y - start.y) / 3 },
        { x: start.x + (finish.x - start.x) * 2 / 3, y: start.y + (finish.y - start.y) * 2 / 3 }, finish], width: route.width, seed: route.seed })
    }
  }
  return paths
}

export function getGardenCoreRouteIngressObstacles(garden: GardenId): GardenView[] {
  return getGardenCoreRouteEntrances(garden).flatMap(path => {
    const start = path.curve[0], finish = path.curve[3], radius = path.width * 0.65 + 6
    return Array.from({ length: 16 }, (_, index) => {
      const a = { x: start.x + (finish.x - start.x) * index / 16, y: start.y + (finish.y - start.y) * index / 16 }
      const b = { x: start.x + (finish.x - start.x) * (index + 1) / 16, y: start.y + (finish.y - start.y) * (index + 1) / 16 }
      return { left: Math.min(a.x, b.x) - radius, right: Math.max(a.x, b.x) + radius,
        top: Math.min(a.y, b.y) - radius, bottom: Math.max(a.y, b.y) + radius }
    })
  })
}

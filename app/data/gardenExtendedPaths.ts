import type { GardenId } from './demoGardens'
import type { GardenPath, PathPoint } from './gardenPaths'
import type { GardenView } from '../utils/gardenProjection'
import { getGardenLayout, sampleGardenCurve } from './gardenLayout'
import { getGardenPlantLayout, getPrimarySceneryBounds } from './gardenPlants'
import { sceneryBounds, streamBounds } from './gardenPlacement'
import { getGardenRoutePaths } from './gardenRoutes'

type Side = 'left' | 'right' | 'top' | 'bottom'
type Node = { x: number, y: number, cost: number, rank: number, parent?: Node }
const cache = new Map<GardenId, { key: string, paths: GardenPath[] }>()
const distance = (a: PathPoint, b: PathPoint) => Math.hypot(a.x - b.x, a.y - b.y)
const mix = (a: PathPoint, b: PathPoint, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

function lineHits(a: PathPoint, b: PathPoint, rect: GardenView, radius: number) {
  let start = 0, end = 1
  for (const axis of ['x', 'y'] as const) {
    const low = (axis === 'x' ? rect.left : rect.top) - radius
    const high = (axis === 'x' ? rect.right : rect.bottom) + radius
    const delta = b[axis] - a[axis]
    if (Math.abs(delta) < 1e-8) { if (a[axis] < low || a[axis] > high) return false }
    else {
      const first = (low - a[axis]) / delta, last = (high - a[axis]) / delta
      start = Math.max(start, Math.min(first, last))
      end = Math.min(end, Math.max(first, last))
      if (start > end) return false
    }
  }
  return true
}

function findConnection(start: PathPoint, target: PathPoint, clear: (a: PathPoint, b: PathPoint) => boolean, step = 12, padding = 228): PathPoint[] | undefined {
  if (clear(start, target)) return [start, target]
  const minX = Math.floor((Math.min(start.x, target.x) - start.x - padding) / step)
  const maxX = Math.ceil((Math.max(start.x, target.x) - start.x + padding) / step)
  const minY = Math.floor((Math.min(start.y, target.y) - start.y - padding) / step)
  const maxY = Math.ceil((Math.max(start.y, target.y) - start.y + padding) / step)
  const point = (node: Node) => ({ x: start.x + node.x * step, y: start.y + node.y * step })
  const heap: Node[] = []
  const push = (node: Node) => {
    heap.push(node)
    let index = heap.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (heap[parent]!.rank <= node.rank) break
      heap[index] = heap[parent]!
      index = parent
    }
    heap[index] = node
  }
  const pop = () => {
    const result = heap[0]!, last = heap.pop()!
    if (heap.length) {
      let index = 0
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1
        if (child + 1 < heap.length && heap[child + 1]!.rank < heap[child]!.rank) child++
        if (heap[child]!.rank >= last.rank) break
        heap[index] = heap[child]!
        index = child
      }
      heap[index] = last
    }
    return result
  }
  const costs = new Map<string, number>([['0,0', 0]])
  push({ x: 0, y: 0, cost: 0, rank: distance(start, target) })
  const directions = [[-1, 0], [0, -1], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const
  for (let visits = 0; heap.length && visits < (step < 6 ? 30000 : 10000); visits++) {
    const node = pop(), current = point(node)
    if (node.cost !== costs.get(`${node.x},${node.y}`)) continue
    if (distance(current, target) <= step * 2 && clear(current, target)) {
      const result = [target, current]
      let parent = node.parent
      while (parent) { result.push(point(parent)); parent = parent.parent }
      result.reverse()
      // Visibility simplification removes the grid pattern before corner rounding.
      const simplified = [result[0]!]
      for (let index = 0; index < result.length - 1;) {
        let next = result.length - 1
        while (next > index + 1 && !clear(result[index]!, result[next]!)) next--
        simplified.push(result[next]!)
        index = next
      }
      return simplified
    }
    for (const [dx, dy] of directions) {
      const x = node.x + dx, y = node.y + dy
      if (x < minX || x > maxX || y < minY || y > maxY) continue
      const cost = node.cost + Math.hypot(dx, dy) * step, key = `${x},${y}`
      if (cost >= (costs.get(key) ?? Infinity)) continue
      const candidate = { x: start.x + x * step, y: start.y + y * step }
      if (!clear(current, candidate)) continue
      costs.set(key, cost)
      push({ x, y, cost, rank: cost + distance(candidate, target), parent: node })
    }
  }
}

function roundedSegments(points: PathPoint[], width: number, seed: number, clear: (a: PathPoint, b: PathPoint) => boolean) {
  // Straight entrances need one material run, rather than a new tuft/stone patch at every waypoint.
  points = points.filter((point, index) => {
    if (!index || index === points.length - 1) return true
    const a = points[index - 1]!, b = points[index + 1]!
    const first = { x: point.x - a.x, y: point.y - a.y }, second = { x: b.x - point.x, y: b.y - point.y }
    return Math.abs(first.x * second.y - first.y * second.x) > 1e-6 || first.x * second.x + first.y * second.y < 0
  })
  const paths: GardenPath[] = []
  const segmentSeed = (curve: GardenPath['curve']) => curve.reduce((value, point) => Math.imul(value ^ Math.round(point.x * 100), 16777619) ^ Math.round(point.y * 100), seed) >>> 0
  const line = (a: PathPoint, b: PathPoint) => {
    const curve: GardenPath['curve'] = [a, mix(a, b, 1 / 3), mix(a, b, 2 / 3), b]
    if (distance(a, b) > 0.01) paths.push({ curve, width, seed: segmentSeed(curve) })
  }
  let previous = points[0]!
  for (let index = 1; index < points.length - 1; index++) {
    const a = points[index - 1]!, corner = points[index]!, b = points[index + 1]!
    const radius = Math.min(16, distance(a, corner) * 0.28, distance(corner, b) * 0.28)
    const entry = mix(corner, a, radius / distance(a, corner)), exit = mix(corner, b, radius / distance(corner, b))
    line(previous, entry)
    const curve: GardenPath['curve'] = [entry, mix(entry, corner, 2 / 3), mix(exit, corner, 2 / 3), exit]
    const samples = Array.from({ length: 17 }, (_, item) => sampleGardenCurve(curve, item / 16))
    if (samples.slice(1).every((point, item) => clear(samples[item]!, point))) paths.push({ curve, width, seed: segmentSeed(curve) })
    else { line(entry, corner); line(corner, exit) }
    previous = exit
  }
  line(previous, points.at(-1)!)
  return paths
}

function terminals(bounds: GardenView, garden: GardenId) {
  const routes = getGardenRoutePaths(garden)
  const result: { route: GardenPath, start: PathPoint, heading: PathPoint, inner: PathPoint, entry: PathPoint, anchor: PathPoint, ingress: GardenView, outer: GardenPath }[] = []
  for (const [index, route] of routes.entries()) {
    for (const end of [0, 3] as const) {
      const start = route.curve[end]!
      if (routes.some((other, item) => item !== index && (distance(other.curve[0], start) < 0.01 || distance(other.curve[3], start) < 0.01))) continue
      const neighbour = route.curve[end === 0 ? 1 : 2]!
      const length = distance(start, neighbour)
      const heading = { x: (start.x - neighbour.x) / length, y: (start.y - neighbour.y) / length }
      const sides = [
        { side: 'left' as Side, distance: start.x, outward: -heading.x, margin: -bounds.left },
        { side: 'right' as Side, distance: 1200 - start.x, outward: heading.x, margin: bounds.right - 1200 },
        { side: 'top' as Side, distance: start.y, outward: -heading.y, margin: -bounds.top },
        { side: 'bottom' as Side, distance: 1000 - start.y, outward: heading.y, margin: bounds.bottom - 1000 }
      ].filter(side => side.distance <= 130 && side.outward > 0.1 && side.margin > 4).sort((a, b) => a.distance - b.distance)
      const selected = sides[0]
      if (!selected) continue
      const { side } = selected
      const axis = side === 'left' || side === 'right' ? 'x' : 'y'
      const edge = side === 'left' || side === 'top' ? 0 : side === 'right' ? 1200 : 1000
      const sign = side === 'left' || side === 'top' ? -1 : 1
      const outerDistance = Math.min(96, selected.margin * 0.6)
      const t = (edge + sign * outerDistance - start[axis]) / heading[axis]
      const anchor = { x: start.x + heading.x * t, y: start.y + heading.y * t }
      anchor[axis] = edge + sign * outerDistance
      const entryT = (edge - start[axis]) / heading[axis]
      const entry = { x: start.x + heading.x * entryT, y: start.y + heading.y * entryT }
      entry[axis] = edge
      const innerT = (edge - sign * 40 - start[axis]) / heading[axis]
      const inner = { x: start.x + heading.x * innerT, y: start.y + heading.y * innerT }
      const otherAxis = axis === 'x' ? 'y' : 'x'
      const ingress: GardenView = { left: Math.min(entry.x, anchor.x) - 1, right: Math.max(entry.x, anchor.x) + 1,
        top: Math.min(entry.y, anchor.y) - 1, bottom: Math.max(entry.y, anchor.y) + 1 }
      const endpoint = { ...anchor }
      endpoint[axis] = bounds[side]
      const span = Math.abs(endpoint[axis] - anchor[axis])
      const low = otherAxis === 'x' ? bounds.left : bounds.top, high = otherAxis === 'x' ? bounds.right : bounds.bottom
      endpoint[otherAxis] = Math.max(low + 24, Math.min(high - 24, anchor[otherAxis] + Math.sin(route.seed) * Math.min(90, span * 0.22)))
      const c1 = { x: anchor.x + heading.x * span * 0.3, y: anchor.y + heading.y * span * 0.3 }
      c1[axis] = Math.max(Math.min(anchor[axis], endpoint[axis]), Math.min(Math.max(anchor[axis], endpoint[axis]), c1[axis]))
      c1[otherAxis] = Math.max(low + 8, Math.min(high - 8, c1[otherAxis]))
      const c2 = { ...endpoint }
      c2[axis] -= sign * span * 0.3
      if (span > 0.01) result.push({ route, start, heading, inner, entry, anchor, ingress, outer: { curve: [anchor, c1, c2, endpoint], width: route.width, seed: route.seed + 9919 } })
    }
  }
  return result
}

// Fixed mouths and outside corridors keep exterior vegetation unchanged between sessions.
export function getGardenExtendedRouteObstacles(bounds: GardenView, garden: GardenId): GardenView[] {
  return terminals(bounds, garden).flatMap(({ entry, anchor, outer }) => {
    const radius = outer.width * 0.65 + 6
    return [
      ...streamBounds(Array.from({ length: 17 }, (_, index) => mix(entry, anchor, index / 16)), radius),
      ...streamBounds(Array.from({ length: 65 }, (_, index) => sampleGardenCurve(outer.curve, index / 64)), radius)
    ]
  })
}

// Only continuations are returned: callers retain the original garden routes unchanged.
export function getExtendedGardenPaths(bounds: GardenView, garden: GardenId): GardenPath[] {
  const layout = getGardenLayout(1200, 1000, garden)
  const key = `${layout.seed}:${bounds.left}:${bounds.right}:${bounds.top}:${bounds.bottom}`
  const saved = cache.get(garden)
  if (saved?.key === key) return saved.paths.map(path => ({ ...path, curve: path.curve.map(point => ({ ...point })) as GardenPath['curve'] }))
  const paths: GardenPath[] = []
  const obstacles: GardenView[] = [
    // Like core vegetation, paths reserve the drawn stone and its label. The larger
    // touch-only padding is not a physical obstacle for noninteractive ground.
    ...layout.places.map(place => sceneryBounds(place.x, place.y, 70, 55, 70)),
    ...layout.features.ponds.map(pond => sceneryBounds(pond.x, pond.y, pond.rx + 10, pond.ry + 10, pond.ry + 10)),
    ...getPrimarySceneryBounds(1200, 1000, garden, false),
    ...getGardenPlantLayout(1200, 1000, garden).map(plant => sceneryBounds(plant.x, plant.y, plant.size * 1.3, plant.size * 1.6, plant.size * 0.45))
  ]
  for (const { route, start, heading, inner, entry, anchor, ingress, outer } of terminals(bounds, garden)) {
    const radius = route.width * 0.58 + 4
    const allowed = (point: PathPoint) => point.x >= 0 && point.x <= 1200 && point.y >= 0 && point.y <= 1000
      || point.x >= ingress.left && point.x <= ingress.right && point.y >= ingress.top && point.y <= ingress.bottom
    const lineAllowed = (a: PathPoint, b: PathPoint) => {
      const steps = Math.max(1, Math.ceil(distance(a, b) / 8))
      for (let index = 0; index <= steps; index++) if (!allowed(mix(a, b, index / steps))) return false
      return true
    }
    const clear = (a: PathPoint, b: PathPoint) => !obstacles.some(rect => lineHits(a, b, rect, radius))
      && lineAllowed(a, b)
    let connection: PathPoint[] | undefined
    for (const size of [30, 18, 8, 3]) {
      const lead = { x: start.x + heading.x * size, y: start.y + heading.y * size }
      if (!clear(start, lead)) continue
      connection = findConnection(lead, inner, clear) ?? findConnection(lead, inner, clear, 6, 640)
      if (connection) break
    }
    if (!connection) {
      const lead = { x: start.x + heading.x * 3, y: start.y + heading.y * 3 }
      if (clear(start, lead)) connection = findConnection(lead, inner, clear, 3, 640)
    }
    if (!connection) continue
    paths.push(...roundedSegments([start, ...connection, entry, anchor], route.width, route.seed + 5003, clear), outer)
  }
  cache.set(garden, { key, paths })
  return paths.map(path => ({ ...path, curve: path.curve.map(point => ({ ...point })) as GardenPath['curve'] }))
}

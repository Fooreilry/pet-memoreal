import type { GardenId } from './demoGardens'
import { getGardenLayout } from './gardenLayout'

export type PathPoint = { x: number, y: number }
export type GardenPath = { curve: [PathPoint, PathPoint, PathPoint, PathPoint], width: number, seed: number }
export type PathStone = { points: PathPoint[], tone: number, moss: boolean, cracked: boolean }

export function getGardenPaths(width: number, height: number, garden: GardenId, preview: boolean): GardenPath[] {
  const h = preview ? height - 99 : height
  const path = (points: [number, number][], size: number, seed: number): GardenPath => ({
    curve: points.map(([x, y]) => ({ x, y })) as GardenPath['curve'], width: size, seed
  })
  if (preview) {
    if (garden === 'meadow') return [path([[width * 0.12, h * 0.8], [width * 0.48, h * 0.92], [width * 0.47, h * 0.28], [width * 0.88, h * 0.34]], 17, 73)]
    if (garden === 'lake') return [path([[width * 0.32, h * 0.2], [width * 0.25, h * 0.52], [width * 0.31, h * 0.79], [width * 0.57, h * 0.84]], 11, 97)]
    if (garden === 'grove') return [
      path([[width * 0.12, h * 0.8], [width * 0.14, h * 0.62], [width * 0.27, h * 0.63], [width * 0.29, h * 0.38]], 9, 131),
      path([[width * 0.88, h * 0.32], [width * 0.78, h * 0.36], [width * 0.84, h * 0.58], [width * 0.75, h * 0.74]], 9, 149)
    ]
    return []
  }
  return getGardenLayout(width, height, garden).paths
}

function sample(curve: GardenPath['curve'], t: number): PathPoint {
  const [a, b, c, d] = curve
  const s = 1 - t
  return { x: s ** 3 * a.x + 3 * s ** 2 * t * b.x + 3 * s * t ** 2 * c.x + t ** 3 * d.x,
    y: s ** 3 * a.y + 3 * s ** 2 * t * b.y + 3 * s * t ** 2 * c.y + t ** 3 * d.y }
}

// One bounded construction pass; neither the path nor its individual stones have a ticker.
export function getPathSurface(path: GardenPath, preview: boolean, protectedPlaces: PathPoint[] = []) {
  let seed = path.seed
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const samples = Array.from({ length: 65 }, (_, index) => sample(path.curve, index / 64))
  const distances = [0]
  for (let index = 1; index < samples.length; index++) {
    distances.push(distances[index - 1]! + Math.hypot(samples[index]!.x - samples[index - 1]!.x, samples[index]!.y - samples[index - 1]!.y))
  }
  const length = distances.at(-1)!
  const at = (distance: number) => {
    const target = Math.min(length, Math.max(0, distance))
    const end = Math.max(1, distances.findIndex(value => value >= target))
    const start = end - 1
    const fraction = (target - distances[start]!) / (distances[end]! - distances[start]! || 1)
    const a = samples[start]!, b = samples[end]!
    const size = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction, nx: -(b.y - a.y) / size, ny: (b.x - a.x) / size }
  }
  const count = Math.min(preview ? 16 : 72, Math.max(6, Math.round(length / (preview ? 14 : 19))))
  const left: PathPoint[] = [], right: PathPoint[] = []
  for (let index = 0; index <= count; index++) {
    const point = at(length * index / count)
    const variation = 0.47 + random() * 0.08
    const half = path.width * (index === 0 || index === count ? 0.5 : variation)
    left.push({ x: point.x + point.nx * half, y: point.y + point.ny * half })
    right.push({ x: point.x - point.nx * half, y: point.y - point.ny * half })
  }
  const stones: PathStone[] = []
  const tufts: PathPoint[] = []
  const clear = (points: PathPoint[]) => {
    const left = Math.min(...points.map(point => point.x)) - 4
    const right = Math.max(...points.map(point => point.x)) + 4
    const top = Math.min(...points.map(point => point.y)) - 4
    const bottom = Math.max(...points.map(point => point.y)) + 4
    return !protectedPlaces.some(place => right > place.x - 65 && left < place.x + 65 && bottom > place.y - 52 && top < place.y + 65)
  }
  for (let row = 0; row < count; row++) {
    for (let lane = 0; lane < 2; lane++) {
      const distance = length * (row + 0.5 + lane * 0.32) / count
      if (distance > length - 3) continue
      const point = at(distance)
      const along = length / count * (0.36 + random() * 0.08)
      const across = path.width * (0.18 + random() * 0.035)
      const shift = path.width * (lane ? 0.24 : -0.24)
      const x = point.x + point.nx * shift, y = point.y + point.ny * shift
      const points = [[-0.8, -1], [0.65, -1], [1, -0.6], [0.9, 0.72], [0.4, 1], [-0.85, 0.86], [-1, 0.25], [-1, -0.65]].map(([a, b]) => ({
        x: x + point.ny * a! * along + point.nx * b! * across,
        y: y - point.nx * a! * along + point.ny * b! * across
      }))
      const stone = { points, tone: Math.floor(random() * 4), cracked: random() < (preview ? 0 : 0.18), moss: random() < 0.16 }
      if (clear(points)) stones.push(stone)
    }
    if (row % 3 === 0) {
      const edge = row % 2 ? left[row]! : right[row]!
      if (clear([{ x: edge.x - 4.2, y: edge.y - 4 }, { x: edge.x + 4.2, y: edge.y + 2 }])) tufts.push(edge)
    }
  }
  return { left, right, stones, tufts }
}

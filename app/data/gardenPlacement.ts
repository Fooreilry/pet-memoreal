import type { GardenId } from './demoGardens'
import { getGardenLayout } from './gardenLayout'
import { getGardenPaths } from './gardenPaths'
import { getGardenCoreRouteIngressObstacles } from './gardenPathEntrances'

export type SceneryRect = { left: number, right: number, top: number, bottom: number }
export type SceneryCandidate = { x: number, y: number, seed: number, area: 'frame' | 'chunk' | 'open', chunkId?: string }

export function sceneryBounds(x: number, y: number, rx: number, up: number, down: number): SceneryRect {
  return { left: x - rx, right: x + rx, top: y - up, bottom: y + down }
}

export function sceneryIntersects(a: SceneryRect, b: SceneryRect, gap = 0) {
  return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap
}

export function sceneryRandom(initialSeed: number) {
  let seed = initialSeed
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
}

export function streamBounds(points: { x: number, y: number }[], radius = 19): SceneryRect[] {
  return points.slice(1).map((point, index) => ({ left: Math.min(point.x, points[index]!.x) - radius,
    right: Math.max(point.x, points[index]!.x) + radius, top: Math.min(point.y, points[index]!.y) - radius,
    bottom: Math.max(point.y, points[index]!.y) + radius }))
}

export function createGardenPlacement(width: number, height: number, garden: GardenId, preview: boolean, extra: SceneryRect[] = []) {
  const artHeight = preview ? height - 99 : height
  const layout = getGardenLayout(width, artHeight, garden)
  const obstacles: SceneryRect[] = [...extra]
  if (!preview) {
    obstacles.push(...getGardenCoreRouteIngressObstacles(garden))
    // Artwork stays in world units even when a diagnostic caller requests another size.
    obstacles.push(...layout.places.map(place => sceneryBounds(place.x, place.y, 70, 55, 70)))
    obstacles.push(...layout.features.ponds.map(pond => sceneryBounds(pond.x, pond.y, pond.rx + 10, pond.ry + 10, pond.ry + 10)))
    obstacles.push(...streamBounds(layout.features.stream))
  }
  for (const path of getGardenPaths(width, height, garden, preview)) {
    const samples = Array.from({ length: 41 }, (_, index) => {
      const t = index / 40, s = 1 - t
      const [a, b, c, d] = path.curve
      return { x: s ** 3 * a.x + 3 * s ** 2 * t * b.x + 3 * s * t ** 2 * c.x + t ** 3 * d.x,
        y: s ** 3 * a.y + 3 * s ** 2 * t * b.y + 3 * s * t ** 2 * c.y + t ** 3 * d.y }
    })
    obstacles.push(...streamBounds(samples, path.width / 2 + 8))
  }
  const occupied: SceneryRect[] = []
  const inside = (rect: SceneryRect) => rect.left >= 8 && rect.right <= width - 8 && rect.top >= 8 && rect.bottom <= artHeight - 8
  function clear(rect: SceneryRect, gap = 4) {
    return inside(rect)
      && !obstacles.some(other => sceneryIntersects(rect, other, gap))
      && !occupied.some(other => sceneryIntersects(rect, other, gap))
  }
  function reserve(rect: SceneryRect, gap = 4) {
    if (!clear(rect, gap)) return false
    occupied.push(rect)
    return true
  }
  const random = sceneryRandom(layout.seed + 417)
  const candidates: SceneryCandidate[] = []
  const band = preview ? 40 : Math.min(94, width * 0.11)
  // A loose green frame; random offsets prevent a ring of evenly spaced props.
  for (let index = 0; index < (preview ? 40 : 96); index++) {
    const along = 0.05 + random() * 0.9
    const depth = 20 + random() * Math.max(8, band - 25)
    const side = index % 4
    candidates.push({ x: side === 0 ? depth : side === 1 ? width - depth : width * along,
      y: side === 2 ? depth : side === 3 ? artHeight - depth : artHeight * along, seed: index + 11, area: 'frame' })
  }
  if (!preview) {
    for (const [index, chunk] of layout.chunks.entries()) {
      const rect = chunk.bounds
      for (let sample = 0; sample < 12; sample++) candidates.push({
        x: rect.left + 12 + random() * Math.max(1, rect.right - rect.left - 24),
        y: rect.top + 12 + random() * Math.max(1, rect.bottom - rect.top - 24),
        seed: 200 + index * 13 + sample, area: 'chunk', chunkId: chunk.id
      })
    }
  }
  for (let index = 0; index < (preview ? 60 : 100); index++) candidates.push({
    x: 18 + random() * Math.max(1, width - 36), y: 18 + random() * Math.max(1, artHeight - 36),
    seed: 500 + index, area: 'open'
  })
  return { layout, artHeight, occupied, obstacles, candidates, inside, clear, reserve }
}

export function sceneryCandidates(placement: ReturnType<typeof createGardenPlacement>, salt: number, frameFirst = false) {
  const random = sceneryRandom(placement.layout.seed + salt)
  return placement.candidates.map(candidate => ({ candidate, rank: random() + (frameFirst && candidate.area !== 'frame' ? 2 : 0) }))
    .sort((a, b) => a.rank - b.rank).map(item => item.candidate)
}

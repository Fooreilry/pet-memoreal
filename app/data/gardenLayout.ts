import { gardenCapacity } from '../../shared/gardens'
import type { GardenId } from '../../shared/gardens'
import { getGardenRoutePaths } from './gardenRoutes'

export type GardenPoint = { x: number, y: number }
export type GardenRect = { left: number, right: number, top: number, bottom: number }
export type GardenLayoutPath = { curve: [GardenPoint, GardenPoint, GardenPoint, GardenPoint], width: number, seed: number }
export type GardenLayoutPlace = GardenPoint & { place: number, chunkId: string }
export type GardenLayoutChunk = GardenLayoutPlace & { id: string, bounds: GardenRect, protectedBounds: GardenRect }
export type GardenPond = GardenPoint & { rx: number, ry: number }
export type GardenLayout = {
  version: number
  seed: number
  frame: { inset: number }
  chunks: GardenLayoutChunk[]
  places: GardenLayoutPlace[]
  paths: GardenLayoutPath[]
  features: { ponds: GardenPond[], stream: GardenPoint[] }
}

export const gardenLayoutVersion = 1
const world = { width: 1200, height: 1000 }
const seeds: Record<GardenId, number> = { meadow: 3271, lake: 7193, grove: 4567, hill: 9323 }
const scaffolds = new Map<GardenId, GardenLayout>()
const cache = new Map<string, GardenLayout>()
let sessionSeed = 0

export function getGardenSessionSeed() {
  return sessionSeed
}

export function setGardenSessionSeed(seed: number) {
  const normalized = Number.isFinite(seed) ? seed >>> 0 : 0
  if (normalized === sessionSeed) return
  sessionSeed = normalized
  cache.clear()
}

export function getGardenWorldSize(_garden: GardenId) {
  return { ...world }
}

export function gardenRectsIntersect(a: GardenRect, b: GardenRect, gap = 0) {
  return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap
}

export function gardenPlaceBounds(point: GardenPoint): GardenRect {
  // Also reserve the minimum 44px touch target when the complete map fits a phone.
  return { left: point.x - 82, right: point.x + 82, top: point.y - 76, bottom: point.y + 88 }
}

export function sampleGardenCurve(curve: GardenLayoutPath['curve'], t: number): GardenPoint {
  const [a, b, c, d] = curve
  const s = 1 - t
  return { x: s ** 3 * a.x + 3 * s ** 2 * t * b.x + 3 * s * t ** 2 * c.x + t ** 3 * d.x,
    y: s ** 3 * a.y + 3 * s ** 2 * t * b.y + 3 * s * t ** 2 * c.y + t ** 3 * d.y }
}

function random(seed: number) {
  let state = seed
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296 }
}

function layoutObstacles(layout: Pick<GardenLayout, 'paths' | 'features'>): GardenRect[] {
  const corridors = layout.paths.flatMap(path => Array.from({ length: 65 }, (_, index) => {
    const point = sampleGardenCurve(path.curve, index / 64)
    const extent = path.width / 2 + 8
    return { left: point.x - extent, right: point.x + extent, top: point.y - extent, bottom: point.y + extent }
  }))
  const water: GardenRect[] = [
    ...layout.features.ponds.map(pond => ({ left: pond.x - pond.rx - 18, right: pond.x + pond.rx + 18, top: pond.y - pond.ry - 18, bottom: pond.y + pond.ry + 18 })),
    ...layout.features.stream.slice(1).map((point, index) => ({ left: Math.min(point.x, layout.features.stream[index]!.x) - 26, right: Math.max(point.x, layout.features.stream[index]!.x) + 26,
      top: layout.features.stream[index]!.y - 12, bottom: point.y + 12 }))
  ]
  return [...corridors, ...water]
}

function canonicalPositions(garden: GardenId, obstacles: GardenRect[]): GardenPoint[] {
  const rand = random(seeds[garden])
  // Filter geography once, then restart the packing instead of trapping the final
  // slots behind the choices made for the first few monuments.
  const candidates = Array.from({ length: 3000 }, () => {
    const point = { x: 148 + rand() * 902, y: 150 + rand() * 680 }
    return { point, bounds: gardenPlaceBounds(point) }
  }).filter(candidate => !obstacles.some(obstacle => gardenRectsIntersect(candidate.bounds, obstacle, 5)))
  if (candidates.length) {
    for (let restart = 0; restart < 1000; restart++) {
      const select = random(seeds[garden] + restart * 7919)
      const positions: typeof candidates = []
      for (let attempt = 0; attempt < candidates.length; attempt++) {
        const candidate = candidates[Math.floor(select() * candidates.length)]!
        if (positions.some(other => gardenRectsIntersect(candidate.bounds, other.bounds, 12))) continue
        positions.push(candidate)
        if (positions.length === gardenCapacity[garden]) return positions.map(position => position.point)
      }
    }
  }
  throw new Error(`Garden layout ${garden} cannot fit its permanent chunks`)
}

function createCanonical(garden: GardenId): GardenLayout {
  const paths = getGardenRoutePaths(garden)
  const ponds = garden === 'lake' ? [{ x: 865, y: 212, rx: 194, ry: 92 }, { x: 925, y: 813, rx: 143, ry: 82 }] : []
  const stream = garden === 'hill' ? Array.from({ length: 25 }, (_, index) => {
    const t = index / 24
    return { x: 145 + Math.sin(t * 8.3 + 0.3) * 40 + Math.sin(t * 17) * 7, y: t * world.height }
  }) : []
  // Permanent chunks fit around geology and routes before any session variation.
  const obstacles = layoutObstacles({ paths, features: { ponds, stream } })
  const chunks = canonicalPositions(garden, obstacles).map((position, index): GardenLayoutChunk => {
    const place = index + 1
    const id = `${garden}:v${gardenLayoutVersion}:place-${place}`
    return { ...position, id, chunkId: id, place, protectedBounds: gardenPlaceBounds(position),
      bounds: { left: Math.max(60, position.x - 108), right: Math.min(world.width - 60, position.x + 108),
        top: Math.max(74, position.y - 98), bottom: Math.min(world.height - 74, position.y + 114) } }
  })
  return { version: gardenLayoutVersion, seed: seeds[garden], frame: { inset: 60 }, chunks,
    places: chunks.map(({ place, x, y, chunkId }) => ({ place, x, y, chunkId })), paths, features: { ponds, stream } }
}

function createSessionLayout(canonical: GardenLayout, seed: number): GardenLayout {
  const scenerySeed = (canonical.seed + Math.imul(seed, 2654435761)) >>> 0
  const obstacles = layoutObstacles(canonical)
  const chunks: GardenLayoutChunk[] = []
  for (const anchor of canonical.chunks) {
    const rand = random(scenerySeed + anchor.place * 7919)
    let position: GardenPoint = anchor
    for (let attempt = 0; seed !== 0 && attempt < 40; attempt++) {
      const point = { x: anchor.x + (rand() - 0.5) * 56, y: anchor.y + (rand() - 0.5) * 56 }
      const rect = gardenPlaceBounds(point)
      if (rect.left < anchor.bounds.left || rect.right > anchor.bounds.right
        || rect.top < anchor.bounds.top || rect.bottom > anchor.bounds.bottom) continue
      if (obstacles.some(obstacle => gardenRectsIntersect(rect, obstacle, 5))) continue
      // Reserving other anchors makes their original position a safe fallback.
      if (canonical.chunks.some(other => other.place !== anchor.place && gardenRectsIntersect(rect, other.protectedBounds, 12))) continue
      if (chunks.some(other => gardenRectsIntersect(rect, other.protectedBounds, 12))) continue
      position = point
      break
    }
    chunks.push({ ...anchor, ...position, protectedBounds: gardenPlaceBounds(position) })
  }
  return { ...canonical, seed: scenerySeed, chunks, places: chunks.map(({ place, x, y, chunkId }) => ({ place, x, y, chunkId })) }
}

// Only the in-chunk composition and scenery use the session seed. Chunk ownership,
// routes and geology survive a new session, cache rebuilds and record creation.
export function getGardenLayout(width: number, height: number, garden: GardenId): GardenLayout {
  const cacheKey = `${garden}:${sessionSeed}`
  let layout = cache.get(cacheKey)
  if (!layout) {
    let canonical = scaffolds.get(garden)
    if (!canonical) { canonical = createCanonical(garden); scaffolds.set(garden, canonical) }
    layout = createSessionLayout(canonical, sessionSeed)
    cache.set(cacheKey, layout)
  }
  const sx = width / world.width, sy = height / world.height
  const point = (value: GardenPoint) => ({ x: value.x * sx, y: value.y * sy })
  const rect = (value: GardenRect) => ({ left: value.left * sx, right: value.right * sx, top: value.top * sy, bottom: value.bottom * sy })
  return {
    version: layout.version, seed: layout.seed, frame: { inset: layout.frame.inset * Math.min(sx, sy) },
    chunks: layout.chunks.map(chunk => ({ ...chunk, ...point(chunk), bounds: rect(chunk.bounds), protectedBounds: rect(chunk.protectedBounds) })),
    places: layout.places.map(place => ({ ...place, ...point(place) })),
    paths: layout.paths.map(path => ({ ...path, width: path.width * Math.min(sx, sy), curve: path.curve.map(point) as GardenLayoutPath['curve'] })),
    features: { ponds: layout.features.ponds.map(pond => ({ ...point(pond), rx: pond.rx * sx, ry: pond.ry * sy })), stream: layout.features.stream.map(point) }
  }
}

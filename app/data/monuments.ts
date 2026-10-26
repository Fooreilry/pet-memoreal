import { gardenDemoPlaces, gardenIds } from '../../shared/gardens'
import type { GardenId } from '../../shared/gardens'

export const monumentKinds = ['arch', 'tablet', 'stele', 'boulder'] as const
export type MonumentKind = typeof monumentKinds[number]

// A place keeps its silhouette across reloads, layout changes and replacement of a demo.
export function getMonumentKind(gardenId: GardenId, place: number): MonumentKind {
  const demoIndex = gardenDemoPlaces[gardenId].indexOf(place)
  const index = (demoIndex >= 0 ? demoIndex : place - 1) + gardenIds.indexOf(gardenId)
  return monumentKinds[index % monumentKinds.length]!
}

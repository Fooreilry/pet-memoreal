import type { GardenId } from './demoGardens'
import { getGardenLayout } from './gardenLayout'
import type { PublicMemorial } from '../../shared/memorials'
import { gardenDemoPlaces } from '../../shared/gardens'

export function getDemoMemorials(gardenId: GardenId) {
  return gardenDemoPlaces[gardenId].map(place => {
    const index = place - 1
    return {
      source: 'demo' as const,
      id: `${gardenId}-${index + 1}`,
      gardenId,
      place,
      profile: index % 8,
      species: index % 2 === 0 ? 'dog' as const : 'cat' as const,
      born: 2011 + index % 5,
      died: 2023 + index % 3
    }
  })
}

export type DemoMemorial = ReturnType<typeof getDemoMemorials>[number]
export type GardenMemorial = DemoMemorial | PublicMemorial

// Shared by Pixi and the accessible HTML controls so hit targets follow the stones.
export function getMemorialLayout(width: number, height: number, gardenId: GardenId, saved: PublicMemorial[] = []) {
  const records = new Map(saved.filter(item => item.gardenId === gardenId).map(item => [item.place, item]))
  const demos = new Map(getDemoMemorials(gardenId).map(item => [item.place, item]))
  const layout = getGardenLayout(width, height, gardenId)
  // Legacy scenery consumers can still read these metrics while the positions are
  // sourced from versioned chunks rather than an evenly spaced visual grid.
  const rows = Math.ceil(Math.sqrt(layout.places.length))
  const cellH = (height - 200) / rows
  return {
    rows,
    cellH,
    chunks: layout.chunks,
    places: layout.places.map(place => ({ ...place, memorial: (records.get(place.place) ?? demos.get(place.place)) as GardenMemorial | undefined }))
  }
}

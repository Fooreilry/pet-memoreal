import { findDemoGarden } from './demoGardens'
import type { GardenId } from './demoGardens'
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
      species: index % 2 === 0 ? 'dog' : 'cat',
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
  const count = findDemoGarden(gardenId)!.count
  const columns = width < 800 ? 3 : 4
  const rows = Math.ceil(count / columns)
  const cellW = (width - 140) / columns
  const cellH = (height - 200) / rows
  return {
    rows,
    cellH,
    places: Array.from({ length: count }, (_, index) => ({
      place: index + 1,
      memorial: (records.get(index + 1) ?? demos.get(index + 1)) as GardenMemorial | undefined,
      x: 70 + (index % columns + 0.5) * cellW
        + (gardenId === 'meadow' ? Math.sin(Math.floor(index / columns) * 2) * cellW * 0.12 : 0)
        + (gardenId === 'grove' ? (Math.floor(index / columns) % 2 ? 1 : -1) * cellW * 0.06 : 0),
      y: 78 + (Math.floor(index / columns) + 0.5) * cellH
        + (gardenId === 'meadow' ? Math.sin(index % columns * 1.8) * 14 : 0)
        + (gardenId === 'hill' ? (index % columns / (columns - 1) - 0.5) * 28 : 0)
    }))
  }
}

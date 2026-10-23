export const gardenIds = ['meadow', 'lake', 'grove', 'hill'] as const
export type GardenId = typeof gardenIds[number]
export const gardenCapacity: Record<GardenId, number> = { meadow: 12, lake: 10, grove: 16, hill: 14 }
export const gardenDemoPlaces: Record<GardenId, readonly number[]> = {
  meadow: [1, 2, 6, 12], lake: [1, 2, 5, 10], grove: [1, 2, 8, 16], hill: [1, 2, 7, 14]
}

export function isCreatablePlace(gardenId: GardenId, place: number) {
  return Number.isInteger(place) && place >= 1 && place <= gardenCapacity[gardenId] && !gardenDemoPlaces[gardenId].includes(place)
}

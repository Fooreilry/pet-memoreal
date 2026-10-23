export const demoGardens = [
  { id: 'meadow', color: 0x6c8863, accent: 0xeac47a, count: 12 },
  { id: 'lake', color: 0x4b7777, accent: 0xa3cece, count: 10 },
  { id: 'grove', color: 0x42684e, accent: 0xb6c895, count: 16 },
  { id: 'hill', color: 0x8a8963, accent: 0xead3a1, count: 14 }
] as const

export type GardenId = typeof demoGardens[number]['id']

export function findDemoGarden(id: unknown) {
  return demoGardens.find(garden => garden.id === id)
}

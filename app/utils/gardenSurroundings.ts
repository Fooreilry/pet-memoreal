import type { Graphics } from 'pixi.js'
import type { GardenId } from '../data/demoGardens'
import { getGardenSurroundings } from '../data/gardenSurroundings'
import type { GardenView } from './gardenProjection'
import { drawFlowers, drawGrassTuft, drawShrub, drawTree, drawWoodlandTree } from './gardenDecor'
import { drawGardenPlant } from './gardenBotany'
import { drawContinuousGardenGround } from './gardenContinuousGround'
import { drawHillRock } from './hillScenery'

export function drawGardenSurroundings(g: Graphics, bounds: GardenView, garden: GardenId, seed: number, extraObstacles: GardenView[] = []) {
  const plan = getGardenSurroundings(bounds, garden, seed, extraObstacles)
  drawContinuousGardenGround(g, bounds, garden, seed, extraObstacles)
  for (const plant of [...plan.plants].sort((a, b) => a.y - b.y)) {
    const { x, y, size } = plant
    if (plant.kind === 'tree') {
      if (garden === 'lake') drawTree(g, x, y, size, 0x5d8d72, plant.seed)
      else drawWoodlandTree(g, x, y, size, plant.seed)
    }
    else if (plant.kind === 'shrub') drawShrub(g, plant)
    else if (plant.kind === 'grass') drawGrassTuft(g, x, y, size, plant.seed)
    else if (plant.kind === 'flowers') drawFlowers(g, x, y, [0xe9e2c5, 0xdec0b4, 0xc6bed5][plant.seed % 3]!, plant.seed, 5)
    else if (plant.kind === 'fern') drawGardenPlant(g, { ...plant, kind: 'fern' })
    else drawHillRock(g, { ...plant, kind: (['boulder', 'slab', 'spire', 'cluster'] as const)[plant.seed % 4]! })
  }
  return plan.plants.length
}

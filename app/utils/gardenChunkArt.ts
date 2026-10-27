import type { Graphics } from 'pixi.js'
import type { GardenId } from '../data/demoGardens'
import { getGardenLayout } from '../data/gardenLayout'
import { getMeadowSceneryLayout } from '../data/meadowScenery'
import { getGroveSceneryLayout } from '../data/groveScenery'
import { getHillSceneryLayout } from '../data/hillScenery'
import { getLakeSceneryLayout } from '../data/lakeScenery'
import { getGardenPlantLayout } from '../data/gardenPlants'
import { drawMeadowDecor } from './meadowScenery'
import { drawGroveDecor } from './groveScenery'
import { drawHillDecor } from './hillScenery'
import { drawLakeDecor } from './lakeScenery'
import { drawGardenPlant } from './gardenBotany'
import { getGardenFrameLayout } from '../data/gardenFrame'

type Prop = { x: number, y: number, chunkId?: string }

export function createGardenChunkArt(width: number, height: number, garden: GardenId) {
  const { chunks } = getGardenLayout(width, height, garden)
  const owners = new WeakMap<Prop, string>()
  function owner(prop: Prop) {
    if (prop.chunkId) return prop.chunkId
    let result = owners.get(prop)
    if (!result) {
      result = chunks.reduce((closest, chunk) => Math.hypot(prop.x - chunk.x, prop.y - chunk.y)
        < Math.hypot(prop.x - closest.x, prop.y - closest.y) ? chunk : closest).id
      owners.set(prop, result)
    }
    return result
  }
  const accents = getGardenPlantLayout(width, height, garden)
  const meadow = garden === 'meadow' ? getMeadowSceneryLayout(width, height) : undefined
  const grove = garden === 'grove' ? getGroveSceneryLayout(width, height) : undefined
  const hill = garden === 'hill' ? getHillSceneryLayout(width, height) : undefined
  const lake = garden === 'lake' ? getLakeSceneryLayout(width, height) : undefined
  const group = <T extends Prop>(props: T[], id: string) => props.filter(prop => owner(prop) === id)
  return (g: Graphics, id: string) => {
    if (meadow) drawMeadowDecor(g, { ...meadow, flowers: group(meadow.flowers, id), grass: group(meadow.grass, id),
      clover: group(meadow.clover, id), shrubs: group(meadow.shrubs, id), lanterns: group(meadow.lanterns, id) })
    if (grove) drawGroveDecor(g, { ...grove, trees: group(grove.trees, id), shrubs: group(grove.shrubs, id),
      grass: group(grove.grass, id), flowers: group(grove.flowers, id), leaves: group(grove.leaves, id), lanterns: group(grove.lanterns, id) })
    if (hill) drawHillDecor(g, { ...hill, rocks: group(hill.rocks, id), shrubs: group(hill.shrubs, id) })
    if (lake) drawLakeDecor(g, { ...lake, reeds: group(lake.reeds, id), pebbles: group(lake.pebbles, id),
      shrubs: group(lake.shrubs, id), trees: group(lake.trees, id), lanterns: group(lake.lanterns, id) })
    for (const plant of group(accents, id)) drawGardenPlant(g, plant)
  }
}

export function drawGardenFrame(g: Graphics, width: number, height: number, garden: GardenId) {
  const { patches, details } = getGardenFrameLayout(width, height, garden)
  if (!patches.length) return
  const palette = {
    meadow: { bank: 0x5c8555, light: 0x89a775, fleck: 0xe3d5ae },
    lake: { bank: 0x467a64, light: 0x729b79, fleck: 0xaaa88a },
    grove: { bank: 0x3c6445, light: 0x64825a, fleck: 0xa58c58 },
    hill: { bank: 0x5a825b, light: 0x8a9f70, fleck: 0x9fa68b }
  }[garden]
  // Low-contrast turf stains dissolve beneath the existing edge planting.
  for (const patch of patches) {
    const { x, y, rx, ry } = patch
    g.moveTo(x - rx * 0.95, y)
      .bezierCurveTo(x - rx * 0.85, y - ry * 0.55, x - rx * 0.68, y - ry * 0.62, x - rx * 0.4, y - ry * 0.58)
      .bezierCurveTo(x - rx * 0.32, y - ry, x + rx * 0.12, y - ry * 0.78, x + rx * 0.23, y - ry * 0.42)
      .bezierCurveTo(x + rx * 0.67, y - ry * 0.7, x + rx, y - ry * 0.22, x + rx * 0.85, y + ry * 0.1)
      .bezierCurveTo(x + rx, y + ry * 0.54, x + rx * 0.64, y + ry * 0.7, x + rx * 0.35, y + ry * 0.59)
      .bezierCurveTo(x - rx * 0.04, y + ry * 0.94, x - rx * 0.4, y + ry * 0.78, x - rx * 0.48, y + ry * 0.4)
      .bezierCurveTo(x - rx * 0.8, y + ry * 0.58, x - rx, y + ry * 0.42, x - rx * 0.95, y).closePath()
  }
  g.fill({ color: palette.bank, alpha: 0.2 })
  for (const patch of patches) {
    const { x, y, rx, ry, light } = patch
    for (const side of [-1, 1]) {
      const px = x + rx * 0.25 * side, py = y + ry * 0.1 * side
      g.moveTo(px - rx * 0.13, py + ry * 0.1)
        .quadraticCurveTo(px - rx * 0.1, py - ry * 0.3 * light, px + rx * 0.16, py - ry * 0.18)
        .quadraticCurveTo(px + rx * 0.02, py + ry * 0.15, px - rx * 0.13, py + ry * 0.1).closePath()
    }
  }
  g.fill({ color: palette.light, alpha: 0.18 })
  for (const detail of details) {
    if (garden === 'grove') {
      const dx = Math.cos(detail.angle) * detail.size, dy = Math.sin(detail.angle) * detail.size
      g.moveTo(detail.x - dx, detail.y - dy).quadraticCurveTo(detail.x + dy, detail.y - dx, detail.x + dx, detail.y + dy)
        .quadraticCurveTo(detail.x - dy, detail.y + dx, detail.x - dx, detail.y - dy).closePath()
    } else if (garden === 'meadow') {
      g.circle(detail.x, detail.y, detail.size * 0.5).circle(detail.x + detail.size * 0.8, detail.y + detail.size * 0.2, detail.size * 0.3)
    } else {
      g.ellipse(detail.x, detail.y, detail.size, detail.size * (garden === 'hill' ? 0.62 : 0.4))
    }
  }
  if (details.length) g.fill({ color: palette.fleck, alpha: garden === 'meadow' ? 0.3 : 0.25 })
}

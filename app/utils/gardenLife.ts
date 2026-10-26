import { Graphics } from 'pixi.js'
import type { Container } from 'pixi.js'
import type { GardenId } from '../data/demoGardens'
import { getMemorialLayout } from '../data/demoMemorials'
import { drawGrassTuft, drawLeaf } from './gardenDecor'
import { createLakeAmbience } from './lakeAmbience'
import { createMeadowAmbience } from './meadowAmbience'

function fallingLeaves(parent: Container, width: number, height: number) {
  const leaves = Array.from({ length: 7 }, (_, index) => {
    const leaf = new Graphics()
    drawLeaf(leaf, 6 + index % 3, [0xbac68e, 0x8eae7c, 0xc5b77b][index % 3]!)
    parent.addChild(leaf)
    return { leaf, x: 64 + (index + 0.5) * (width - 128) / 7, phase: (index + 0.5) / 7, duration: 54 + index % 3 * 9 }
  })
  return (time: number) => {
    for (const { leaf, x, phase, duration } of leaves) {
      const progress = (time / duration + phase) % 1
      const drift = time * 0.42 + phase * Math.PI * 2
      leaf.position.set(x + Math.sin(drift) * 21, 30 + progress * (height - 60))
      leaf.rotation = 0.4 + Math.sin(drift * 0.8) * 0.65
      leaf.scale.x = 0.7 + Math.sin(drift) * 0.25
      // Fade before wrapping so a leaf never jumps from the ground to a canopy.
      leaf.alpha = Math.min(1, progress / 0.12, (1 - progress) / 0.12) * 0.65
    }
  }
}

function windblownGrass(parent: Container, width: number, height: number) {
  const { rows, cellH } = getMemorialLayout(width, height, 'hill')
  const columns = width < 800 ? 3 : 4
  const tufts: { grass: Graphics, phase: number }[] = []
  function tuft(x: number, y: number, index: number) {
    const grass = new Graphics()
    const bladeHeight = 20 + index % 4 * 3
    drawGrassTuft(grass, 0, 0, bladeHeight, index)
    grass.position.set(x, y)
    parent.addChild(grass)
    tufts.push({ grass, phase: x / width * 3 + y / height })
  }
  // Terrace rims and outer edges leave stones, names and steps clear.
  for (let row = 0; row < rows; row++) {
    for (let column = 1; column < columns; column++) {
      const x = 70 + column * (width - 140) / columns
      const y = 78 + (row + 0.5) * cellH + 72 - 15 + 30 * x / width
      tuft(x, y, row * 5 + column)
    }
  }
  for (let index = 0; index < 6; index++) tuft(index % 2 ? 30 : width - 30, 105 + index * (height - 190) / 5, index)
  for (let index = 0; index < 7; index++) tuft(90 + index * (width - 180) / 6, height - 27, index)
  return (time: number) => {
    for (const { grass, phase } of tufts) {
      // Shear around the roots: the blades bend while their bases stay planted.
      grass.skew.x = 0.04 + Math.sin(time * 0.65 - phase) * 0.09 + Math.sin(time * 0.31 - phase) * 0.025
    }
  }
}

// All geometry is allocated once; the shared scene ticker only changes transforms.
export function createGardenLife(parent: Container, gardenId: GardenId | undefined, width: number, height: number) {
  if (gardenId === 'meadow') return createMeadowAmbience(parent, width, height)
  if (gardenId === 'lake') return createLakeAmbience(parent, width, height)
  if (gardenId === 'grove') return fallingLeaves(parent, width, height)
  if (gardenId === 'hill') return windblownGrass(parent, width, height)
  return undefined
}

import { Container, Graphics } from 'pixi.js'
import type { GardenId } from '../data/demoGardens'
import { getMemorialLayout } from '../data/demoMemorials'

function butterflies(parent: Container, width: number, height: number) {
  const { cellH } = getMemorialLayout(width, height, 'meadow')
  const positions: [number, number][] = [[width * 0.22, 62], [width * 0.36, 78 + cellH], [width * 0.73, 78 + cellH * 2], [width * 0.62, height - 44]]
  const insects = positions.map(([x, y], index) => {
    const insect = new Container()
    const wings = new Graphics()
    for (const side of [-1, 1]) {
      wings.moveTo(0, 0).bezierCurveTo(side * 4, -11, side * 12, -9, side * 8, -1).quadraticCurveTo(side * 5, 4, 0, 1).fill(index % 2 ? 0xe0c6b1 : 0xf0dfb5)
      wings.moveTo(0, 1).quadraticCurveTo(side * 10, 0, side * 5, 7).quadraticCurveTo(side, 9, 0, 1).fill(0xb8bd98)
      wings.circle(side * 6, -4, 1.2).fill({ color: 0x7e8768, alpha: 0.5 })
    }
    insect.addChild(wings)
    insect.addChild(new Graphics().moveTo(0, -4).lineTo(0, 5).stroke({ color: 0x485c46, width: 1.5 }))
    insect.alpha = 0.85
    parent.addChild(insect)
    return { insect, wings, x, y, phase: index * 1.9 }
  })
  return (time: number) => {
    for (const { insect, wings, x, y, phase } of insects) {
      insect.position.set(x + Math.sin(time * 0.24 + phase) * 23, y + Math.sin(time * 0.37 + phase) * 10)
      insect.rotation = Math.sin(time * 0.3 + phase) * 0.22
      wings.scale.x = 0.45 + (Math.sin(time * 2.8 + phase) + 1) * 0.275
    }
  }
}

function fallingLeaves(parent: Container, width: number, height: number) {
  const leaves = Array.from({ length: 7 }, (_, index) => {
    const leaf = new Graphics()
      .moveTo(0, -7).quadraticCurveTo(9, -1, 0, 7).quadraticCurveTo(-7, 1, 0, -7)
      .fill([0xc2b478, 0x9eac7c, 0xc09c6b][index % 3]!)
      .moveTo(0, -4).lineTo(0, 9).stroke({ color: 0xd7c79a, width: 0.8, alpha: 0.5 })
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
    const bladeHeight = 23 + index % 4 * 4
    for (let blade = 0; blade < 5; blade++) {
      const spread = (blade - 2) * 3
      const tip = -bladeHeight + Math.abs(blade - 2) * 4
      grass.moveTo(spread * 0.4, 0).quadraticCurveTo(spread, tip * 0.55, spread * 1.7 + 2, tip)
        .stroke({ color: blade % 2 ? 0xd1c69a : 0xa9b78a, width: blade === 2 ? 1.8 : 1.2, alpha: 0.8 })
    }
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
  if (gardenId === 'meadow') return butterflies(parent, width, height)
  if (gardenId === 'grove') return fallingLeaves(parent, width, height)
  if (gardenId === 'hill') return windblownGrass(parent, width, height)
  return undefined
}

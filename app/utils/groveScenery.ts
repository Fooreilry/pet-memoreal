import type { Graphics } from 'pixi.js'
import { getGroveSceneryLayout } from '../data/groveScenery'
import { getMemorialLayout } from '../data/demoMemorials'
import { drawFlowers, drawGrassTuft, drawLantern, drawLeaf, drawShrub, drawWoodlandTree } from './gardenDecor'

export function drawGroveLandscape(g: Graphics, width: number, height: number, preview: boolean) {
  const artHeight = preview ? height - 99 : height
  const decor = getGroveSceneryLayout(width, height, preview)
  // Broad soft pools of light are painted once, without blurred filters or shaders.
  for (const [x, y, size] of [[0.32, 0.2, 0.19], [0.68, 0.55, 0.24], [0.4, 0.85, 0.17]]) {
    g.ellipse(width * x!, artHeight * y!, width * size!, artHeight * 0.11).fill({ color: 0xa8c28c, alpha: 0.045 })
    g.ellipse(width * x!, artHeight * y!, width * size! * 0.65, artHeight * 0.065).fill({ color: 0xc8d9a8, alpha: 0.035 })
  }
  if (preview) {
    g.moveTo(width * 0.52, artHeight + 8).bezierCurveTo(width * 0.33, artHeight * 0.66, width * 0.65, artHeight * 0.43, width * 0.48, 18)
      .stroke({ color: 0x93a47d, width: 15, alpha: 0.45 })
    g.ellipse(width * 0.5, artHeight * 0.52, width * 0.24, artHeight * 0.25).fill({ color: 0x8ea17a, alpha: 0.1 })
  } else {
    const { places } = getMemorialLayout(width, height, 'grove')
    for (const { x, y } of places) {
      g.ellipse(x, y + 8, 57, 39).fill({ color: 0x7f9a6c, alpha: 0.16 })
      g.ellipse(x - 8, y + 7, 42, 26).fill({ color: 0xa8b986, alpha: 0.06 })
    }
    for (const side of [0, 1]) {
      const x = side ? width - 76 : 76
      g.moveTo(x, 28).bezierCurveTo(x + (side ? -9 : 9), height * 0.33, x + (side ? 8 : -8), height * 0.7, x, height - 22)
        .stroke({ color: 0x9cab88, width: 13, alpha: 0.18 })
      for (let index = 0; index < 12; index++) {
        g.ellipse(x + Math.sin(index * 2) * 5, 76 + index * (height - 140) / 11, 5, 2.7).fill({ color: 0xb1b99b, alpha: 0.35 })
      }
    }
    g.moveTo(width * 0.27, 20).quadraticCurveTo(width * 0.5, 60, width * 0.73, 20).stroke({ color: 0xa2a380, width: 1.2, alpha: 0.6 })
  }
  // Ground litter, plants and tree canopies stay in the same cached ground layer.
  for (const leaf of decor.leaves) {
    // Pixi rotates the current translation, so place the leaf after its local rotation.
    g.context.save().rotate(leaf.seed * 2.4).translate(leaf.x, leaf.y)
    drawLeaf(g, leaf.size, [0x8ba16d, 0xa8ae75, 0xb5a777][leaf.seed % 3]!)
    g.context.restore()
  }
  for (const plant of decor.grass) drawGrassTuft(g, plant.x, plant.y, plant.size, plant.seed)
  for (const plant of decor.flowers) drawFlowers(g, plant.x, plant.y, 0xe2dcb1, plant.seed, 3)
  for (const plant of decor.shrubs) drawShrub(g, plant)
  for (const plant of decor.trees) drawWoodlandTree(g, plant.x, plant.y, plant.size, plant.seed)
  for (const lantern of decor.lanterns) drawLantern(g, lantern.x, lantern.y, lantern.hanging)
}

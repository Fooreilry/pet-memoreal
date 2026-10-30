import { Container, Graphics } from 'pixi.js'
import type { GardenId } from '../data/demoGardens'
import { getMonumentKind } from '../data/monuments'
import { getGardenLayout } from '../data/gardenLayout'
import { createMonumentArt } from './monumentArt'
import { drawGrassTuft, drawLantern, drawLeaf, drawShrub, drawWoodlandTree } from './gardenDecor'
import { drawGardenPlant } from './gardenBotany'
import { drawHillRock } from './hillScenery'

export type MemorialSceneLayout = {
  visual: { left: number, top: number, width: number, height: number }
  monument: { x: number, y: number, scale: number }
}

type GroundContact = { kind: 'tree' | 'shrub' | 'rock' | 'flower' | 'herb', node: Graphics, x: number, y: number, size: number }

const palettes = {
  meadow: { sky: 0x40645b, horizon: 0xb9bd95, distant: 0x7f9a78, middle: 0x668a68, ground: 0x386447, flower: 0xead9b6 },
  lake: { sky: 0x284c55, horizon: 0x92b3b0, distant: 0x496f69, middle: 0x426f65, ground: 0x294e45, flower: 0xd5dcca },
  grove: { sky: 0x142f2e, horizon: 0x6d8d70, distant: 0x385f48, middle: 0x2c523f, ground: 0x1c3e31, flower: 0xd9cda5 },
  hill: { sky: 0x486b68, horizon: 0xa9bca9, distant: 0x6d917a, middle: 0x577e61, ground: 0x315c43, flower: 0xe0dfc1 }
} as const

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }

export function getMemorialSceneLayout(width: number, height: number): MemorialSceneLayout {
  const w = Math.max(1, Number.isFinite(width) ? width : 1)
  const h = Math.max(1, Number.isFinite(height) ? height : 1)
  const left = w >= 760 ? clamp(w * .34, 320, 440) : 0
  const visualHeight = w >= 760 ? h : Math.min(h, clamp(h * .42, 180, 340))
  const visual = { left, top: 0, width: Math.max(1, w - left), height: visualHeight }
  const scale = Math.max(.01, Math.min(4.4, visual.width / 172, Math.max(1, visual.height - 86) / 85))
  return {
    visual,
    monument: {
      x: visual.left + visual.width * .52,
      y: Math.min(visual.height - 40 * scale, Math.max(visual.height * (w >= 760 ? .8 : .88) - 32 * scale, 76 + 45 * scale)),
      scale
    }
  }
}

function blend(first: number, second: number, amount: number) {
  const channel = (shift: number) => Math.round(((first >> shift) & 255) * (1 - amount) + ((second >> shift) & 255) * amount)
  return channel(16) << 16 | channel(8) << 8 | channel(0)
}

function hill(g: Graphics, left: number, width: number, height: number, y: number, amplitude: number, color: number, phase: number) {
  g.moveTo(left - width * .15, height)
    .lineTo(left - width * .15, y + amplitude * .25)
    .bezierCurveTo(left + width * .15, y - amplitude, left + width * .35, y + amplitude * .5, left + width * .6, y - amplitude * .2)
    .bezierCurveTo(left + width * .77, y - amplitude * phase, left + width * .92, y + amplitude * .5, left + width * 1.15, y - amplitude * .4)
    .lineTo(left + width * 1.15, height).closePath().fill(color)
}

type MovingDetail = { node: Container, x: number, y: number, phase: number, kind: 'leaf' | 'grass' | 'light' | 'wing' | 'ripple' }

/** Eye-level scenery for the selected memorial. The caller owns rendering and time. */
export function createGardenMemorialScene(width: number, height: number, gardenId: GardenId, place: number) {
  const w = Math.max(1, Number.isFinite(width) ? width : 1)
  const h = Math.max(1, Number.isFinite(height) ? height : 1)
  const layout = getMemorialSceneLayout(w, h)
  const { visual, monument: target } = layout
  const { left: x, width: vw, height: vh } = visual
  const palette = palettes[gardenId]
  const contacts: GroundContact[] = []
  const root = new Container({ label: 'memorial-detail-scene' })
  root.eventMode = 'none'
  const background = new Container({ label: 'memorial-scenery' })
  background.eventMode = 'none'
  const ground = new Graphics({ label: 'memorial-landscape' })
  background.addChild(ground)
  root.addChild(background)

  ground.rect(0, 0, w, h).fill(palette.ground)
  // One-colour-step sky bands are cached once. Unlike the former 22px bands,
  // they cannot read as horizontal stripes and require no DOM gradient canvas.
  const skyHeight = vh * .59
  for (let band = 0; band < 256; band++) {
    ground.rect(0, band * skyHeight / 256, w, skyHeight / 256 + .5).fill(blend(palette.sky, palette.horizon, band / 255))
  }
  if (gardenId === 'meadow') {
    const sunX = x + vw * .72, sunY = vh * .23
    for (let layer = 5; layer > 0; layer--) ground.circle(sunX, sunY, vh * (.052 + layer * .012)).fill({ color: 0xf7dfad, alpha: .03 + (5 - layer) * .014 })
    ground.circle(sunX, sunY, vh * .046).fill({ color: 0xf9e6b4, alpha: .82 })
  }
  hill(ground, x, vw, h, vh * .43, vh * .1, palette.distant, .9)
  hill(ground, x, vw, h, vh * .51, vh * .065, palette.middle, 1.4)

  // A joined treeline grows out of the distant bank rather than floating as
  // separate triangle icons over the sky.
  if (gardenId === 'lake' || gardenId === 'grove') {
    ground.moveTo(x - vw * .1, vh * .53)
    for (let index = 0; index < 18; index++) {
      const xx = x + vw * (index / 17 * 1.2 - .1)
      const base = vh * (.455 + Math.sin(index * 1.6) * .012)
      const size = vh * (.025 + index % 3 * .009)
      ground.lineTo(xx - size * .6, base).lineTo(xx, base - size * 1.6).lineTo(xx + size * .6, base)
    }
    ground.lineTo(x + vw * 1.1, vh * .64).lineTo(x - vw * .1, vh * .64).closePath().fill({ color: 0x355b4e, alpha: .72 })
  }

  let atmosphereView = { x: -10000, y: -10000, scale: 1 }
  if (gardenId === 'lake') {
    const pond = getGardenLayout(1200, 1000, 'lake').features.ponds[0]!
    const waterScale = Math.min(vw * .6 / pond.rx, vh * .09 / pond.ry)
    const cx = x + vw * .58, cy = vh * .515
    const rx = pond.rx * waterScale, ry = pond.ry * waterScale
    atmosphereView = { x: cx - pond.x * waterScale, y: cy - pond.y * waterScale, scale: waterScale }
    // Water stretches to both edges of the view, with a distant bank and a
    // gently sloping near shore. It is a lake behind the stone, not an oval bowl.
    ground.moveTo(x - vw * .15, vh * .46)
      .bezierCurveTo(x + vw * .2, vh * .425, x + vw * .7, vh * .45, x + vw * 1.15, vh * .435)
      .lineTo(x + vw * 1.15, vh * .65)
      .bezierCurveTo(x + vw * .7, vh * .635, x + vw * .3, vh * .61, x - vw * .15, vh * .65)
      .closePath().fill(0x477b7c)
    for (let band = 0; band < 36; band++) {
      const yy = vh * (.47 + band / 36 * .14)
      ground.rect(x, yy, vw, vh * .14 / 36 + .5).fill({ color: blend(0x739995, 0x4e7e78, band / 35), alpha: .27 })
    }
    for (let index = 0; index < 6; index++) {
      const yy = cy + (index / 5 - .5) * ry * 1.3
      ground.moveTo(cx - rx * (.2 + index % 3 * .1), yy)
        .quadraticCurveTo(cx, yy + 2, cx + rx * (.25 + index % 2 * .12), yy - 1)
        .stroke({ color: 0xb9d1bc, width: 1.2, alpha: .25 })
    }
    for (let index = 0; index < 3; index++) {
      const px = cx + (index - 1) * rx * .33, py = cy + ry * (.2 + index % 2 * .25)
      ground.ellipse(px, py, Math.max(3, vw * .014), Math.max(2, vh * .007)).fill(0x9eaf78)
      ground.moveTo(px, py).lineTo(px + vw * .009, py - vh * .005).stroke({ color: 0x537e60, width: 1 })
    }
  }

  hill(ground, x, vw, h, vh * (gardenId === 'lake' ? .65 : .59), vh * .035, palette.ground, .6)
  // Perspective darkens towards the viewer; every near prop uses this same plane.
  for (let band = 0; band < 96; band++) {
    const yy = vh * (.67 + band / 96 * .33)
    ground.rect(0, yy, w, vh * .33 / 96 + .5).fill({ color: blend(palette.ground, 0x193e30, band / 95), alpha: .42 })
  }
  const groundY = target.y + target.scale * 32
  for (let layer = 12; layer >= 0; layer--) {
    ground.ellipse(target.x + target.scale * 3, groundY + target.scale * .5, target.scale * (43 + layer * 1.8), target.scale * (2 + layer * .42))
      .fill({ color: 0x112e25, alpha: .018 + (12 - layer) * .002 })
  }
  // A low, broken edge of earth ties the foundation into the clearing.
  ground.moveTo(target.x - target.scale * 41, groundY + target.scale * 2)
    .quadraticCurveTo(target.x, groundY + target.scale * 8, target.x + target.scale * 48, groundY + target.scale)
    .stroke({ color: 0x88926e, width: Math.max(1, target.scale), alpha: .34 })
  for (let index = 0; index < 26; index++) {
    const xx = x + (Math.sin(index * 19.7) * .5 + .5) * vw
    const yy = vh * (.68 + (index % 9) / 9 * .27)
    // Keep the immediate stone silhouette uncluttered, including its lantern.
    if (Math.abs(xx - target.x) < target.scale * 66 && Math.abs(yy - target.y) < target.scale * 44) continue
    ground.ellipse(xx, yy, 2 + index % 3, .8).fill({ color: index % 2 ? 0x92aa7c : 0x1c4738, alpha: .26 })
  }

  if (gardenId === 'grove') {
    const treeSize = Math.min(vw * .21, vh * .26)
    for (const [index, ratio] of [.04, .93, .2, .81].entries()) {
      const size = treeSize * (index < 2 ? 1 : .6)
      const px = x + vw * ratio, base = vh * (.7 - (index >= 2 ? .07 : 0) + index % 2 * .025)
      const tree = new Graphics({ label: 'memorial-rooted-tree' })
      // The shared tree helper's origin is its canopy centre, not its roots.
      drawWoodlandTree(tree, 0, -size * 1.12, size, 11 + index)
      tree.ellipse(size * .1, 1, size * .42, Math.max(2, size * .06)).fill({ color: 0x173b2d, alpha: .35 })
      drawGrassTuft(tree, -size * .18, 0, size * .13, index)
      tree.position.set(px, base)
      background.addChild(tree)
      contacts.push({ kind: 'tree', node: tree, x: px, y: base, size })
    }
    // The frame grows from the near trunks; the only lantern stands beside the stone.
    ground.moveTo(x - 20, vh * .07).bezierCurveTo(x + vw * .16, vh * .15, x + vw * .2, vh * .1, x + vw * .33, vh * .19)
      .stroke({ color: 0x243f31, width: Math.max(5, vh * .013) })
  }

  for (const [index, ratio] of [.035, .96, .13, .84].entries()) {
    const xx = x + vw * ratio
    const yy = vh * (.83 + index % 2 * .07)
    const size = Math.min(vw * .075, vh * .09) * (index < 2 ? 1 : .62)
    const rock = gardenId === 'hill' && index < 2
    const plant = new Graphics({ label: rock ? 'memorial-rooted-rock' : 'memorial-rooted-shrub' })
    // Rock/shrub helper origins are lifted by their known base offset.
    if (rock) drawHillRock(plant, { x: 0, y: -size * .5, size, kind: index ? 'slab' : 'boulder' })
    else drawShrub(plant, { x: 0, y: -size * .2, size, seed: 16 + index })
    plant.position.set(xx, yy)
    background.addChild(plant)
    contacts.push({ kind: rock ? 'rock' : 'shrub', node: plant, x: xx, y: yy, size })
    const herb = new Graphics({ label: 'memorial-rooted-herb' })
    drawGardenPlant(herb, { x: 0, y: 0, size: size * .65, seed: index, kind: gardenId === 'lake' ? 'sedge' : gardenId === 'grove' ? 'fern' : 'blossom' })
    herb.position.set(xx + (index % 2 ? -1 : 1) * size, yy + 5)
    background.addChild(herb)
    contacts.push({ kind: 'herb', node: herb, x: herb.x, y: herb.y, size: size * .65 })
  }
  // Rooted botany has one stem baseline; the map's random bouquet y offsets are
  // deliberately not enlarged into detached flowers in this close-up.
  for (const [index, ratio] of [.23, .79].entries()) {
    const flowers = new Graphics({ label: 'memorial-rooted-flower' })
    const size = Math.min(36, vh * .065)
    drawGardenPlant(flowers, { x: 0, y: 0, size, seed: index, kind: 'blossom' })
    flowers.position.set(x + vw * ratio, vh * .91)
    background.addChild(flowers)
    contacts.push({ kind: 'flower', node: flowers, x: flowers.x, y: flowers.y, size })
  }
  background.cacheAsTexture({ resolution: Math.min(2, 2048 / Math.max(w, h)), antialias: true })

  const ambience = new Container({ label: 'memorial-ambient-details' })
  ambience.eventMode = 'none'
  root.addChild(ambience)
  const moving: MovingDetail[] = []
  function addMoving(node: Container, px: number, py: number, kind: MovingDetail['kind'], phase: number) {
    node.position.set(px, py)
    node.eventMode = 'none'
    ambience.addChild(node)
    moving.push({ node, x: px, y: py, kind, phase })
  }

  if (gardenId === 'meadow') {
    for (let index = 0; index < 2; index++) {
      const butterfly = new Graphics()
      butterfly.ellipse(-4, -1, 4, 6).ellipse(4, -1, 4, 6).fill(index ? 0xd9c0bf : 0xe1d5a1)
      butterfly.ellipse(0, 1, 1, 4).fill(0x52674e)
      addMoving(butterfly, x + vw * (.18 + index * .62), vh * (.52 + index * .11), 'wing', index * 2.1)
    }
  } else if (gardenId === 'grove') {
    for (let index = 0; index < 5; index++) {
      const leaf = new Graphics()
      drawLeaf(leaf, clamp(vh * .009, 3, 7), index % 2 ? 0xcbb884 : 0xabc084)
      leaf.alpha = .6
      addMoving(leaf, x + vw * (.12 + index * .18), vh * .1, 'leaf', index * 1.7)
    }
  } else if (gardenId === 'lake') {
    for (let index = 0; index < 3; index++) {
      const ripple = new Graphics()
      ripple.ellipse(0, 0, vw * .025, Math.max(1.5, vh * .004)).stroke({ color: 0xc1d4c2, width: 1, alpha: .28 })
      addMoving(ripple, x + vw * (.32 + index * .23), vh * (.51 + index % 2 * .035), 'ripple', index * 2)
    }
  }
  for (let index = 0; index < 3; index++) {
    const grass = new Graphics()
    drawGrassTuft(grass, 0, 0, Math.min(44, vh * .085), index)
    addMoving(grass, x + vw * [ .07, .92, .77 ][index]!, vh * (.92 - index % 2 * .045), 'grass', index * 1.4)
  }
  if (gardenId === 'grove' || gardenId === 'hill') {
    for (let index = 0; index < 3; index++) {
      const light = new Graphics()
      light.circle(0, 0, 7).fill({ color: 0xe6c987, alpha: .06 }).circle(0, 0, 1.5).fill({ color: 0xf2daa2, alpha: .75 })
      addMoving(light, x + vw * (.15 + index * .33), vh * (.55 + index % 2 * .18), 'light', index * 2)
    }
  }

  const monument = new Container({ label: `memorial-monument-${getMonumentKind(gardenId, place)}` })
  monument.eventMode = 'none'
  monument.addChild(createMonumentArt()(getMonumentKind(gardenId, place)))
  const keepsakes = new Graphics({ label: 'memorial-keepsakes' })
  // Both the lantern's feet (+6 from its helper origin) and the flower stems
  // meet the stone's local foundation line at y32.
  drawLantern(keepsakes, 45, 26)
  drawGardenPlant(keepsakes, { x: -35, y: 32, size: 9, seed: place % 3, kind: 'blossom' })
  monument.addChild(keepsakes)
  monument.position.set(target.x, target.y)
  monument.scale.set(target.scale)
  root.addChild(monument)

  function update(seconds: number) {
    if (root.destroyed) return
    const time = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
    for (const item of moving) {
      const wave = Math.sin(time * .5 + item.phase)
      if (item.kind === 'leaf') {
        item.node.x = item.x + Math.sin(time * .4 + item.phase) * vw * .018
        item.node.y = vh * .1 + ((time * vh * .025 + item.phase * vh * .08) % (vh * .57))
        item.node.rotation = wave * .65
      } else if (item.kind === 'wing') {
        item.node.x = item.x + wave * vw * .015
        item.node.y = item.y + Math.cos(time * .6 + item.phase) * vh * .02
        item.node.scale.x = .35 + Math.abs(Math.sin(time * 3 + item.phase)) * .65
      } else if (item.kind === 'grass') item.node.skew.x = wave * .07
      else if (item.kind === 'ripple') {
        const progress = (time * .12 + item.phase) % 1
        item.node.scale.set(.6 + progress * .8)
        item.node.alpha = (1 - progress) * .7
      } else {
        item.node.x = item.x + wave * 8
        item.node.y = item.y + Math.cos(time * .4 + item.phase) * 6
        item.node.alpha = .4 + (wave + 1) * .25
      }
    }
  }
  update(0)
  return { root, monument, target, layout, atmosphereView, contacts, groundY, update, destroy: () => root.destroy({ children: true, context: true }) }
}

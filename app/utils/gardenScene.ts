import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { demoGardens } from '../data/demoGardens'
import type { GardenId } from '../data/demoGardens'
import { getMemorialLayout } from '../data/demoMemorials'
import { createGardenLife } from './gardenLife'
import { createMonumentArt } from './monumentArt'
import { getMonumentKind } from '../data/monuments'
import { drawHillLandscape, drawHillTerrain } from './hillScenery'
import { drawGroveLandscape, drawGroveTerrain } from './groveScenery'
import { drawLakeLandscape, drawLakeTerrain } from './lakeScenery'
import { drawMeadowLandscape, drawMeadowTerrain } from './meadowScenery'
import { drawGardenGround } from './gardenGround'
import { getGardenPlantLayout } from '../data/gardenPlants'
import { drawGardenPlant } from './gardenBotany'
import { drawFlowers as flowers, drawLantern as lantern } from './gardenDecor'
import type { PublicMemorial } from '../../shared/memorials'
import { createGardenChunkArt } from './gardenChunkArt'
import { gardenBoundsVisible } from './gardenProjection'
import type { GardenView } from './gardenProjection'

type Garden = typeof demoGardens[number]
type Translate = (key: string, values?: Record<string, string | number>) => string
const moods = {
  meadow: { ground: 0x477451, leaf: 0x80a16d, light: 0xe2d8a8, flower: 0xe5c4b5 },
  lake: { ground: 0x2e605a, leaf: 0x6d977b, light: 0xb0d8ca, flower: 0xdcd6c1 },
  grove: { ground: 0x305e4a, leaf: 0x5e8967, light: 0xe2ce9e, flower: 0xe5dcb6 },
  hill: { ground: 0x3d6b52, leaf: 0x71966b, light: 0xc7dbab, flower: 0xd5debc }
}

function label(parent: Container, text: string, x: number, y: number, size: number, color = 0xfaf5eb, serif = false) {
  const item = new Text({ text, style: { fontFamily: serif ? 'Georgia' : 'Segoe UI, sans-serif', fontSize: size, fill: color } })
  item.position.set(x, y)
  parent.addChild(item)
  return item
}

function random(seed: number) {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

function glow(g: Graphics, x: number, y: number, radius: number, color: number) {
  for (let i = 5; i > 0; i--) g.circle(x, y, radius * i / 5).fill({ color, alpha: 0.025 + (5 - i) * 0.009 })
}

function landscape(g: Graphics, garden: Garden, w: number, h: number, preview: boolean, terrainOnly = false) {
  const mood = moods[garden.id]
  // Selected gardens share the continuous world ground beneath this transparent feature layer.
  if (preview || !terrainOnly) {
    g.roundRect(0, 0, w, h, 28).fill(mood.ground)
    if (!(preview && garden.id === 'hill')) drawGardenGround(g, w, h, garden.id, preview)
  }
  if (garden.id === 'meadow') (terrainOnly ? drawMeadowTerrain : drawMeadowLandscape)(g, w, h, preview)
  else if (garden.id === 'grove') (terrainOnly ? drawGroveTerrain : drawGroveLandscape)(g, w, h, preview)
  else if (garden.id === 'hill') (terrainOnly ? drawHillTerrain : drawHillLandscape)(g, w, h, preview)
  else (terrainOnly ? drawLakeTerrain : drawLakeLandscape)(g, w, h, preview)
  if (!terrainOnly) for (const plant of getGardenPlantLayout(w, h, garden.id, preview)) drawGardenPlant(g, plant)
  if (preview) g.roundRect(8, 8, w - 16, h - 16, 24).stroke({ color: 0xd8d4ad, width: 1, alpha: 0.16 })
}

export function getGardenOverviewLayout(width: number, height: number) {
  const gap = 26
  const margin = 36
  const tileW = (width - margin * 2 - gap) / 2
  const tileH = (height - margin * 2 - gap) / 2
  return demoGardens.map((garden, index) => ({
    garden,
    x: margin + index % 2 * (tileW + gap),
    y: margin + Math.floor(index / 2) * (tileH + gap),
    width: tileW,
    height: tileH
  }))
}

export function createGardenScene(width: number, height: number, garden: Garden | undefined, t: Translate, onSelect: (id: GardenId) => void, saved: PublicMemorial[] = []) {
  const root = new Container()
  const staticArt = new Container()
  const chunks: { node: Container, bounds: GardenView }[] = []
  root.addChild(staticArt)
  if (!garden) staticArt.addChild(new Graphics().roundRect(0, 0, width, height, 28).fill(0x142e2e))
  if (!garden) {
    getGardenOverviewLayout(width, height).forEach(({ garden: item, x, y, width: tileW, height: tileH }, index) => {
      const tile = new Container()
      tile.position.set(x, y)
      tile.eventMode = 'static'
      tile.cursor = 'pointer'
      tile.hitArea = new Rectangle(0, 0, tileW, tileH)
      const art = new Graphics()
      landscape(art, item, tileW, tileH, true)
      art.roundRect(10, tileH - 99, tileW - 20, 89, 20).fill({ color: 0x142e2c, alpha: 0.92 })
      tile.addChild(art)
      label(tile, `0${index + 1}`, 23, 18, 18, 0xf5dfb2)
      label(tile, t(`garden.names.${item.id}`), 27, tileH - 87, 30, 0xfaf5eb, true)
      label(tile, t('garden.places', { count: item.count }), 27, tileH - 43, 18, 0xc9d5bf)
      const mask = new Graphics().roundRect(0, 0, tileW, tileH, 28).fill(0xffffff)
      tile.addChild(mask)
      tile.mask = mask
      // Cache artwork separately so the interactive border remains live when motion is paused.
      tile.cacheAsTexture({ resolution: 2, antialias: true })
      staticArt.addChild(tile)
      const border = new Graphics().roundRect(tile.x + 1, tile.y + 1, tileW - 2, tileH - 2, 28).stroke({ color: 0xefc681, width: 3 })
      border.eventMode = 'none'
      border.visible = false
      root.addChild(border)
      tile.on('pointerover', () => { border.visible = true })
      tile.on('pointerout', () => { border.visible = false })
      tile.on('pointertap', () => onSelect(item.id))
    })
  } else {
    const ground = new Graphics()
    landscape(ground, garden, width, height, false, true)
    const terrain = new Container()
    terrain.eventMode = 'none'
    terrain.addChild(ground)
    terrain.cacheAsTexture({ resolution: 2, antialias: true })
    staticArt.addChild(terrain)
    const mood = moods[garden.id]
    const monumentArt = createMonumentArt()
    const drawChunk = createGardenChunkArt(width, height, garden.id)
    for (const [index, { x, y, memorial, chunkId }] of getMemorialLayout(width, height, garden.id, saved).places.entries()) {
      const node = new Container({ label: chunkId })
      node.eventMode = 'none'
      const plants = new Graphics()
      drawChunk(plants, chunkId)
      node.addChild(plants)
      const marker = new Graphics()
      if (!memorial) {
        marker.ellipse(x, y + 15, 32, 12).fill({ color: 0x193e32, alpha: 0.22 })
        marker.circle(x, y - 4, 22).fill({ color: 0x183d32, alpha: 0.32 }).stroke({ color: 0xd6dfbc, width: 1.5, alpha: 0.6 })
        marker.moveTo(x - 7, y - 4).lineTo(x + 7, y - 4).moveTo(x, y - 11).lineTo(x, y + 3).stroke({ color: 0xe8e4c8, width: 2, alpha: 0.85 })
        node.addChild(marker)
        label(node, t('creation.add'), x, y + 30, 18, 0xd5dfc7).anchor.set(0.5, 0)
      } else {
        flowers(marker, x - 33, y + 16, mood.flower, index + 1, 5)
        node.addChild(marker)
        const monument = monumentArt(getMonumentKind(garden.id, memorial.place))
        monument.position.set(x, y)
        node.addChild(monument)
        const light = new Graphics()
        lantern(light, x + 37, y + 14)
        node.addChild(light)
        const name = label(node, memorial.source === 'saved' ? memorial.name : t(`garden.pets.${memorial.profile}`), x, y + 36, 20, 0xfff6e3)
        if (name.width > 130) name.scale.set(130 / name.width)
        name.anchor.set(0.5, 0)
      }
      const box = node.getLocalBounds()
      chunks.push({ node, bounds: { left: box.minX, right: box.maxX, top: box.minY, bottom: box.maxY } })
      node.cacheAsTexture({ resolution: 2, antialias: true })
      staticArt.addChild(node)
    }
  }
  const atmosphere = new Container()
  atmosphere.eventMode = 'none'
  root.addChild(atmosphere)
  const updateLife = createGardenLife(atmosphere, garden?.id, width, height)
  const rand = random(981)
  const motes = Array.from({ length: garden ? 22 : 16 }, (_, index) => {
    const x = 35 + rand() * (width - 70)
    const y = 30 + rand() * (height - 60)
    const mote = new Graphics()
    glow(mote, 0, 0, 9, 0xf3d28a)
    mote.circle(0, 0, index % 3 ? 1.3 : 2).fill(0xffe1a1)
    mote.position.set(x, y)
    atmosphere.addChild(mote)
    return { mote, x, y, phase: rand() * Math.PI * 2 }
  })
  function update(time: number) {
    updateLife?.(time)
    for (const { mote, x, y, phase } of motes) {
      mote.position.set(x + Math.sin(time * 0.23 + phase) * 13, y + Math.cos(time * 0.19 + phase) * 9)
      mote.alpha = 0.25 + (Math.sin(time * 0.7 + phase) + 1) * 0.3
    }
  }
  update(0)
  function updateVisibility(view: GardenView) {
    let visible = 0
    for (const chunk of chunks) {
      chunk.node.visible = gardenBoundsVisible(chunk.bounds, view)
      if (chunk.node.visible) visible++
    }
    return visible
  }
  return { root, update, updateVisibility }
}

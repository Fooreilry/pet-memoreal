import { CanvasTextMetrics, Container, Graphics, Rectangle, Text } from 'pixi.js'
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
import { getGardenMarkerHitBounds, getGardenMarkerMetrics, gardenMarkerLabelWidth, layoutGardenMarkerLabels } from './gardenMarkerMetrics'
import type { GardenMarkerBounds } from './gardenMarkerMetrics'
import { gardenOverviewPreviewSize, getGardenOverviewLayout } from './gardenOverviewLayout'

type Garden = ReturnType<typeof getGardenOverviewLayout>[number]['garden']
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
    g.roundRect(0, 0, w, h, 16).fill(mood.ground)
    if (!(preview && garden.id === 'hill')) drawGardenGround(g, w, h, garden.id, preview)
  }
  if (garden.id === 'meadow') (terrainOnly ? drawMeadowTerrain : drawMeadowLandscape)(g, w, h, preview)
  else if (garden.id === 'grove') (terrainOnly ? drawGroveTerrain : drawGroveLandscape)(g, w, h, preview)
  else if (garden.id === 'hill') (terrainOnly ? drawHillTerrain : drawHillLandscape)(g, w, h, preview)
  else (terrainOnly ? drawLakeTerrain : drawLakeLandscape)(g, w, h, preview)
  if (!terrainOnly) for (const plant of getGardenPlantLayout(w, h, garden.id, preview)) drawGardenPlant(g, plant)
}

export function createGardenScene(width: number, height: number, garden: Garden | undefined, t: Translate, saved: PublicMemorial[] = [], compactOverview = false) {
  const root = new Container()
  const staticArt = new Container()
  const chunks: { node: Container, bounds: GardenView }[] = []
  const markers: { place: number, node: Container, visual: Container, flowers?: Graphics, light?: Graphics, name?: Text, plate?: Graphics, text?: string, desktopScale: number }[] = []
  const overviewTiles = new Map<GardenId, { scenery: Container, baseScale: number, zoom: number, from: number, target: number, elapsed: number }>()
  root.addChild(staticArt)
  if (!garden) staticArt.addChild(new Graphics().roundRect(0, 0, width, height, 28).fill(0x142e2e))
  if (!garden) {
    getGardenOverviewLayout(width, height, compactOverview).forEach(({ garden: item, x, y, width: tileW, height: tileH, illustration }) => {
      const tile = new Container()
      tile.pivot.set(tileW / 2, tileH / 2)
      tile.position.set(x + tileW / 2, y + tileH / 2)
      tile.eventMode = 'none'
      if (compactOverview) tile.addChild(new Graphics().roundRect(0, 0, tileW, tileH, 12).fill(0x183d32))
      const image = new Container({ label: `overview-image-${item.id}` })
      image.position.set(illustration.x, illustration.y)
      image.eventMode = 'none'
      tile.addChild(image)
      const scenery = new Container()
      scenery.label = `overview-scenery-${item.id}`
      const artW = compactOverview ? gardenOverviewPreviewSize.width : tileW
      const artH = compactOverview ? gardenOverviewPreviewSize.height : tileH
      const baseScale = compactOverview ? illustration.width / artW : 1
      scenery.pivot.set(artW / 2, artH / 2)
      scenery.position.set(illustration.width / 2, illustration.height / 2)
      scenery.scale.set(baseScale)
      scenery.eventMode = 'none'
      const art = new Graphics()
      // Legacy previews reserve 99 world units for an overlaid caption. Supply
      // that gutter outside the fixed 320×240 scene, then cache only its art.
      landscape(art, item, artW, artH + (compactOverview ? 99 : 0), true)
      scenery.addChild(art)
      if (compactOverview) scenery.boundsArea = new Rectangle(0, 0, artW, artH)
      scenery.cacheAsTexture({ resolution: 2, antialias: true })
      image.addChild(scenery)
      const mask = new Graphics().roundRect(0, 0, illustration.width, illustration.height, compactOverview ? 10 : 16).fill(0xffffff)
      image.addChild(mask)
      image.mask = mask
      // The native choice button owns fixed, accessible captions above this artwork.
      staticArt.addChild(tile)
      overviewTiles.set(item.id, { scenery, baseScale, zoom: 1, from: 1, target: 1, elapsed: 0 })
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
    for (const [index, { x, y, memorial, chunkId, place }] of getMemorialLayout(width, height, garden.id, saved).places.entries()) {
      const node = new Container({ label: chunkId })
      node.eventMode = 'none'
      const decor = new Container()
      decor.eventMode = 'none'
      const plants = decor.addChild(new Graphics())
      drawChunk(plants, chunkId)
      decor.cacheAsTexture({ resolution: 2, antialias: true })
      node.addChild(decor)
      // Only this small artwork changes scale. Chunk vegetation retains its
      // world coordinates and its original cache throughout camera gestures.
      const markerNode = node.addChild(new Container({ label: `garden-marker-${place}` }))
      markerNode.position.set(x, y)
      markerNode.eventMode = 'none'
      const visual = markerNode.addChild(new Container({ label: `${memorial ? 'memorial' : 'empty-place'}-visual-${place}` }))
      visual.eventMode = 'none'
      const marker = new Graphics()
      if (!memorial) {
        marker.ellipse(0, 15, 32, 12).fill({ color: 0x193e32, alpha: 0.22 })
        marker.circle(0, -4, 22).fill({ color: 0x183d32, alpha: 0.32 }).stroke({ color: 0xd6dfbc, width: 1.5, alpha: 0.6 })
        marker.moveTo(-7, -4).lineTo(7, -4).moveTo(0, -11).lineTo(0, 3).stroke({ color: 0xe8e4c8, width: 2, alpha: 0.85 })
        visual.addChild(marker)
        visual.pivot.y = -4
        visual.y = -4
        markers.push({ place, node: markerNode, visual, desktopScale: 1 })
      } else {
        flowers(marker, 0, 0, mood.flower, index + 1, 5)
        marker.position.set(-33, 16)
        markerNode.addChildAt(marker, 0)
        const monument = monumentArt(getMonumentKind(garden.id, memorial.place))
        visual.addChild(monument)
        const light = new Graphics()
        lantern(light, 0, 0)
        light.position.set(37, 14)
        markerNode.addChild(light)
        const plate = markerNode.addChild(new Graphics({ label: `memorial-name-plate-${place}` }))
        plate.eventMode = 'none'
        plate.visible = false
        const text = memorial.source === 'saved' ? memorial.name : t(`garden.pets.${memorial.profile}`)
        const name = label(markerNode, text, 0, 36, 20, 0xfff6e3)
        name.label = `memorial-name-${place}`
        if (name.width > 130) name.scale.set(130 / name.width)
        name.anchor.set(0.5, 0)
        markers.push({ place, node: markerNode, visual, flowers: marker, light, name, plate, text, desktopScale: name.scale.x })
      }
      visual.cacheAsTexture({ resolution: 2, antialias: true })
      const box = node.getLocalBounds()
      chunks.push({ node, bounds: { left: box.minX, right: box.maxX, top: box.minY, bottom: box.maxY } })
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
  let markerScale = 0
  let compactMarkers = false
  let markerHits: Record<number, GardenMarkerBounds> = {}
  function updateMarkers(screenScale: number, compact: boolean) {
    if (screenScale === markerScale && compact === compactMarkers) return markerHits
    const profileChanged = compact !== compactMarkers
    markerScale = screenScale
    compactMarkers = compact
    markerHits = {}
    for (const item of markers) {
      const metrics = getGardenMarkerMetrics(screenScale, compact, !!item.name)
      item.visual.scale.set(metrics.artScale)
      // Keep small keepsakes beside the enlarged stone without enlarging their
      // translucent light halos or adding any geometry during zoom.
      item.flowers?.position.set(-33 * metrics.artScale, 16 * metrics.artScale)
      item.light?.position.set(37 * metrics.artScale, 14 * metrics.artScale)
      if (item.name) {
        if (profileChanged) {
          item.name.style.wordWrap = false
          item.name.style.align = 'center'
          item.name.text = item.text!
          if (compact) {
            const singleLine = item.text!.replace(/\s+/gu, ' ')
            item.name.text = singleLine
            if (CanvasTextMetrics.measureText(singleLine, item.name.style).width > gardenMarkerLabelWidth) {
              let last = singleLine
              while (last && CanvasTextMetrics.measureText(`${last}…`, item.name.style, undefined, false).width > gardenMarkerLabelWidth) last = Array.from(last).slice(0, -1).join('')
              item.name.text = `${last}…`
            }
          }
        }
        item.name.scale.set(compact ? metrics.labelScale : item.desktopScale)
        item.name.x = 0
        item.name.y = metrics.labelY
        item.plate!.visible = false
        if (profileChanged && compact) {
          const box = item.name.getLocalBounds()
          item.plate!.clear().roundRect(box.minX - 1, box.minY - 1, box.width + 2, box.height + 2, 3).fill({ color: 0x183d32, alpha: .94 })
        }
      }
    }
    if (compact) {
      const stones = markers.map(item => {
        const box = item.visual.getLocalBounds()
        const scale = item.visual.scale.x
        return { place: item.place, occupied: !!item.name, bounds: {
          left: item.node.x + item.visual.x + (box.minX - item.visual.pivot.x) * scale,
          top: item.node.y + item.visual.y + (box.minY - item.visual.pivot.y) * scale,
          right: item.node.x + item.visual.x + (box.maxX - item.visual.pivot.x) * scale,
          bottom: item.node.y + item.visual.y + (box.maxY - item.visual.pivot.y) * scale
        } }
      })
      const labels = markers.filter(item => item.name).map(item => ({
        place: item.place, stone: stones.find(stone => stone.place === item.place)!.bounds,
        label: { width: item.name!.width + 2 * item.name!.scale.x, height: item.name!.height + 2 * item.name!.scale.y },
        preferredY: item.node.y + item.name!.y - item.name!.scale.y
      }))
      const placement = layoutGardenMarkerLabels(labels, 2 / Math.max(.001, screenScale), stones.filter(stone => !stone.occupied).map(stone => stone.bounds))
      for (const item of markers) {
        const target = placement[item.place]
        if (!item.name || !target) continue
        const box = item.name.getLocalBounds()
        item.name.position.set(target.x - item.node.x + (1 - box.minX) * item.name.scale.x, target.y - item.node.y + (1 - box.minY) * item.name.scale.y)
        item.plate!.visible = target.inset
        item.plate!.scale.copyFrom(item.name.scale)
        item.plate!.position.copyFrom(item.name.position)
      }
    }
    for (const item of markers) {
      const metrics = getGardenMarkerMetrics(screenScale, compact, !!item.name)
      const box = item.name?.getLocalBounds()
      markerHits[item.place] = getGardenMarkerHitBounds(metrics, !!item.name,
        box ? { width: box.width, height: box.height, x: item.name!.x, y: item.name!.y } : undefined)
    }
    for (const chunk of chunks) {
      const box = chunk.node.getLocalBounds()
      Object.assign(chunk.bounds, { left: box.minX, right: box.maxX, top: box.minY, bottom: box.maxY })
    }
    return markerHits
  }
  function updateVisibility(view: GardenView) {
    let visible = 0
    for (const chunk of chunks) {
      chunk.node.visible = gardenBoundsVisible(chunk.bounds, view)
      if (chunk.node.visible) visible++
    }
    return visible
  }
  const hoverDuration = 220
  function highlightOverview(id?: GardenId, immediate = false) {
    let pending = false
    for (const [gardenId, tile] of overviewTiles) {
      const target = gardenId === id ? 1.065 : 1
      if (tile.target !== target || immediate) {
        tile.from = tile.zoom
        tile.target = target
        tile.elapsed = immediate ? hoverDuration : 0
        if (immediate) {
          tile.zoom = target
          tile.scenery.scale.set(target * tile.baseScale)
        }
      }
      pending ||= tile.zoom !== target
    }
    return pending
  }
  // A short UI animation can advance even while ambient motion is paused.
  // The caller stops its RAF as soon as this returns false.
  function advanceOverview(deltaMS: number) {
    let pending = false
    for (const tile of overviewTiles.values()) {
      if (tile.zoom === tile.target) continue
      tile.elapsed = Math.min(hoverDuration, tile.elapsed + Math.max(0, Math.min(deltaMS, 64)))
      const progress = tile.elapsed / hoverDuration
      const ease = 1 - (1 - progress) ** 3
      tile.zoom = progress === 1 ? tile.target : tile.from + (tile.target - tile.from) * ease
      tile.scenery.scale.set(tile.zoom * tile.baseScale)
      pending ||= tile.zoom !== tile.target
    }
    return pending
  }
  return { root, update, updateMarkers, updateVisibility, highlightOverview, advanceOverview, totalChunks: chunks.length }
}

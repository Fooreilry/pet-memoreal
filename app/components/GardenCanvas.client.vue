<script setup lang="ts">
import { Application, Container, Graphics } from 'pixi.js'
import type { WebGLRenderer } from 'pixi.js'
import { findDemoGarden } from '../data/demoGardens'
import type { GardenId } from '../data/demoGardens'
import { createGardenScene, getGardenOverviewLayout } from '../utils/gardenScene'
import { getGardenWorldSize, gardenLayoutVersion } from '../data/gardenLayout'
import { getGardenProjection } from '../utils/gardenProjection'
import { drawGardenSurroundings } from '../utils/gardenSurroundings'
import { getGardenEnvironmentBounds, getGardenEnvironmentSeed, getGardenOuterStream } from '../data/gardenEnvironment'
import { getExtendedGardenPaths, getGardenExtendedRouteObstacles } from '../data/gardenExtendedPaths'
import { drawGardenPathSegments } from '../utils/gardenPaths'
import { streamBounds } from '../data/gardenPlacement'
import { getMemorialLayout } from '../data/demoMemorials'
import { drawHillStream } from '../utils/hillScenery'
import type { GardenView } from '../utils/gardenProjection'
import type { PublicMemorial } from '../../shared/memorials'
import { createGardenAtmosphere } from '../utils/gardenAtmosphere'
import { createGardenMemorialScene } from '../utils/gardenMemorialScene'
import type { GardenMemorial } from '../data/demoMemorials'
import { getMonumentKind } from '../data/monuments'

const props = withDefaults(defineProps<{ gardenId?: GardenId, memorials?: PublicMemorial[], placesState?: 'loading' | 'ready' | 'error', focusId?: string, canCreate?: boolean, editing?: boolean, fullscreen?: boolean }>(), { memorials: () => [], placesState: 'ready', focusId: undefined, gardenId: undefined, canCreate: false, editing: false, fullscreen: false })
const emit = defineEmits<{ select: [id: GardenId], create: [place: number], ready: [value: boolean], detail: [open: boolean], retry: [], toggleFullscreen: [] }>()
const { t, locale } = useI18n()
const { seed: sessionSeed } = useGardenSession()
const host = ref<HTMLDivElement>()
const viewport = ref<HTMLDivElement>()
const modalOpen = ref(false)
const detailMemorial = shallowRef<GardenMemorial>()
const memorialLayer = ref<{ closeDetail: () => void }>()
const detailState = ref<'none' | 'preparing' | 'entering' | 'ready' | 'returning'>('none')
const detailSteps = ref(0)
const detailGeometry = shallowRef<{ x: number, y: number, scale: number }>()
const transitionPhase = ref<'loading' | 'revealing' | 'idle'>('loading')
const hasFrame = ref(false)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const sceneReady = ref(false)
const dataReady = computed(() => !props.gardenId || props.placesState === 'ready')
const isReady = computed(() => state.value === 'ready' && dataReady.value && sceneReady.value)
const viewState = computed(() => state.value === 'error' || (props.gardenId && props.placesState === 'error') ? 'error' : interactive.value ? 'ready' : 'loading')
const loadingSteps = computed(() => state.value !== 'ready' ? 0 : !dataReady.value ? 1 : !sceneReady.value ? 2 : 3)
const loadingPhase = computed(() => state.value !== 'ready' ? 'opening' : !dataReady.value ? 'stories' : 'places')
const visualBusy = computed(() => !isReady.value || detailState.value === 'preparing' || detailState.value === 'returning')
const interactive = computed(() => isReady.value && transitionPhase.value === 'idle')
const cameraEnabled = computed(() => interactive.value && !!props.gardenId && !modalOpen.value && !props.editing)
const { camera, interacting, dragging, reset, resize, zoomTo, reveal, pointerDown, pointerMove, pointerUp, clickCapture, wheel, keydown } = useGardenCamera(viewport, cameraEnabled)
const world = shallowRef({ width: 1000, height: 650 })
const projection = shallowRef(getGardenProjection(1000, 650, 1000, 650))
const visibleChunks = ref(0)
const surroundingPlants = ref(0)
const surroundingBounds = shallowRef<GardenView>()
const surroundingTransform = reactive({ scale: 0, x: 0, y: 0 })
const overviewPlaces = computed(() => getGardenOverviewLayout(world.value.width, world.value.height))
const overviewHovered = ref<GardenId>()
let application: Application | undefined
let observer: ResizeObserver | undefined
let disposed = false
let attempt = 0
let frame = 0
let readyFrame = 0
let prepareFrame = 0
let renderRevision = 0
let detailRevision = 0
let revealTimer: ReturnType<typeof setTimeout> | undefined
let overviewFrame = 0
let overviewTime = 0
let intersection: IntersectionObserver | undefined
let motionQuery: MediaQueryList | undefined
let animate: ((time: number) => void) | undefined
let sceneRoot: Application['stage'] | undefined
let surroundings: Container | undefined
let surroundingKey = ''
let updateVisibility: ((view: GardenView) => number) | undefined
let highlightOverview: ((id?: GardenId, immediate?: boolean) => boolean) | undefined
let advanceOverview: ((deltaMS: number) => boolean) | undefined
let atmosphere: ReturnType<typeof createGardenAtmosphere> | undefined
let rendered: { app: Application, width: number, height: number, gardenId?: GardenId, locale: string, memorials: PublicMemorial[], seed: number } | undefined
let elapsed = 0
let detailScene: ReturnType<typeof createGardenMemorialScene> | undefined
let detailKey = ''
let detailFrame = 0
const paused = ref(false)
const reducedMotion = ref(false)
const inView = ref(true)
const visible = ref(true)
const effectsEnabled = ref(true)
const effectsSupported = ref(true)
const weather = computed(() => !props.gardenId || !effectsEnabled.value || !effectsSupported.value ? 'none' : ({ meadow: 'sun', lake: 'rain', grove: 'canopy', hill: 'clouds' } as const)[props.gardenId])
const moving = computed(() => interactive.value && !paused.value && !reducedMotion.value && (!modalOpen.value || !!detailMemorial.value) && !props.editing && inView.value && visible.value)

watch(interactive, value => emit('ready', value), { immediate: true })
function finishReveal() {
  if (disposed || visualBusy.value) return
  clearTimeout(revealTimer)
  transitionPhase.value = 'idle'
  if (detailState.value === 'entering') detailState.value = 'ready'
}
watch(visualBusy, (busy) => {
  clearTimeout(revealTimer)
  if (disposed) return
  if (busy) { transitionPhase.value = 'loading'; return }
  if (transitionPhase.value === 'idle') return
  if (reducedMotion.value) finishReveal()
  else {
    transitionPhase.value = 'revealing'
    // The transition event owns completion, including Vue's paint frames.
    // A bounded fallback also settles if the tab is hidden during the reveal.
    revealTimer = setTimeout(finishReveal, 400)
  }
}, { flush: 'sync', immediate: true })

function disposeDetail() {
  detailRevision++
  cancelAnimationFrame(detailFrame)
  detailFrame = 0
  detailScene?.root.removeFromParent()
  detailScene?.destroy()
  detailScene = undefined
  detailKey = ''
  detailGeometry.value = undefined
  if (sceneRoot) { sceneRoot.visible = true; sceneRoot.alpha = 1 }
  if (surroundings) { surroundings.visible = true; surroundings.alpha = 1 }
  detailState.value = 'none'
}

function syncDetail() {
  if (!application || !host.value || !detailMemorial.value || !props.gardenId) return
  const width = host.value.clientWidth, height = host.value.clientHeight
  const memorial = detailMemorial.value
  const key = `${width}:${height}:${props.gardenId}:${memorial.id}:${memorial.place}`
  if (key === detailKey) return
  disposeDetail()
  detailKey = key
  detailState.value = 'preparing'
  detailSteps.value = 0
  const revision = detailRevision
  const current = () => !disposed && revision === detailRevision && detailMemorial.value?.id === memorial.id
  // Let Vue paint the veil over the previous frame before doing synchronous
  // vector/cache work. No travel from map coordinates: the stone is grounded
  // at its final position from the very first close-up frame.
  detailFrame = requestAnimationFrame(() => {
    if (!current()) return
    detailFrame = requestAnimationFrame(() => {
      if (!current() || !application || !props.gardenId) return
      prepareSafely(() => {
        const scene = createGardenMemorialScene(width, height, props.gardenId!, memorial.place)
        detailScene = scene
        detailGeometry.value = { x: scene.monument.x, y: scene.monument.y, scale: scene.monument.scale.x }
        detailSteps.value = 1
        detailFrame = requestAnimationFrame(() => {
          if (!current() || !application) return
          prepareSafely(() => {
            application!.stage.addChild(scene.root)
            scene.update(elapsed)
            if (sceneRoot) sceneRoot.visible = false
            if (surroundings) surroundings.visible = false
            syncAtmosphere(width, height)
            drawFrame()
            detailSteps.value = 2
            detailFrame = requestAnimationFrame(() => {
              if (!current()) return
              detailFrame = 0
              detailSteps.value = 3
              detailState.value = 'entering'
            })
          })
        })
      })
    })
  })
}

function displayDetail(memorial?: GardenMemorial) {
  if (disposed) return
  if (!memorial && !detailMemorial.value && !detailScene) return
  detailMemorial.value = memorial
  emit('detail', !!memorial)
  if (memorial) syncDetail()
  else if (state.value === 'error') disposeDetail()
  else {
    cancelAnimationFrame(detailFrame)
    const revision = ++detailRevision
    detailState.value = 'returning'
    detailFrame = requestAnimationFrame(() => {
      detailFrame = requestAnimationFrame(() => {
        if (disposed || revision !== detailRevision) return
        prepareSafely(() => {
          disposeDetail()
          applyCamera()
          syncAtmosphere()
          drawFrame()
        })
      })
    })
  }
}

function hoverOverview(id?: GardenId) {
  overviewHovered.value = id
  cancelAnimationFrame(overviewFrame)
  overviewTime = 0
  const pending = highlightOverview?.(id, reducedMotion.value || !visible.value || !inView.value)
  if (pending) overviewFrame = requestAnimationFrame(animateOverview)
  else scheduleRender()
}

function animateOverview(time: number) {
  if (disposed || props.gardenId) return
  const pending = advanceOverview?.(overviewTime ? Math.min(time - overviewTime, 50) : 16)
  overviewTime = time
  drawFrame()
  if (pending) overviewFrame = requestAnimationFrame(animateOverview)
}

function syncAtmosphere(width = host.value?.clientWidth ?? 0, height = host.value?.clientHeight ?? 0) {
  if (!application || !width || !height) return
  if (!props.gardenId) {
    atmosphere?.destroy()
    atmosphere = undefined
    return
  }
  if (!atmosphere && effectsEnabled.value && effectsSupported.value) {
    let candidate: ReturnType<typeof createGardenAtmosphere> | undefined
    try {
      candidate = createGardenAtmosphere(width, height, props.gardenId)
      if (!candidate.prepare(application.renderer as WebGLRenderer)) throw new Error('Atmospheric shader unavailable')
      atmosphere = candidate
    } catch {
      candidate?.destroy()
      effectsSupported.value = false
    }
  }
  if (!atmosphere) return
  atmosphere.setGarden(props.gardenId)
  atmosphere.resize(width, height)
  atmosphere.setFocus(!!detailScene, detailScene?.layout.visual)
  atmosphere.setView(detailScene?.atmosphereView ?? { x: projection.value.offsetX + camera.x, y: projection.value.offsetY + camera.y, scale: projection.value.scale * camera.zoom })
  atmosphere.setEnabled(effectsEnabled.value && effectsSupported.value)
  atmosphere.update(elapsed)
  if (application.stage.children.at(-1) !== atmosphere.root) application.stage.addChild(atmosphere.root)
}

function toggleEffects() {
  effectsEnabled.value = !effectsEnabled.value
  try { localStorage.setItem('petmemoreal_garden_effects', effectsEnabled.value ? 'on' : 'off') } catch { /* The current visit still keeps the preference when storage is unavailable. */ }
}

function drawFrame() {
  if (!application || disposed || state.value === 'error') return
  try { application.render() }
  catch (error) {
    // Decorative light is optional; an unsupported filter must not hide the garden.
    if (!atmosphere) throw error
    atmosphere.destroy()
    atmosphere = undefined
    effectsSupported.value = false
    application.render()
  }
}

function prepareSafely(work: () => void) {
  try { work() }
  catch {
    cancelAnimationFrame(frame)
    cancelAnimationFrame(readyFrame)
    cancelAnimationFrame(prepareFrame)
    renderRevision++
    application?.stop()
    disposeDetail()
    sceneReady.value = false
    state.value = 'error'
  }
}

function finishScene() {
  cancelAnimationFrame(readyFrame)
  const snapshot = rendered
  const revision = renderRevision
  readyFrame = requestAnimationFrame(() => {
    if (!disposed && revision === renderRevision && snapshot && rendered === snapshot && dataReady.value && snapshot.gardenId === props.gardenId && snapshot.memorials === props.memorials && snapshot.locale === locale.value) { hasFrame.value = true; sceneReady.value = true }
  })
}

function retry() {
  if (props.placesState === 'error') emit('retry')
  if (state.value === 'error') start()
}

function syncMotion() {
  if (moving.value) application?.start()
  else application?.stop()
}

function readMotion() { reducedMotion.value = motionQuery?.matches ?? false }
function readVisibility() { visible.value = !document.hidden }

function applyCamera() {
  if (!sceneRoot || !host.value) return
  const scale = projection.value.scale * camera.zoom
  const x = projection.value.offsetX + camera.x, y = projection.value.offsetY + camera.y
  sceneRoot.scale.set(scale)
  sceneRoot.position.set(x, y)
  atmosphere?.setView(detailScene?.atmosphereView ?? { x, y, scale })
  if (surroundings) {
    surroundings.scale.set(scale)
    surroundings.position.set(x, y)
    Object.assign(surroundingTransform, { scale, x, y })
  }
  visibleChunks.value = updateVisibility?.({ left: -x / scale, top: -y / scale, right: (host.value.clientWidth - x) / scale, bottom: (host.value.clientHeight - y) / scale }) ?? 0
  scheduleRender()
}

function updateSurroundings(width: number, height: number) {
  if (!application) return
  const key = `${width}:${height}:${props.gardenId}:${sessionSeed.value}`
  if (key === surroundingKey) return
  if (surroundings) {
    application.stage.removeChild(surroundings)
    surroundings.destroy({ children: true, context: true })
  }
  surroundings = undefined
  surroundingPlants.value = 0
  surroundingBounds.value = undefined
  surroundingKey = key
  if (!props.gardenId) return
  const bounds = getGardenEnvironmentBounds(width, height, projection.value)
  const paths = getExtendedGardenPaths(bounds, props.gardenId)
  const streams = getGardenOuterStream(bounds, props.gardenId)
  const corridors = [...getGardenExtendedRouteObstacles(bounds, props.gardenId), ...streams.flatMap(stream => streamBounds(stream.points, 25))]
  const ground = new Graphics()
  surroundingPlants.value = drawGardenSurroundings(ground, bounds, props.gardenId, getGardenEnvironmentSeed(props.gardenId), corridors)
  drawGardenPathSegments(ground, paths, props.gardenId, getMemorialLayout(1200, 1000, props.gardenId).places)
  for (const stream of streams) drawHillStream(ground, stream.points, false, stream.phase)
  surroundingBounds.value = bounds
  surroundings = new Container()
  surroundings.eventMode = 'none'
  surroundings.addChild(ground)
  // A world-space cache shares the camera and a bounded texture size with the garden.
  const cacheBounds = ground.getLocalBounds()
  const extent = Math.max(cacheBounds.maxX - cacheBounds.minX, cacheBounds.maxY - cacheBounds.minY)
  surroundings.cacheAsTexture({ resolution: Math.min(2, projection.value.scale * Math.min(window.devicePixelRatio || 1, 2), 2048 / extent), antialias: true })
  application.stage.addChildAt(surroundings, 0)
}

function render() {
  cancelAnimationFrame(prepareFrame)
  cancelAnimationFrame(readyFrame)
  const revision = ++renderRevision
  if (!application || !host.value || disposed || state.value === 'error') return
  if (!dataReady.value) { sceneReady.value = false; return }
  const changed = !rendered || rendered.gardenId !== props.gardenId || rendered.locale !== locale.value || rendered.memorials !== props.memorials || rendered.seed !== sessionSeed.value
  if (!changed) { prepareSafely(renderScene); return }
  sceneReady.value = false
  // A pair of frames gives the browser a paint opportunity for the retained,
  // blurred scene before preparing the next garden on this same renderer.
  prepareFrame = requestAnimationFrame(() => {
    prepareFrame = requestAnimationFrame(() => {
      if (!disposed && revision === renderRevision) { prepareFrame = 0; prepareSafely(renderScene) }
    })
  })
}

function renderScene() {
  if (!application || !host.value || disposed) return
  if (!dataReady.value) { sceneReady.value = false; return }
  const width = host.value.clientWidth
  const height = host.value.clientHeight
  if (!width || !height) return
  const scale = Math.min(width / (width < 600 ? 640 : 1000), height / (width < 600 ? 840 : 650))
  const fixed = props.gardenId ? getGardenWorldSize(props.gardenId) : undefined
  const worldW = fixed?.width ?? Math.round(width / scale)
  const worldH = fixed?.height ?? Math.round(height / scale)
  projection.value = getGardenProjection(width, height, worldW, worldH, props.gardenId ? 16 : 0)
  resize(width, height, projection.value.width, projection.value.height)
  application.renderer.resize(width, height)
  if (world.value.width !== worldW || world.value.height !== worldH) world.value = { width: worldW, height: worldH }
  // Viewport changes move the camera, retaining the same world and cached chunks.
  if (rendered?.app === application && rendered.width === worldW && rendered.height === worldH
    && rendered.gardenId === props.gardenId && rendered.locale === locale.value && rendered.memorials === props.memorials && rendered.seed === sessionSeed.value) {
    updateSurroundings(width, height)
    syncAtmosphere(width, height)
    applyCamera()
    if (detailMemorial.value) syncDetail()
    if (!sceneReady.value) finishScene()
    return
  }
  disposeDetail()
  const scene = createGardenScene(worldW, worldH, findDemoGarden(props.gardenId), t, props.memorials)
  for (const child of application.stage.removeChildren()) {
    if (child !== surroundings && child !== atmosphere?.root) child.destroy({ children: true, context: true })
  }
  if (surroundings) application.stage.addChild(surroundings)
  application.stage.addChild(scene.root)
  updateSurroundings(width, height)
  sceneRoot = scene.root
  sceneRoot.scale.set(projection.value.scale * camera.zoom)
  sceneRoot.position.set(projection.value.offsetX + camera.x, projection.value.offsetY + camera.y)
  animate = scene.update
  scene.update(elapsed)
  syncAtmosphere(width, height)
  // Warm every memorial's cached artwork before viewport culling and revealing
  // the canvas. Loading covers both network data and the first rendered frame.
  drawFrame()
  updateVisibility = scene.updateVisibility
  highlightOverview = scene.highlightOverview
  advanceOverview = scene.advanceOverview
  cancelAnimationFrame(overviewFrame)
  highlightOverview(overviewHovered.value, true)
  applyCamera()
  application.canvas.setAttribute('aria-label', props.gardenId ? `${t('garden.territoryLabel', { name: t(`garden.names.${props.gardenId}`) })} ${t(`garden.landscapes.${props.gardenId}`)}. ${t(`garden.life.${props.gardenId}`)}` : t('garden.mapLabel'))
  drawFrame()
  hasFrame.value = true
  rendered = { app: application, width: worldW, height: worldH, gardenId: props.gardenId, locale: locale.value, memorials: props.memorials, seed: sessionSeed.value }
  if (detailMemorial.value) syncDetail()
  finishScene()
}

function scheduleRender() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(drawFrame)
}

async function start() {
  const currentAttempt = ++attempt
  observer?.disconnect()
  if (application) {
    disposeDetail()
    atmosphere?.destroy()
    atmosphere = undefined
    application.destroy({ removeView: true }, { children: true, context: true })
    application = undefined
    rendered = undefined
    surroundings = undefined
    surroundingKey = ''
    sceneRoot = undefined
    updateVisibility = undefined
    animate = undefined
    hasFrame.value = false
  }
  state.value = 'loading'
  sceneReady.value = false
  const app = new Application()
  try {
    await app.init({ preference: 'webgl', antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoStart: false, backgroundAlpha: 0 })
    if (disposed || currentAttempt !== attempt) {
      app.destroy({ removeView: true }, { children: true, context: true })
      return
    }
    application = app
    app.canvas.setAttribute('role', 'img')
    host.value!.appendChild(app.canvas)
    intersection?.observe(host.value!)
    render()
    app.ticker.maxFPS = 30
    app.ticker.add((ticker) => {
      elapsed += Math.min(ticker.deltaMS, 100) / 1000
      if (detailScene) detailScene.update(elapsed)
      else animate?.(elapsed)
      if (effectsEnabled.value) atmosphere?.update(elapsed)
    })
    observer = new ResizeObserver(render)
    observer.observe(host.value!)
    state.value = 'ready'
  } catch {
    if (app.renderer) app.destroy({ removeView: true }, { children: true, context: true })
    application = undefined
    rendered = undefined
    surroundings = undefined
    surroundingKey = ''
    sceneRoot = undefined
    atmosphere?.destroy()
    atmosphere = undefined
    updateVisibility = undefined
    animate = undefined
    if (!disposed && currentAttempt === attempt) state.value = 'error'
  }
}

watch(() => props.gardenId, () => { displayDetail(); sceneReady.value = false; overviewHovered.value = undefined; cancelAnimationFrame(overviewFrame); reset(); modalOpen.value = false; render() })
watch(locale, render)
watch(() => props.memorials, () => { sceneReady.value = false; render() })
watch(() => props.placesState, () => { if (!dataReady.value) sceneReady.value = false; render() })
watch(sessionSeed, () => { displayDetail(); sceneReady.value = false; reset(); modalOpen.value = false; render() })
watch(camera, applyCamera, { flush: 'sync' })
watch(moving, syncMotion)
watch(effectsEnabled, () => { syncAtmosphere(); drawFrame() })
watch([reducedMotion, visible, inView], () => {
  if (!props.gardenId && (reducedMotion.value || !visible.value || !inView.value)) hoverOverview(overviewHovered.value)
})
onMounted(() => {
  try { effectsEnabled.value = localStorage.getItem('petmemoreal_garden_effects') !== 'off' } catch { /* Use the default without requiring browser storage. */ }
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  readMotion()
  readVisibility()
  motionQuery.addEventListener('change', readMotion)
  document.addEventListener('visibilitychange', readVisibility)
  intersection = new IntersectionObserver(([entry]) => { inView.value = entry?.isIntersecting ?? false })
  start()
})
onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  intersection?.disconnect()
  motionQuery?.removeEventListener('change', readMotion)
  document.removeEventListener('visibilitychange', readVisibility)
  cancelAnimationFrame(frame)
  cancelAnimationFrame(readyFrame)
  cancelAnimationFrame(overviewFrame)
  cancelAnimationFrame(prepareFrame)
  clearTimeout(revealTimer)
  disposeDetail()
  animate = undefined
  sceneRoot = undefined
  surroundings = undefined
  updateVisibility = undefined
  highlightOverview = undefined
  advanceOverview = undefined
  atmosphere?.destroy()
  atmosphere = undefined
  application?.destroy({ removeView: true }, { children: true, context: true })
  application = undefined
  rendered = undefined
})
</script>

<template>
  <div
    ref="viewport"
    class="canvas-wrapper"
    :class="{ 'camera-enabled': gardenId && !detailMemorial && interactive, 'camera-dragging': dragging && !detailMemorial }"
    :data-state="viewState"
    :data-transition="transitionPhase"
    :data-detail-id="detailMemorial?.id ?? 'none'"
    :data-detail-state="detailState"
    :data-detail-theme="detailMemorial?.gardenId ?? 'none'"
    :data-detail-kind="detailMemorial ? getMonumentKind(detailMemorial.gardenId, detailMemorial.place) : 'none'"
    :data-detail-monument-x="detailGeometry?.x"
    :data-detail-monument-y="detailGeometry?.y"
    :data-detail-monument-scale="detailGeometry?.scale"
    :aria-busy="!interactive"
    :data-motion="moving ? 'running' : 'paused'"
    :data-effects="!gardenId ? 'none' : !effectsSupported ? 'unavailable' : effectsEnabled ? 'on' : 'off'"
    :data-weather="weather"
    :data-zoom="camera.zoom.toFixed(3)"
    :data-camera-x="camera.x.toFixed(2)"
    :data-camera-y="camera.y.toFixed(2)"
    :data-layout-version="gardenLayoutVersion"
    :data-session-seed="sessionSeed"
    :data-world-width="world.width"
    :data-world-height="world.height"
    :data-projection-scale="projection.scale"
    :data-projection-offset-x="projection.offsetX"
    :data-projection-offset-y="projection.offsetY"
    :data-visible-chunks="visibleChunks"
    :data-surrounding-plants="surroundingPlants"
    :data-surrounding-bounds="JSON.stringify(surroundingBounds)"
    :data-surrounding-scale="surroundingTransform.scale"
    :data-surrounding-x="surroundingTransform.x"
    :data-surrounding-y="surroundingTransform.y"
    data-landscape-space="world"
    data-core-decor="chunks"
    :tabindex="gardenId && !detailMemorial ? 0 : undefined"
    :role="gardenId ? 'region' : undefined"
    :aria-label="gardenId ? t('garden.camera.label') : undefined"
    :aria-describedby="gardenId ? 'garden-camera-help' : undefined"
    @pointerdown.capture="pointerDown"
    @pointermove.capture="pointerMove"
    @pointerup.capture="pointerUp"
    @pointercancel.capture="pointerUp"
    @lostpointercapture.self="pointerUp"
    @click.capture="clickCapture"
    @wheel="wheel"
    @keydown="keydown"
  >
    <div ref="host" class="canvas-host" :class="{ 'canvas-hidden': !hasFrame, 'canvas-obscured': visualBusy }" />
    <div
      v-if="isReady && gardenId"
      class="garden-frame"
      data-testid="garden-frame"
      data-frame-style="seamless"
      aria-hidden="true"
      :style="{ width: `${projection.width}px`, height: `${projection.height}px`, transform: `translate(${projection.offsetX + camera.x}px, ${projection.offsetY + camera.y}px) scale(${camera.zoom})` }"
    />
    <nav v-if="interactive && !gardenId" class="garden-choices" :aria-label="t('garden.choose')" data-testid="garden-choices">
      <button
        v-for="place in overviewPlaces"
        :key="place.garden.id"
        type="button"
        class="garden-choice"
        :class="{ 'garden-choice-active': overviewHovered === place.garden.id }"
        :data-testid="`garden-choice-${place.garden.id}`"
        :aria-label="t(`garden.names.${place.garden.id}`)"
        :aria-describedby="`garden-description-${place.garden.id}`"
        :style="{ left: `${place.x / world.width * 100}%`, top: `${place.y / world.height * 100}%`, width: `${place.width / world.width * 100}%`, height: `${place.height / world.height * 100}%` }"
        @pointerenter="$event.pointerType === 'mouse' && hoverOverview(place.garden.id)"
        @pointerleave="hoverOverview()"
        @focus="hoverOverview(place.garden.id)"
        @blur="hoverOverview()"
        @click="emit('select', place.garden.id)"
      >
        <span class="garden-choice-caption">
          <span class="garden-choice-title">{{ t(`garden.names.${place.garden.id}`) }}<UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></span>
          <span :id="`garden-description-${place.garden.id}`" class="garden-choice-description">{{ t(`garden.overview.${place.garden.id}`) }}</span>
        </span>
      </button>
    </nav>
    <GardenMemorials v-if="isReady && gardenId" :key="`${gardenId}:${sessionSeed}`" ref="memorialLayer" :garden-id="gardenId" :width="world.width" :height="world.height" :projection="projection" :camera="camera" :interacting="interacting" :blocked="!interactive" :detail-ready="detailState === 'ready'" :saved="memorials" :focus-id="focusId" :can-create="canCreate && !editing" :paused="paused" :reduced-motion="reducedMotion" :effects-enabled="effectsEnabled" :effects-supported="effectsSupported" @modal="modalOpen = $event" @detail="displayDetail" @pause="paused = !paused" @effects="toggleEffects" @reveal="reveal" @create="emit('create', $event)" />
    <Transition name="scene-veil" @after-leave="finishReveal">
    <div v-if="visualBusy" class="canvas-state" data-testid="scene-veil" :data-kind="detailMemorial ? 'memorial' : 'garden'">
      <AppState
        v-if="viewState === 'error'"
        kind="error"
        :title="t(placesState === 'error' ? 'garden.dataError.title' : 'garden.error')"
        :description="t(placesState === 'error' ? 'garden.dataError.description' : 'garden.errorHint')"
        retry
        @retry="retry"
      />
      <div v-else-if="detailState !== 'returning'" class="scene-preparing">
        <GardenLoading :kind="detailMemorial ? 'memorial' : 'garden'" :completed="detailMemorial ? detailSteps : loadingSteps" :phase="detailMemorial ? detailSteps < 1 ? 'opening' : detailSteps < 2 ? 'stories' : 'places' : loadingPhase" />
        <button v-if="detailMemorial" type="button" class="scene-cancel" data-testid="scene-cancel" @click="memorialLayer?.closeDetail()">{{ t('memorial.back') }}<UIcon name="i-lucide-arrow-left" aria-hidden="true" /></button>
      </div>
      <span v-else class="sr-only" role="status">{{ t('memorial.back') }}</span>
    </div>
    </Transition>
  </div>
  <div v-if="gardenId && !detailMemorial && (interactive || fullscreen)" class="camera-toolbar" :class="{ 'camera-toolbar-loading': !interactive }" role="group" :aria-label="t('garden.camera.controls')">
    <div v-if="interactive" class="camera-zoom-group" role="group" :aria-label="t('garden.camera.scale')">
      <button type="button" :aria-label="t('garden.camera.out')" :title="t('garden.camera.out')" :disabled="camera.zoom <= 1 || editing || modalOpen" data-testid="garden-zoom-out" @click="zoomTo(camera.zoom / 1.25)"><UIcon name="i-lucide-minus" aria-hidden="true" /></button>
      <output :aria-label="t('garden.camera.scale')">{{ Math.round(camera.zoom * 100) }}%</output>
      <button type="button" :aria-label="t('garden.camera.in')" :title="t('garden.camera.in')" :disabled="camera.zoom >= 4 || editing || modalOpen" data-testid="garden-zoom-in" @click="zoomTo(camera.zoom * 1.25)"><UIcon name="i-lucide-plus" aria-hidden="true" /></button>
    </div>
    <div class="camera-tools-group">
      <button v-if="interactive" type="button" :aria-label="t('garden.camera.reset')" :title="t('garden.camera.reset')" :disabled="editing || modalOpen" data-testid="garden-camera-reset" @click="reset"><UIcon name="i-lucide-rotate-ccw" aria-hidden="true" /></button>
      <button type="button" :aria-label="t(fullscreen ? 'garden.camera.exitFullscreen' : 'garden.camera.fullscreen')" :title="t(fullscreen ? 'garden.camera.exitFullscreen' : 'garden.camera.fullscreen')" :aria-pressed="fullscreen" data-testid="garden-fullscreen" @click="emit('toggleFullscreen')"><UIcon :name="fullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'" aria-hidden="true" /></button>
      <template v-if="interactive">
        <button type="button" :aria-pressed="effectsEnabled && effectsSupported" :aria-label="t(!effectsSupported ? 'garden.effects.unavailable' : effectsEnabled ? 'garden.effects.disable' : 'garden.effects.enable')" :title="t(!effectsSupported ? 'garden.effects.unavailable' : effectsEnabled ? 'garden.effects.disable' : 'garden.effects.enable')" :disabled="!effectsSupported" :class="{ 'effects-active': effectsEnabled && effectsSupported }" data-testid="garden-effects" @click="toggleEffects"><UIcon :name="gardenId === 'lake' ? 'i-lucide-cloud-rain' : gardenId === 'meadow' ? 'i-lucide-sun' : gardenId === 'grove' ? 'i-lucide-sun-medium' : 'i-lucide-cloud-sun'" aria-hidden="true" /></button>
        <button v-if="!reducedMotion" type="button" :aria-pressed="paused" :aria-label="t(paused ? 'garden.resumeMotion' : 'garden.pauseMotion')" :title="t(paused ? 'garden.resumeMotion' : 'garden.pauseMotion')" data-testid="garden-motion" @click="paused = !paused"><UIcon :name="paused ? 'i-lucide-play' : 'i-lucide-pause'" aria-hidden="true" /></button>
        <UPopover :content="{ side: 'bottom', align: 'end', sideOffset: 10, collisionPadding: 16, prioritizePosition: true, sticky: 'always' }">
          <button type="button" :aria-label="t('garden.camera.instructions')" :title="t('garden.camera.instructions')" data-testid="garden-help"><UIcon name="i-lucide-circle-help" aria-hidden="true" /></button>
          <template #content><section class="garden-help-card" :aria-label="t('garden.camera.instructions')"><h2>{{ t('garden.camera.instructions') }}</h2><p>{{ t('garden.camera.help') }}</p><p>{{ t('creation.mapHint') }}</p><p>{{ t('garden.effects.help') }}</p><p v-if="!effectsSupported" class="garden-effects-note">{{ t('garden.effects.unavailable') }}</p><p v-if="reducedMotion">{{ t('garden.reducedMotion') }}</p></section></template>
        </UPopover>
      </template>
    </div>
  </div>
  <p v-if="gardenId" id="garden-camera-help" class="sr-only">{{ t('garden.camera.help') }} {{ t('creation.mapHint') }}</p>
</template>

<style scoped>
.canvas-wrapper { position: absolute; inset: 0; overflow: clip; background: radial-gradient(ellipse at center, #285349, #142f2d); }
.garden-frame { position: absolute; left: 0; top: 0; transform-origin: top left; pointer-events: none; border: 0; }
.camera-enabled { touch-action: none; cursor: grab; user-select: none; }
.camera-dragging { cursor: grabbing; }
.canvas-wrapper:focus-visible { outline: var(--focus-width) solid var(--color-lantern-300); outline-offset: -2px; }
.canvas-host { position: absolute; inset: 0; filter: none; transition: filter 280ms ease; }
.canvas-obscured { filter: blur(8px); }
.canvas-hidden { visibility: hidden; }
.canvas-wrapper :deep(.memorial-detail-layer) { transition: opacity 280ms ease; }
.canvas-wrapper[data-detail-state='preparing'] :deep(.memorial-detail-layer) { opacity: 0; pointer-events: none; }
.garden-choices { position: absolute; inset: 0; pointer-events: none; }
.garden-choice { position: absolute; border: 0; border-radius: var(--panel-radius); background: transparent; cursor: pointer; pointer-events: auto; text-align: left; color: var(--garden-control-text); }
.garden-choice:focus-visible { outline: var(--focus-width) solid var(--color-lantern-300); outline-offset: var(--focus-offset); }
.garden-choice-caption { position: absolute; left: 10px; right: 10px; bottom: 10px; display: grid; gap: 8px; padding: 16px 18px; border-radius: var(--control-radius); background: var(--garden-control-bg); }
.garden-choice-title { display: flex; justify-content: space-between; align-items: center; gap: 8px; font: 30px/1.15 var(--font-display); }
.garden-choice-title .iconify { width: 18px; height: 18px; flex-shrink: 0; color: var(--color-lantern-200); transition: transform 160ms ease; }
.garden-choice-description { min-height: 42px; font-size: 14px; line-height: 1.5; color: var(--color-garden-100); }
.garden-choice:hover .garden-choice-title .iconify { transform: translate(2px, -2px); }
.garden-choice:active .garden-choice-caption { background: var(--color-garden-900); }
.canvas-host :deep(canvas) { position: absolute; inset: 0; display: block; width: 100%; height: 100%; touch-action: pan-y; }
.canvas-state { position: absolute; inset: 0; z-index: calc(var(--garden-detail-layer) + 1); display: grid; place-items: center; background: radial-gradient(ellipse at center, #163b3266, #102b2acc); color: #f8f3e8; --ui-primary: #efc681; --focus-color: #efc681; cursor: default; }
.scene-preparing { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; max-height: 100%; padding: 16px; }
.scene-preparing :deep(.garden-loading) { min-height: 0; flex-shrink: 1; }
.scene-cancel { flex-shrink: 0; }
.scene-cancel { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 10px 16px; border-radius: var(--control-radius); color: var(--garden-cream); background: #14372fe6; font-size: 13px; cursor: pointer; }
.scene-cancel:hover { background: var(--garden-control-hover); }
.scene-cancel:focus-visible { outline: var(--focus-width) solid var(--color-lantern-300); outline-offset: var(--focus-offset); }
.scene-veil-leave-active { transition: opacity 280ms ease; }
.scene-veil-leave-to { opacity: 0; pointer-events: none; }
.canvas-state :deep(.app-state), .canvas-state :deep(.app-state h3), .canvas-state :deep(.app-state p) { color: #f8f3e8; }
.canvas-state :deep(.app-state) { width: min(460px, calc(100% - 40px)); padding: 20px; }
.canvas-state :deep(.app-state h3) { font: 28px/1.25 var(--font-display); white-space: normal; }
.canvas-state :deep(.app-state p) { max-width: 360px; font-size: 14px; line-height: 1.7; }
.canvas-state :deep(.app-state button) { min-height: 44px; padding-inline: 18px; }
.canvas-state :deep(.app-state .text-error) { color: var(--color-lantern-300); }
.camera-enabled :deep(canvas) { touch-action: none; }
.camera-toolbar { position: absolute; z-index: 3; top: calc(20px + env(safe-area-inset-top)); right: calc(20px + env(safe-area-inset-right)); display: grid; gap: 6px; width: 134px; color: var(--garden-control-text); }
.camera-zoom-group, .camera-tools-group { padding: 0; border: 1px solid var(--garden-control-border); border-radius: var(--control-radius); background: var(--garden-control-bg); box-shadow: 0 3px 12px #0c282b20; }
.camera-zoom-group { display: grid; grid-template-columns: 44px 44px 44px; align-items: center; }
.camera-tools-group { display: grid; grid-template-columns: repeat(3, 44px); }
.camera-toolbar button { display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--control-radius); cursor: pointer; }
.camera-toolbar button:hover:not(:disabled) { background: var(--garden-control-hover); }
.camera-toolbar button:active:not(:disabled) { background: var(--color-garden-800); }
.camera-toolbar .effects-active { color: var(--color-lantern-300); background: var(--garden-control-hover); }
.camera-toolbar button:disabled { opacity: 0.45; cursor: default; }
.camera-toolbar button:focus-visible { outline: var(--focus-width) solid var(--color-lantern-300); outline-offset: -2px; }
.camera-toolbar button > .iconify { width: 19px; height: 19px; }
.camera-toolbar output { text-align: center; font-size: 12px; font-variant-numeric: tabular-nums; }
.camera-toolbar.camera-toolbar-loading { z-index: calc(var(--garden-detail-layer) + 2); width: 46px; }
.camera-toolbar-loading .camera-tools-group { grid-template-columns: 44px; }
.garden-help-card { width: min(320px, calc(100vw - 32px)); max-height: min(520px, calc(100dvh - 48px), var(--reka-popover-content-available-height, 520px)); overflow-y: auto; overscroll-behavior: contain; padding: 20px; border-radius: var(--panel-radius); background: var(--surface-panel); color: var(--ui-text); font-size: 14px; line-height: 1.7; }
.garden-help-card h2 { margin: 0 0 16px; font: 24px/1.25 var(--font-display); color: var(--ui-text-highlighted); letter-spacing: -0.4px; }
.garden-help-card p + p { margin-top: 12px; }
.garden-effects-note { padding: 12px; border-radius: var(--control-radius); background: var(--garden-mist); }
@media (max-width: 600px) { .camera-toolbar { top: calc(76px + env(safe-area-inset-top)); right: calc(12px + env(safe-area-inset-right)); } .garden-choice-caption { left: 8px; right: 8px; bottom: 8px; padding: 14px 12px; gap: 6px; } .garden-choice-title { font-size: 24px; } }
@media (max-width: 380px) { .garden-choice-caption { padding-inline: 10px; } .garden-choice-title { font-size: 22px; } .garden-choice-title .iconify { display: none; } }
@media (max-height: 500px) { .camera-toolbar { gap: 4px; } .garden-choice-caption { padding-block: 10px; gap: 4px; } .garden-choice-title { font-size: 24px; } .garden-choice-description { min-height: 21px; } }
@media (max-height: 500px) and (min-width: 601px) { .camera-toolbar { top: calc(12px + env(safe-area-inset-top)); } }
@media (prefers-reduced-motion: reduce) { .garden-choice-title .iconify, .canvas-host, .scene-veil-leave-active, .canvas-wrapper :deep(.memorial-detail-layer) { transition: none; } }
</style>

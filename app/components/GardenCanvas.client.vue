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

const props = withDefaults(defineProps<{ gardenId?: GardenId, memorials?: PublicMemorial[], placesState?: 'loading' | 'ready' | 'error', focusId?: string, canCreate?: boolean, editing?: boolean }>(), { memorials: () => [], placesState: 'ready', focusId: undefined, gardenId: undefined, canCreate: false, editing: false })
const emit = defineEmits<{ select: [id: GardenId], create: [place: number], ready: [value: boolean], retry: [] }>()
const { t, locale } = useI18n()
const { seed: sessionSeed } = useGardenSession()
const { fullscreen, supported: fullscreenSupported, busy: fullscreenBusy, toggleFullscreen } = useGardenFullscreen()
const host = ref<HTMLDivElement>()
const viewport = ref<HTMLDivElement>()
const modalOpen = ref(false)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const sceneReady = ref(false)
const dataReady = computed(() => !props.gardenId || props.placesState === 'ready')
const isReady = computed(() => state.value === 'ready' && dataReady.value && sceneReady.value)
const viewState = computed(() => state.value === 'error' || (props.gardenId && props.placesState === 'error') ? 'error' : isReady.value ? 'ready' : 'loading')
const loadingSteps = computed(() => Number(state.value === 'ready') + Number(dataReady.value) + Number(sceneReady.value))
const loadingPhase = computed(() => state.value !== 'ready' ? 'opening' : !dataReady.value ? 'stories' : 'places')
const cameraEnabled = computed(() => isReady.value && !!props.gardenId && !modalOpen.value && !props.editing)
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
const paused = ref(false)
const reducedMotion = ref(false)
const inView = ref(true)
const visible = ref(true)
const effectsEnabled = ref(true)
const effectsSupported = ref(true)
const weather = computed(() => !props.gardenId || !effectsEnabled.value || !effectsSupported.value ? 'none' : ({ meadow: 'sun', lake: 'rain', grove: 'canopy', hill: 'clouds' } as const)[props.gardenId])
const moving = computed(() => isReady.value && !paused.value && !reducedMotion.value && !modalOpen.value && !props.editing && inView.value && visible.value)

watch(isReady, value => emit('ready', value), { immediate: true })

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
  atmosphere.setView({ x: projection.value.offsetX + camera.x, y: projection.value.offsetY + camera.y, scale: projection.value.scale * camera.zoom })
  atmosphere.setEnabled(effectsEnabled.value && effectsSupported.value)
  atmosphere.update(elapsed)
  if (atmosphere.root.parent !== application.stage) application.stage.addChild(atmosphere.root)
}

function toggleEffects() {
  effectsEnabled.value = !effectsEnabled.value
  try { localStorage.setItem('petmemoreal_garden_effects', effectsEnabled.value ? 'on' : 'off') } catch { /* The current visit still keeps the preference when storage is unavailable. */ }
}

function drawFrame() {
  if (!application || disposed) return
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

function finishScene() {
  cancelAnimationFrame(readyFrame)
  const snapshot = rendered
  readyFrame = requestAnimationFrame(() => {
    if (!disposed && snapshot && rendered === snapshot && dataReady.value && snapshot.gardenId === props.gardenId) sceneReady.value = true
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
  atmosphere?.setView({ x, y, scale })
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
    if (!sceneReady.value) finishScene()
    return
  }
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
  rendered = { app: application, width: worldW, height: worldH, gardenId: props.gardenId, locale: locale.value, memorials: props.memorials, seed: sessionSeed.value }
  finishScene()
}

function scheduleRender() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(drawFrame)
}

async function start() {
  const currentAttempt = ++attempt
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
      animate?.(elapsed)
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

watch(() => props.gardenId, () => { sceneReady.value = false; overviewHovered.value = undefined; cancelAnimationFrame(overviewFrame); reset(); modalOpen.value = false; render() })
watch(locale, render)
watch(() => props.memorials, () => { sceneReady.value = false; render() })
watch(() => props.placesState, () => { if (!dataReady.value) sceneReady.value = false; render() })
watch(sessionSeed, () => { sceneReady.value = false; reset(); modalOpen.value = false; render() })
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
    :class="{ 'camera-enabled': gardenId, 'camera-dragging': dragging }"
    :data-state="viewState"
    :aria-busy="!isReady"
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
    :tabindex="gardenId ? 0 : undefined"
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
    <div ref="host" class="canvas-host" :class="{ 'canvas-hidden': !isReady }" />
    <div
      v-if="isReady && gardenId"
      class="garden-frame"
      data-testid="garden-frame"
      data-frame-style="seamless"
      aria-hidden="true"
      :style="{ width: `${projection.width}px`, height: `${projection.height}px`, transform: `translate(${projection.offsetX + camera.x}px, ${projection.offsetY + camera.y}px) scale(${camera.zoom})` }"
    />
    <nav v-if="isReady && !gardenId" class="garden-choices" :aria-label="t('garden.choose')" data-testid="garden-choices">
      <button
        v-for="place in overviewPlaces"
        :key="place.garden.id"
        type="button"
        class="garden-choice"
        :class="{ 'garden-choice-active': overviewHovered === place.garden.id }"
        :data-testid="`garden-choice-${place.garden.id}`"
        :aria-label="t(`garden.names.${place.garden.id}`)"
        :style="{ left: `${place.x / world.width * 100}%`, top: `${place.y / world.height * 100}%`, width: `${place.width / world.width * 100}%`, height: `${place.height / world.height * 100}%`, borderRadius: `${28 * projection.scale}px` }"
        @pointerenter="$event.pointerType === 'mouse' && hoverOverview(place.garden.id)"
        @pointerleave="hoverOverview()"
        @focus="hoverOverview(place.garden.id)"
        @blur="hoverOverview()"
        @click="emit('select', place.garden.id)"
      />
    </nav>
    <GardenMemorials v-if="isReady && gardenId" :key="`${gardenId}:${sessionSeed}`" :garden-id="gardenId" :width="world.width" :height="world.height" :projection="projection" :camera="camera" :interacting="interacting" :saved="memorials" :focus-id="focusId" :can-create="canCreate && !editing" @modal="modalOpen = $event" @reveal="reveal" @create="emit('create', $event)" />
    <div v-if="!isReady" class="canvas-state">
      <AppState
        v-if="viewState === 'error'"
        kind="error"
        :title="t(placesState === 'error' ? 'creation.errors.map' : 'garden.error')"
        :description="placesState === 'error' ? undefined : t('garden.errorHint')"
        retry
        @retry="retry"
      />
      <GardenLoading v-else :completed="loadingSteps" :phase="loadingPhase" />
    </div>
  </div>
  <div v-if="isReady && gardenId" class="camera-toolbar" role="group" :aria-label="t('garden.camera.controls')">
    <button type="button" :aria-label="t('garden.camera.in')" :title="t('garden.camera.in')" :disabled="camera.zoom >= 4 || editing || modalOpen" data-testid="garden-zoom-in" @click="zoomTo(camera.zoom * 1.25)"><UIcon name="i-lucide-plus" aria-hidden="true" /></button>
    <output :aria-label="t('garden.camera.scale')">{{ Math.round(camera.zoom * 100) }}%</output>
    <button type="button" :aria-label="t('garden.camera.out')" :title="t('garden.camera.out')" :disabled="camera.zoom <= 1 || editing || modalOpen" data-testid="garden-zoom-out" @click="zoomTo(camera.zoom / 1.25)"><UIcon name="i-lucide-minus" aria-hidden="true" /></button>
    <button type="button" :aria-label="t('garden.camera.reset')" :title="t('garden.camera.reset')" :disabled="editing || modalOpen" data-testid="garden-camera-reset" @click="reset"><UIcon name="i-lucide-rotate-ccw" aria-hidden="true" /></button>
    <button type="button" :aria-label="t(fullscreen ? 'garden.camera.exitFullscreen' : 'garden.camera.fullscreen')" :title="t(!fullscreenSupported ? 'garden.camera.fullscreenUnavailable' : fullscreen ? 'garden.camera.exitFullscreen' : 'garden.camera.fullscreen')" :aria-pressed="fullscreen" :disabled="!fullscreenSupported || fullscreenBusy" data-testid="garden-fullscreen" @click="toggleFullscreen"><UIcon :name="fullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'" aria-hidden="true" /></button>
    <button v-if="!reducedMotion" type="button" :aria-pressed="paused" :aria-label="t(paused ? 'garden.resumeMotion' : 'garden.pauseMotion')" :title="t(paused ? 'garden.resumeMotion' : 'garden.pauseMotion')" data-testid="garden-motion" @click="paused = !paused"><UIcon :name="paused ? 'i-lucide-play' : 'i-lucide-pause'" aria-hidden="true" /></button>
    <button type="button" :aria-pressed="effectsEnabled && effectsSupported" :aria-label="t(!effectsSupported ? 'garden.effects.unavailable' : effectsEnabled ? 'garden.effects.disable' : 'garden.effects.enable')" :title="t(!effectsSupported ? 'garden.effects.unavailable' : effectsEnabled ? 'garden.effects.disable' : 'garden.effects.enable')" :disabled="!effectsSupported" :class="{ 'effects-active': effectsEnabled && effectsSupported }" data-testid="garden-effects" @click="toggleEffects"><UIcon :name="gardenId === 'lake' ? 'i-lucide-cloud-rain' : gardenId === 'meadow' ? 'i-lucide-sun' : gardenId === 'grove' ? 'i-lucide-sun-medium' : 'i-lucide-cloud-sun'" aria-hidden="true" /></button>
    <UPopover :content="{ side: 'left', align: 'start', sideOffset: 12 }">
      <button type="button" :aria-label="t('garden.camera.instructions')" :title="t('garden.camera.instructions')" data-testid="garden-help"><UIcon name="i-lucide-circle-help" aria-hidden="true" /></button>
      <template #content><div class="garden-help-card"><p>{{ t('garden.camera.help') }}</p><p>{{ t('creation.mapHint') }}</p><p>{{ t('garden.effects.help') }}</p><p v-if="reducedMotion">{{ t('garden.reducedMotion') }}</p></div></template>
    </UPopover>
  </div>
  <p v-if="gardenId" id="garden-camera-help" class="sr-only">{{ t('garden.camera.help') }} {{ t('creation.mapHint') }}</p>
</template>

<style scoped>
.canvas-wrapper { position: absolute; inset: 0; overflow: clip; background: radial-gradient(ellipse at center, #285349, #142f2d); }
.garden-frame { position: absolute; left: 0; top: 0; transform-origin: top left; pointer-events: none; border: 0; }
.camera-enabled { touch-action: none; cursor: grab; user-select: none; }
.camera-dragging { cursor: grabbing; }
.canvas-wrapper:focus-visible { outline: 3px solid #efc681; outline-offset: -4px; }
.canvas-host { position: absolute; inset: 0; }
.canvas-hidden { visibility: hidden; }
.garden-choices { position: absolute; inset: 0; pointer-events: none; }
.garden-choice { position: absolute; border: 0; background: transparent; cursor: pointer; pointer-events: auto; }
.garden-choice:focus-visible { outline: 2px solid #efc681; outline-offset: 3px; }
.canvas-host :deep(canvas) { position: absolute; inset: 0; display: block; width: 100%; height: 100%; touch-action: pan-y; }
.canvas-state { position: absolute; inset: 0; display: grid; place-items: center; background: radial-gradient(ellipse at center, #285349, #142f2d); color: #f8f3e8; --ui-primary: #efc681; --focus-color: #efc681; }
.canvas-state :deep(.app-state), .canvas-state :deep(.app-state h3), .canvas-state :deep(.app-state p) { color: #f8f3e8; }
.camera-enabled :deep(canvas) { touch-action: none; }
.camera-toolbar { position: absolute; z-index: 3; top: calc(20px + env(safe-area-inset-top)); right: calc(20px + env(safe-area-inset-right)); display: grid; justify-items: center; width: 48px; padding: 2px; color: #f8f3e8; background: #173d34ed; border: 1px solid #e4dcc33d; border-radius: 12px; box-shadow: 0 8px 28px #0c282b35; backdrop-filter: blur(16px); }
.camera-toolbar button { display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--control-radius); cursor: pointer; }
.camera-toolbar button:hover { background: #f8f3e81a; }
.camera-toolbar .effects-active { color: #efc681; background: #efc68114; }
.camera-toolbar button:disabled { opacity: 0.45; cursor: default; }
.camera-toolbar button:focus-visible { outline: var(--focus-width) solid #efc681; outline-offset: -2px; }
.camera-toolbar button > .iconify { width: 19px; height: 19px; }
.camera-toolbar output { padding-block: 3px; font-size: 11px; font-variant-numeric: tabular-nums; }
.garden-help-card { max-width: min(290px, calc(100vw - 90px)); padding: 18px; border-radius: 12px; background: #fffcf5; color: #244b3b; font-size: 13px; line-height: 1.7; }
.garden-help-card p + p { margin-top: 12px; }
@media (max-width: 600px) { .camera-toolbar { top: calc(12px + env(safe-area-inset-top)); right: calc(12px + env(safe-area-inset-right)); } }
@media (max-height: 500px) { .camera-toolbar { grid-template-columns: repeat(2, 44px); width: 92px; } .camera-toolbar output { grid-column: 1 / -1; grid-row: 2; } }
@media (max-height: 450px) and (min-width: 600px) { .camera-toolbar { grid-template-columns: repeat(3, 44px); width: 136px; } }
</style>

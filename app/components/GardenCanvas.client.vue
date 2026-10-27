<script setup lang="ts">
import { Application, Container, Graphics } from 'pixi.js'
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

const props = withDefaults(defineProps<{ gardenId?: GardenId, memorials?: PublicMemorial[], focusId?: string, canCreate?: boolean, editing?: boolean }>(), { memorials: () => [], focusId: undefined, gardenId: undefined, canCreate: false, editing: false })
const emit = defineEmits<{ select: [id: GardenId], create: [place: number] }>()
const { t, locale } = useI18n()
const { seed: sessionSeed } = useGardenSession()
const { fullscreen, supported: fullscreenSupported, busy: fullscreenBusy, toggleFullscreen } = useGardenFullscreen()
const host = ref<HTMLDivElement>()
const viewport = ref<HTMLDivElement>()
const modalOpen = ref(false)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const cameraEnabled = computed(() => state.value === 'ready' && !!props.gardenId && !modalOpen.value && !props.editing)
const { camera, interacting, dragging, reset, resize, zoomTo, reveal, pointerDown, pointerMove, pointerUp, clickCapture, wheel, keydown } = useGardenCamera(viewport, cameraEnabled)
const world = shallowRef({ width: 1000, height: 650 })
const projection = shallowRef(getGardenProjection(1000, 650, 1000, 650))
const visibleChunks = ref(0)
const surroundingPlants = ref(0)
const surroundingBounds = shallowRef<GardenView>()
const surroundingTransform = reactive({ scale: 0, x: 0, y: 0 })
const overviewPlaces = computed(() => getGardenOverviewLayout(world.value.width, world.value.height))
let application: Application | undefined
let observer: ResizeObserver | undefined
let disposed = false
let attempt = 0
let frame = 0
let intersection: IntersectionObserver | undefined
let motionQuery: MediaQueryList | undefined
let animate: ((time: number) => void) | undefined
let sceneRoot: Application['stage'] | undefined
let surroundings: Container | undefined
let surroundingKey = ''
let updateVisibility: ((view: GardenView) => number) | undefined
let rendered: { app: Application, width: number, height: number, gardenId?: GardenId, locale: string, memorials: PublicMemorial[], seed: number } | undefined
let elapsed = 0
const paused = ref(false)
const reducedMotion = ref(false)
const inView = ref(true)
const visible = ref(true)
const moving = computed(() => state.value === 'ready' && !paused.value && !reducedMotion.value && !modalOpen.value && !props.editing && inView.value && visible.value)

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
    applyCamera()
    return
  }
  const scene = createGardenScene(worldW, worldH, findDemoGarden(props.gardenId), t, id => emit('select', id), props.memorials)
  for (const child of application.stage.removeChildren()) {
    if (child !== surroundings) child.destroy({ children: true, context: true })
  }
  if (surroundings) application.stage.addChild(surroundings)
  application.stage.addChild(scene.root)
  updateSurroundings(width, height)
  sceneRoot = scene.root
  updateVisibility = scene.updateVisibility
  applyCamera()
  animate = scene.update
  scene.update(elapsed)
  application.canvas.setAttribute('aria-label', props.gardenId ? `${t('garden.territoryLabel', { name: t(`garden.names.${props.gardenId}`) })} ${t(`garden.landscapes.${props.gardenId}`)}. ${t(`garden.life.${props.gardenId}`)}` : t('garden.mapLabel'))
  application.render()
  rendered = { app: application, width: worldW, height: worldH, gardenId: props.gardenId, locale: locale.value, memorials: props.memorials, seed: sessionSeed.value }
}

function scheduleRender() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => { application?.render() })
}

async function start() {
  const currentAttempt = ++attempt
  state.value = 'loading'
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
    })
    // Hover feedback also renders when ambient motion is paused.
    app.stage.on('pointerover', scheduleRender)
    app.stage.on('pointerout', scheduleRender)
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
    updateVisibility = undefined
    animate = undefined
    if (!disposed && currentAttempt === attempt) state.value = 'error'
  }
}

watch(() => props.gardenId, () => { reset(); modalOpen.value = false; render() })
watch(locale, render)
watch(() => props.memorials, render)
watch(sessionSeed, () => { reset(); modalOpen.value = false; render() })
watch(camera, applyCamera, { flush: 'sync' })
watch(moving, syncMotion)
onMounted(() => {
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
  animate = undefined
  sceneRoot = undefined
  surroundings = undefined
  updateVisibility = undefined
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
    :data-state="state"
    :data-motion="moving ? 'running' : 'paused'"
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
    <div ref="host" class="canvas-host" />
    <div
      v-if="state === 'ready' && gardenId"
      class="garden-frame"
      data-testid="garden-frame"
      data-frame-style="seamless"
      aria-hidden="true"
      :style="{ width: `${projection.width}px`, height: `${projection.height}px`, transform: `translate(${projection.offsetX + camera.x}px, ${projection.offsetY + camera.y}px) scale(${camera.zoom})` }"
    />
    <nav v-if="state === 'ready' && !gardenId" class="garden-choices" :aria-label="t('garden.choose')" data-testid="garden-choices">
      <button
        v-for="place in overviewPlaces"
        :key="place.garden.id"
        type="button"
        class="garden-choice"
        :data-testid="`garden-choice-${place.garden.id}`"
        :aria-label="t(`garden.names.${place.garden.id}`)"
        :style="{ left: `${place.x / world.width * 100}%`, top: `${place.y / world.height * 100}%`, width: `${place.width / world.width * 100}%`, height: `${place.height / world.height * 100}%` }"
        @click="emit('select', place.garden.id)"
      />
    </nav>
    <GardenMemorials v-if="state === 'ready' && gardenId" :key="`${gardenId}:${sessionSeed}`" :garden-id="gardenId" :width="world.width" :height="world.height" :projection="projection" :camera="camera" :interacting="interacting" :saved="memorials" :focus-id="focusId" :can-create="canCreate && !editing" @modal="modalOpen = $event" @reveal="reveal" @create="emit('create', $event)" />
    <div v-if="state !== 'ready'" class="canvas-state">
      <AppState
        :kind="state === 'error' ? 'error' : 'loading'"
        :title="t(`garden.${state === 'error' ? 'error' : 'loading'}`)"
        :description="t(state === 'error' ? 'garden.errorHint' : 'garden.loadingHint')"
        retry
        @retry="start"
      />
    </div>
  </div>
  <div v-if="state === 'ready' && gardenId" class="camera-toolbar" role="group" :aria-label="t('garden.camera.controls')">
    <button type="button" :aria-label="t('garden.camera.in')" :title="t('garden.camera.in')" :disabled="camera.zoom >= 4 || editing || modalOpen" data-testid="garden-zoom-in" @click="zoomTo(camera.zoom * 1.25)"><UIcon name="i-lucide-plus" aria-hidden="true" /></button>
    <output :aria-label="t('garden.camera.scale')">{{ Math.round(camera.zoom * 100) }}%</output>
    <button type="button" :aria-label="t('garden.camera.out')" :title="t('garden.camera.out')" :disabled="camera.zoom <= 1 || editing || modalOpen" data-testid="garden-zoom-out" @click="zoomTo(camera.zoom / 1.25)"><UIcon name="i-lucide-minus" aria-hidden="true" /></button>
    <button type="button" :aria-label="t('garden.camera.reset')" :title="t('garden.camera.reset')" :disabled="editing || modalOpen" data-testid="garden-camera-reset" @click="reset"><UIcon name="i-lucide-rotate-ccw" aria-hidden="true" /></button>
    <button type="button" :aria-label="t(fullscreen ? 'garden.camera.exitFullscreen' : 'garden.camera.fullscreen')" :title="t(!fullscreenSupported ? 'garden.camera.fullscreenUnavailable' : fullscreen ? 'garden.camera.exitFullscreen' : 'garden.camera.fullscreen')" :aria-pressed="fullscreen" :disabled="!fullscreenSupported || fullscreenBusy" data-testid="garden-fullscreen" @click="toggleFullscreen"><UIcon :name="fullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'" aria-hidden="true" /></button>
    <button v-if="!reducedMotion" type="button" :aria-pressed="paused" :aria-label="t(paused ? 'garden.resumeMotion' : 'garden.pauseMotion')" :title="t(paused ? 'garden.resumeMotion' : 'garden.pauseMotion')" data-testid="garden-motion" @click="paused = !paused"><UIcon :name="paused ? 'i-lucide-play' : 'i-lucide-pause'" aria-hidden="true" /></button>
    <UPopover :content="{ side: 'left', align: 'start', sideOffset: 12 }">
      <button type="button" :aria-label="t('garden.camera.instructions')" :title="t('garden.camera.instructions')" data-testid="garden-help"><UIcon name="i-lucide-circle-help" aria-hidden="true" /></button>
      <template #content><div class="garden-help-card"><p>{{ t('garden.camera.help') }}</p><p>{{ t('creation.mapHint') }}</p><p v-if="reducedMotion">{{ t('garden.reducedMotion') }}</p></div></template>
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
.garden-choices { position: absolute; inset: 0; pointer-events: none; }
.garden-choice { position: absolute; border: 3px solid transparent; border-radius: 28px; background: transparent; cursor: pointer; pointer-events: auto; }
.garden-choice:hover, .garden-choice:focus-visible { border-color: #efc681; outline: none; box-shadow: inset 0 0 0 1px #142e2e; }
.canvas-host :deep(canvas) { position: absolute; inset: 0; display: block; width: 100%; height: 100%; touch-action: pan-y; }
.canvas-state { position: absolute; inset: 0; display: grid; place-items: center; background: var(--garden-cream); }
.camera-enabled :deep(canvas) { touch-action: none; }
.camera-toolbar { position: absolute; z-index: 3; top: calc(20px + env(safe-area-inset-top)); right: calc(20px + env(safe-area-inset-right)); display: grid; justify-items: center; width: 48px; padding: 2px; color: #f8f3e8; background: #173d34ed; border: 1px solid #e4dcc33d; border-radius: 18px; box-shadow: 0 8px 28px #0c282b35; backdrop-filter: blur(16px); }
.camera-toolbar button { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 13px; cursor: pointer; }
.camera-toolbar button:hover { background: #f8f3e81a; }
.camera-toolbar button:disabled { opacity: 0.45; cursor: default; }
.camera-toolbar button:focus-visible { outline: 2px solid #efc681; outline-offset: -3px; }
.camera-toolbar button > .iconify { width: 19px; height: 19px; }
.camera-toolbar output { padding-block: 3px; font-size: 11px; font-variant-numeric: tabular-nums; }
.garden-help-card { max-width: min(290px, calc(100vw - 90px)); padding: 18px; border-radius: 18px; background: #fffcf5; color: #244b3b; font-size: 13px; line-height: 1.7; }
.garden-help-card p + p { margin-top: 12px; }
@media (max-width: 600px) { .camera-toolbar { top: calc(12px + env(safe-area-inset-top)); right: calc(12px + env(safe-area-inset-right)); } }
@media (max-height: 450px) and (min-width: 600px) { .camera-toolbar { grid-template-columns: repeat(2, 44px); width: 92px; } .camera-toolbar output { grid-column: 1 / -1; grid-row: 2; } }
</style>

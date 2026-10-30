<script setup lang="ts">
import { Application, Container, Graphics, RenderTexture, Sprite } from 'pixi.js'
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
import { createGardenSceneTransition } from '../utils/gardenSceneTransition'
import type { GardenTransitionFocus, GardenTransitionTransform, GardenTransitionDirection } from '../utils/gardenSceneTransition'
import { getGardenSceneFrame } from '../utils/gardenSceneFrame'
import type { GardenSceneFrame } from '../utils/gardenSceneFrame'

type SceneTarget = { kind: 'overview' | 'garden' | 'memorial', gardenId?: GardenId, memorialId?: string }

const props = withDefaults(defineProps<{ gardenId?: GardenId, memorials?: PublicMemorial[], placesState?: 'loading' | 'ready' | 'error', focusId?: string, canCreate?: boolean, editing?: boolean, fullscreen?: boolean }>(), { memorials: () => [], placesState: 'ready', focusId: undefined, gardenId: undefined, canCreate: false, editing: false, fullscreen: false })
const emit = defineEmits<{ select: [id: GardenId], create: [place: number], ready: [value: boolean], displayed: [id?: GardenId], cancel: [id?: GardenId], detail: [open: boolean], retry: [], toggleFullscreen: [] }>()
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
const controller = createGardenSceneTransition<SceneTarget>()
const transition = shallowRef(controller.state)
const transitionPhase = computed(() => transition.value.phase)
const displayedGarden = ref<GardenId>()
const displayedRecords = shallowRef(props.memorials)
const activeGarden = ref(props.gardenId)
const snapshotReady = ref(false)
const viewportSize = reactive({ width: 1000, height: 650 })
const drawingFrame = shallowRef(getGardenSceneFrame(1000, 650, false))
const presentationStyle = computed(() => ({
  transform: `matrix(${transition.value.transform.scale}, 0, 0, ${transition.value.transform.scale}, ${transition.value.transform.x * viewportSize.width}, ${transition.value.transform.y * viewportSize.height})`,
  filter: transition.value.blur ? `blur(${transition.value.blur}px)` : 'none',
  '--drawing-width': `${drawingFrame.value.width}px`, '--drawing-height': `${drawingFrame.value.height}px`,
  '--drawing-left': `${-drawingFrame.value.margin.x}px`, '--drawing-top': `${-drawingFrame.value.margin.y}px`
}))
const sceneTint = computed(() => ({ meadow: '#214535', lake: '#163b40', grove: '#193c30', hill: '#2d483c' })[transition.value.requested?.gardenId ?? 'meadow'])
const tintOpacity = computed(() => transition.value.cover * (transitionPhase.value === 'preparing' && hasFrame.value && !snapshotReady.value ? 1 : .2))
const hasFrame = ref(false)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const sceneReady = ref(false)
const dataReady = computed(() => !props.gardenId || props.placesState === 'ready')
const isReady = computed(() => state.value === 'ready' && sceneReady.value)
const viewState = computed(() => state.value === 'error' || transitionPhase.value === 'error' ? 'error' : interactive.value ? 'ready' : 'loading')
const loadingSteps = computed(() => state.value !== 'ready' ? 0 : !dataReady.value ? 1 : !sceneReady.value ? 2 : 3)
const loadingPhase = computed(() => state.value !== 'ready' ? 'opening' : !dataReady.value ? 'stories' : 'places')
const visualBusy = computed(() => !interactive.value)
const returningFromMemorial = computed(() => transition.value.source?.kind === 'memorial' && transition.value.requested?.kind !== 'memorial')
const interactive = computed(() => isReady.value && transition.value.interactive)
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
let transitionFrame = 0
let loaderTimer: ReturnType<typeof setTimeout> | undefined
let restoringSource = false
let sourceFocusId: string | undefined
let sourceCamera = { zoom: 1, x: 0, y: 0 }
let restoreCamera: typeof sourceCamera | undefined
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
let detailFrame = 0
let retainedFrame: { texture: RenderTexture, sprite: Sprite, exit: GardenTransitionTransform, frame: GardenSceneFrame } | undefined
const paused = ref(false)
const reducedMotion = ref(false)
const inView = ref(true)
const visible = ref(true)
const effectsEnabled = ref(true)
const effectsSupported = ref(true)
const weather = computed(() => !displayedGarden.value || !effectsEnabled.value || !effectsSupported.value ? 'none' : ({ meadow: 'sun', lake: 'rain', grove: 'canopy', hill: 'clouds' } as const)[displayedGarden.value])
const moving = computed(() => interactive.value && !paused.value && !reducedMotion.value && (!modalOpen.value || !!detailMemorial.value) && !props.editing && inView.value && visible.value)

watch(interactive, value => emit('ready', value), { immediate: true })

function mapTarget(id = props.gardenId): SceneTarget { return { kind: id ? 'garden' : 'overview', gardenId: id } }
function sameTarget(a: SceneTarget | undefined, b: SceneTarget) { return a?.kind === b.kind && a.gardenId === b.gardenId && a.memorialId === b.memorialId }

function directionFor(target: SceneTarget): GardenTransitionDirection {
  const source = controller.state.displayed
  const rank = { overview: 0, garden: 1, memorial: 2 }
  if (source && rank[target.kind] < rank[source.kind]) return 'backward'
  if (source?.kind === 'garden' && target.kind === 'garden' && source.gardenId !== target.gardenId) return 'lateral'
  return 'forward'
}

function disposeRetainedFrame() {
  retainedFrame?.sprite.removeFromParent()
  retainedFrame?.sprite.destroy()
  retainedFrame?.texture.destroy(true)
  retainedFrame = undefined
  snapshotReady.value = false
}

function captureRetainedFrame() {
  if (!application || !hasFrame.value || state.value !== 'ready') return
  const { width, height } = application.renderer.screen
  const texture = RenderTexture.create({ width, height, resolution: Math.min(1, 1024 / Math.max(width, height)), antialias: false })
  try {
    // One bounded GPU copy on the existing renderer; no readback or extra canvas.
    application.renderer.render({ container: application.stage, target: texture, clear: true })
    disposeRetainedFrame()
    const sprite = new Sprite(texture)
    sprite.eventMode = 'none'
    retainedFrame = { texture, sprite, exit: { ...controller.state.transform }, frame: drawingFrame.value }
    application.stage.addChild(sprite)
    snapshotReady.value = true
  } catch {
    texture.destroy(true)
    // Preparation still has an opaque fallback if snapshotting is unsupported.
  }
}

function syncRetainedFrame() {
  if (!application || !retainedFrame) return
  const current = controller.state
  if (current.phase === 'idle') { disposeRetainedFrame(); return }
  const { sprite, frame } = retainedFrame
  const view = current.transform
  const exit = current.phase === 'revealing' ? retainedFrame.exit : view
  const { viewWidth: width, viewHeight: height } = drawingFrame.value
  const sx = width / frame.viewWidth * exit.scale / view.scale
  const sy = height / frame.viewHeight * exit.scale / view.scale
  sprite.scale.set(sx, sy)
  sprite.position.set((exit.x - view.x) * width / view.scale - frame.margin.x * sx, (exit.y - view.y) * height / view.scale - frame.margin.y * sy)
  sprite.alpha = current.phase === 'revealing' ? current.cover : 1
  if (application.stage.children.at(-1) !== sprite) application.stage.addChild(sprite)
}

function resizeRenderer(width: number, height: number) {
  if (!application) return
  const next = getGardenSceneFrame(width, height, !!activeGarden.value)
  if (application.renderer.screen.width === next.width && application.renderer.screen.height === next.height && drawingFrame.value.viewWidth === next.viewWidth && drawingFrame.value.viewHeight === next.viewHeight) return
  drawingFrame.value = next
  application.stage.position.set(next.margin.x, next.margin.y)
  application.renderer.resize(next.width, next.height)
  syncRetainedFrame()
  if (retainedFrame) paintFrame(true)
}

function revealPrepared(token: number) {
  if (retainedFrame) retainedFrame.exit = { ...controller.state.transform }
  controller.markPrepared(token, performance.now())
  advanceTransition()
}

function focusForGarden(id?: GardenId): GardenTransitionFocus {
  if (!rendered?.gardenId && id) {
    const tile = overviewPlaces.value.find(place => place.garden.id === id)
    if (tile) return { x: (tile.x + tile.width / 2) / world.value.width, y: (tile.y + tile.height / 2) / world.value.height, scale: 1.8 }
  }
  return { x: .5, y: .5, scale: 1.18 }
}

function publishTransition() {
  transition.value = controller.state
  syncRetainedFrame()
  const current = transition.value
  if (current.requested?.kind === 'memorial') detailState.value = current.phase === 'idle' ? 'ready' : current.phase === 'revealing' ? 'entering' : 'preparing'
  else if (current.phase === 'idle') detailState.value = 'none'
  if (current.phase === 'idle' && current.displayed) emit('displayed', current.displayed.gardenId)
  if (current.phase === 'idle') restoringSource = false
}

function advanceTransition() {
  cancelAnimationFrame(transitionFrame)
  clearTimeout(loaderTimer)
  if (disposed) return
  const now = performance.now()
  let current = controller.update(now)
  const target = current.requested
  if (target && state.value === 'ready' && current.phase !== 'idle') {
    if (target.kind === 'memorial' || (target.gardenId === props.gardenId && dataReady.value)) controller.markDataReady(current.token, now)
    else if (target.gardenId === props.gardenId && props.placesState === 'error') controller.fail(current.token, now)
  }
  current = controller.state
  if (current.canPrepare && controller.beginPreparation(current.token, now)) {
    const token = current.token
    // Keep the cached source above generation until the target's first paint.
    prepareFrame = requestAnimationFrame(() => {
      prepareFrame = requestAnimationFrame(() => {
        if (disposed || token !== controller.state.token) return
        prepareFrame = 0
        prepareSafely(() => {
          if (target?.kind === 'memorial') syncDetail(token)
          else {
            if (rendered?.gardenId !== target?.gardenId) reset()
            disposeDetail()
            detailMemorial.value = undefined
            emit('detail', false)
            renderScene()
            if (restoreCamera) {
              Object.assign(camera, restoreCamera)
              restoreCamera = undefined
              drawFrame()
            }
          }
        })
      })
    })
  }
  publishTransition()
  if (transitionPhase.value === 'revealing' || transitionPhase.value === 'idle') prepareSafely(drawFrame)
  if (transitionPhase.value === 'approaching' || transitionPhase.value === 'revealing') transitionFrame = requestAnimationFrame(advanceTransition)
  else if ((transitionPhase.value === 'waiting' || transitionPhase.value === 'preparing') && !transition.value.showLoader) loaderTimer = setTimeout(advanceTransition, 165)
}

function requestScene(target: SceneTarget, focus = focusForGarden(target.gardenId), skipApproach = false) {
  if (controller.state.phase === 'idle') {
    sourceFocusId = document.activeElement?.getAttribute('data-testid') ?? undefined
    sourceCamera = { ...camera }
  }
  cancelAnimationFrame(prepareFrame)
  cancelAnimationFrame(readyFrame)
  cancelAnimationFrame(detailFrame)
  cancelAnimationFrame(frame)
  cancelAnimationFrame(overviewFrame)
  renderRevision++
  detailRevision++
  application?.stop()
  captureRetainedFrame()
  controller.request(target, { now: performance.now(), hasFrame: hasFrame.value, reducedMotion: reducedMotion.value, focus, skipApproach, direction: directionFor(target) })
  advanceTransition()
}

function chooseGarden(id: GardenId) {
  requestScene(mapTarget(id))
  emit('select', id)
}

function cancelTransition() {
  if (!visualBusy.value || !hasFrame.value || restoringSource) return
  if (detailMemorial.value) { memorialLayer.value?.closeDetail(); return }
  const source = transition.value.source
  if (!source) return
  // Closing the story already dismissed its UI. A second Escape skips the
  // remaining return animation, rather than restoring a close-up without it.
  if (returningFromMemorial.value) {
    if (controller.state.phase !== 'revealing') requestScene(controller.state.requested ?? mapTarget(), undefined, true)
    controller.setReducedMotion(true, performance.now())
    advanceTransition()
    return
  }
  cancelAnimationFrame(prepareFrame)
  cancelAnimationFrame(readyFrame)
  cancelAnimationFrame(detailFrame)
  renderRevision++
  if (rendered?.gardenId === source.gardenId) {
    controller.cancel(performance.now())
    sceneReady.value = true
    publishTransition()
    drawFrame()
  } else { restoringSource = true; restoreCamera = { ...sourceCamera }; requestScene(source, undefined, true) }
  emit('cancel', source.gardenId)
  const focusId = sourceFocusId
  if (focusId) nextTick(() => requestAnimationFrame(() => {
    if (!disposed && controller.state.phase === 'idle' && (document.activeElement === document.body || document.activeElement?.matches('h1'))) document.querySelector<HTMLElement>(`[data-testid="${focusId}"]`)?.focus({ preventScroll: true })
  }))
}

function transitionKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && visualBusy.value && hasFrame.value && !document.querySelector('[data-testid="garden-header"] [aria-expanded="true"]')) { event.preventDefault(); event.stopPropagation(); cancelTransition() }
}

function disposeDetail() {
  detailRevision++
  cancelAnimationFrame(detailFrame)
  detailFrame = 0
  detailScene?.root.removeFromParent()
  detailScene?.destroy()
  detailScene = undefined
  detailGeometry.value = undefined
  if (sceneRoot) { sceneRoot.visible = true; sceneRoot.alpha = 1 }
  if (surroundings) { surroundings.visible = true; surroundings.alpha = 1 }
  detailState.value = 'none'
}

function syncDetail(token = controller.state.token) {
  if (!application || !host.value || !detailMemorial.value || !props.gardenId) return
  const width = host.value.clientWidth, height = host.value.clientHeight
  resizeRenderer(width, height)
  const memorial = detailMemorial.value
  disposeDetail()
  detailState.value = 'preparing'
  detailSteps.value = 0
  const revision = detailRevision
  const current = () => !disposed && token === controller.state.token && revision === detailRevision && detailMemorial.value?.id === memorial.id
  // The approach has finished. Only the old composition moved; this stone
  // starts grounded at its final transform behind the retained source frame.
  if (!current()) return
  prepareSafely(() => {
    const scene = createGardenMemorialScene(width, height, props.gardenId!, memorial.place, drawingFrame.value.margin)
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
          revealPrepared(token)
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
  if (memorial) {
    const point = getMemorialLayout(world.value.width, world.value.height, memorial.gardenId, displayedRecords.value).places.find(place => place.memorial?.id === memorial.id)
    const scale = projection.value.scale * camera.zoom
    const focus = point ? { x: (projection.value.offsetX + camera.x + point.x * scale) / viewportSize.width, y: (projection.value.offsetY + camera.y + point.y * scale) / viewportSize.height, scale: 1.85 } : { x: .5, y: .5, scale: 1.5 }
    requestScene({ kind: 'memorial', gardenId: memorial.gardenId, memorialId: memorial.id }, focus, !!props.focusId && !interactive.value)
  }
  else if (state.value === 'error') disposeDetail()
  else if (controller.state.requested?.kind !== 'memorial' && controller.state.phase !== 'idle') return
  else if (controller.state.phase !== 'idle' && controller.state.source?.kind !== 'memorial') {
    controller.cancel(performance.now())
    disposeDetail()
    publishTransition()
    // A resize may already have expanded the backing while the source camera
    // still uses its former viewport. Reconcile the map before dropping cover.
    prepareSafely(renderScene)
  }
  else {
    detailState.value = 'returning'
    requestScene(mapTarget(displayedGarden.value), { x: .5, y: .5, scale: 1.1 })
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
  if (!activeGarden.value) {
    atmosphere?.destroy()
    atmosphere = undefined
    return
  }
  if (!atmosphere && effectsEnabled.value && effectsSupported.value) {
    let candidate: ReturnType<typeof createGardenAtmosphere> | undefined
    try {
      candidate = createGardenAtmosphere(width, height, activeGarden.value)
      if (!candidate.prepare(application.renderer as WebGLRenderer)) throw new Error('Atmospheric shader unavailable')
      atmosphere = candidate
    } catch {
      candidate?.destroy()
      effectsSupported.value = false
    }
  }
  if (!atmosphere) return
  atmosphere.setGarden(activeGarden.value)
  atmosphere.resize(width, height, drawingFrame.value.margin)
  atmosphere.setFocus(!!detailScene, detailScene?.layout.visual)
  atmosphere.setView(detailScene?.atmosphereView ?? { x: projection.value.offsetX + camera.x, y: projection.value.offsetY + camera.y, scale: projection.value.scale * camera.zoom })
  atmosphere.setEnabled(effectsEnabled.value && effectsSupported.value)
  atmosphere.update(elapsed)
  if (application.stage.children.at(-1) !== atmosphere.root) application.stage.addChild(atmosphere.root)
  syncRetainedFrame()
}

function toggleEffects() {
  effectsEnabled.value = !effectsEnabled.value
  try { localStorage.setItem('petmemoreal_garden_effects', effectsEnabled.value ? 'on' : 'off') } catch { /* The current visit still keeps the preference when storage is unavailable. */ }
}

function drawFrame() { paintFrame() }

function paintFrame(force = false) {
  if (!application || disposed || state.value === 'error') return
  if (!force && (transitionPhase.value === 'approaching' || transitionPhase.value === 'waiting' || transitionPhase.value === 'error')) return
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
    controller.fail(controller.state.token, performance.now())
    publishTransition()
  }
}

function finishScene() {
  cancelAnimationFrame(readyFrame)
  const snapshot = rendered
  const revision = renderRevision
  const token = controller.state.token
  readyFrame = requestAnimationFrame(() => {
    if (!disposed && revision === renderRevision && snapshot && rendered === snapshot && dataReady.value && snapshot.gardenId === props.gardenId && snapshot.memorials === props.memorials && snapshot.locale === locale.value) {
      hasFrame.value = true
      sceneReady.value = true
      displayedGarden.value = snapshot.gardenId
      displayedRecords.value = snapshot.memorials
      revealPrepared(token)
    }
  })
}

async function retry() {
  if (props.placesState === 'error') emit('retry')
  await nextTick()
  requestScene(mapTarget(), undefined, true)
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
  const { margin } = drawingFrame.value
  visibleChunks.value = updateVisibility?.({ left: (-margin.x - x) / scale, top: (-margin.y - y) / scale, right: (host.value.clientWidth + margin.x - x) / scale, bottom: (host.value.clientHeight + margin.y - y) / scale }) ?? 0
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
  const { margin } = drawingFrame.value
  const bounds = getGardenEnvironmentBounds(width + margin.x * 2, height + margin.y * 2, { ...projection.value, offsetX: projection.value.offsetX + margin.x, offsetY: projection.value.offsetY + margin.y })
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
  if (!host.value || disposed) return
  Object.assign(viewportSize, { width: host.value.clientWidth, height: host.value.clientHeight })
  if (!application || state.value === 'error') return
  if (controller.state.phase !== 'idle') { prepareSafely(() => resizeRenderer(host.value!.clientWidth, host.value!.clientHeight)); advanceTransition(); return }
  if (!dataReady.value && rendered?.gardenId === props.gardenId) return
  if (rendered && rendered.gardenId === props.gardenId && rendered.memorials !== props.memorials && JSON.stringify(rendered.memorials) === JSON.stringify(props.memorials)) {
    rendered.memorials = props.memorials
    displayedRecords.value = props.memorials
  }
  const changed = !rendered || rendered.gardenId !== props.gardenId || rendered.locale !== locale.value || rendered.memorials !== props.memorials || rendered.seed !== sessionSeed.value
  if (changed) { requestScene(mapTarget(), undefined, true); return }
  if (detailMemorial.value) requestScene({ kind: 'memorial', gardenId: displayedGarden.value, memorialId: detailMemorial.value.id }, undefined, true)
  else prepareSafely(renderScene)
}

function renderScene() {
  if (!application || !host.value || disposed) return
  if (!dataReady.value) { sceneReady.value = false; return }
  activeGarden.value = props.gardenId
  const width = host.value.clientWidth
  const height = host.value.clientHeight
  if (!width || !height) return
  const scale = Math.min(width / (width < 600 ? 640 : 1000), height / (width < 600 ? 840 : 650))
  const fixed = props.gardenId ? getGardenWorldSize(props.gardenId) : undefined
  const worldW = fixed?.width ?? Math.round(width / scale)
  const worldH = fixed?.height ?? Math.round(height / scale)
  projection.value = getGardenProjection(width, height, worldW, worldH, props.gardenId ? 16 : 0)
  resize(width, height, projection.value.width, projection.value.height)
  resizeRenderer(width, height)
  if (world.value.width !== worldW || world.value.height !== worldH) world.value = { width: worldW, height: worldH }
  // Viewport changes move the camera, retaining the same world and cached chunks.
  if (rendered?.app === application && rendered.width === worldW && rendered.height === worldH
    && rendered.gardenId === props.gardenId && rendered.locale === locale.value && rendered.memorials === props.memorials && rendered.seed === sessionSeed.value) {
    updateSurroundings(width, height)
    syncAtmosphere(width, height)
    applyCamera()
    disposeDetail()
    animate?.(elapsed)
    drawFrame()
    if (!sceneReady.value || controller.state.phase === 'preparing') finishScene()
    return
  }
  disposeDetail()
  const scene = createGardenScene(worldW, worldH, findDemoGarden(props.gardenId), t, props.memorials)
  for (const child of application.stage.removeChildren()) {
    if (child !== surroundings && child !== atmosphere?.root && child !== retainedFrame?.sprite) child.destroy({ children: true, context: true })
  }
  if (surroundings) application.stage.addChild(surroundings)
  application.stage.addChild(scene.root)
  if (retainedFrame) application.stage.addChild(retainedFrame.sprite)
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
    disposeRetainedFrame()
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
    render()
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

watch(() => props.gardenId, () => {
  const target = mapTarget()
  if (!sameTarget(controller.state.requested, target)) requestScene(target)
  overviewHovered.value = undefined
  modalOpen.value = false
  render()
})
watch(locale, render)
watch(() => props.memorials, () => {
  if (controller.state.phase === 'preparing' && controller.state.requested?.kind !== 'memorial') requestScene(mapTarget(), undefined, true)
  else render()
})
watch(() => props.placesState, render)
watch(sessionSeed, () => { modalOpen.value = false; requestScene(mapTarget(), undefined, true) })
watch(camera, applyCamera, { flush: 'sync' })
watch(moving, syncMotion)
watch(effectsEnabled, () => { syncAtmosphere(); drawFrame() })
watch(reducedMotion, value => { controller.setReducedMotion(value, performance.now()); advanceTransition() })
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
  document.addEventListener('keydown', transitionKeydown, true)
  intersection = new IntersectionObserver(([entry]) => { inView.value = entry?.isIntersecting ?? false })
  requestScene(mapTarget(), undefined, true)
  start()
})
onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  intersection?.disconnect()
  motionQuery?.removeEventListener('change', readMotion)
  document.removeEventListener('visibilitychange', readVisibility)
  document.removeEventListener('keydown', transitionKeydown, true)
  cancelAnimationFrame(frame)
  cancelAnimationFrame(readyFrame)
  cancelAnimationFrame(overviewFrame)
  cancelAnimationFrame(prepareFrame)
  cancelAnimationFrame(transitionFrame)
  clearTimeout(loaderTimer)
  disposeDetail()
  disposeRetainedFrame()
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
    :data-transition-direction="transition.direction"
    :data-retained-frame="snapshotReady"
    :data-drawing-width="drawingFrame.width"
    :data-drawing-height="drawingFrame.height"
    :data-drawing-margin-x="drawingFrame.margin.x"
    :data-drawing-margin-y="drawingFrame.margin.y"
    :data-transition-token="transition.token"
    :data-displayed-garden="displayedGarden ?? 'overview'"
    :data-requested-garden="transition.requested?.gardenId ?? 'overview'"
    :data-transition-scale="transition.transform.scale"
    :data-transition-x="transition.transform.x * viewportSize.width"
    :data-transition-y="transition.transform.y * viewportSize.height"
    :data-transition-blur="transition.blur"
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
    <div ref="host" class="canvas-host" :class="{ 'canvas-hidden': !hasFrame }" :style="presentationStyle" />
    <div
      v-if="isReady && gardenId"
      class="garden-frame"
      data-testid="garden-frame"
      data-frame-style="seamless"
      aria-hidden="true"
      :style="{ width: `${projection.width}px`, height: `${projection.height}px`, transform: `translate(${projection.offsetX + camera.x}px, ${projection.offsetY + camera.y}px) scale(${camera.zoom})` }"
    />
    <nav v-if="interactive && !displayedGarden" class="garden-choices" :aria-label="t('garden.choose')" data-testid="garden-choices">
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
        @click="chooseGarden(place.garden.id)"
      >
        <span class="garden-choice-caption">
          <span class="garden-choice-title">{{ t(`garden.names.${place.garden.id}`) }}<UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></span>
          <span :id="`garden-description-${place.garden.id}`" class="garden-choice-description">{{ t(`garden.overview.${place.garden.id}`) }}</span>
        </span>
      </button>
    </nav>
    <GardenMemorials v-if="isReady && displayedGarden" :key="`${displayedGarden}:${sessionSeed}`" ref="memorialLayer" :garden-id="displayedGarden" :width="world.width" :height="world.height" :projection="projection" :camera="camera" :interacting="interacting" :blocked="!interactive" :detail-ready="detailState === 'ready'" :saved="displayedRecords" :focus-id="gardenId === displayedGarden ? focusId : undefined" :can-create="canCreate && !editing" :paused="paused" :reduced-motion="reducedMotion" :effects-enabled="effectsEnabled" :effects-supported="effectsSupported" @modal="modalOpen = $event" @detail="displayDetail" @pause="paused = !paused" @effects="toggleEffects" @reveal="reveal" @create="emit('create', $event)" />
    <div v-if="visualBusy" class="canvas-state" data-testid="scene-veil" :data-kind="detailMemorial ? 'memorial' : 'garden'" :style="{ '--scene-cover': tintOpacity, '--scene-tint': sceneTint }">
      <AppState
        v-if="viewState === 'error'"
        kind="error"
        :title="t(placesState === 'error' ? 'garden.dataError.title' : 'garden.error')"
        :description="t(placesState === 'error' ? 'garden.dataError.description' : 'garden.errorHint')"
        retry
        @retry="retry"
      />
      <div v-else class="scene-preparing">
        <GardenLoading v-if="transition.showLoader" :kind="detailMemorial ? 'memorial' : 'garden'" :completed="detailMemorial ? detailSteps : loadingSteps" :phase="detailMemorial ? detailSteps < 1 ? 'opening' : detailSteps < 2 ? 'stories' : 'places' : loadingPhase" />
      </div>
      <button v-if="hasFrame" type="button" class="scene-cancel" data-testid="scene-cancel" @click="cancelTransition">{{ t(returningFromMemorial ? 'garden.skipTransition' : 'garden.cancelTransition') }}<UIcon name="i-lucide-arrow-left" aria-hidden="true" /></button>
    </div>
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
.canvas-host { position: absolute; inset: 0; transform-origin: 0 0; }
.canvas-hidden { visibility: hidden; }
.canvas-wrapper :deep(.memorial-detail-layer) { transition: opacity 240ms ease; }
.canvas-wrapper:not([data-transition='idle']):not([data-transition='revealing']) :deep(.memorial-detail-layer) { opacity: 0; pointer-events: none; }
.garden-choices { position: absolute; inset: 0; pointer-events: none; }
.garden-choice { position: absolute; border: 0; border-radius: var(--panel-radius); background: transparent; cursor: pointer; pointer-events: auto; text-align: left; color: var(--garden-control-text); }
.garden-choice:focus-visible { outline: var(--focus-width) solid var(--color-lantern-300); outline-offset: var(--focus-offset); }
.garden-choice-caption { position: absolute; left: 10px; right: 10px; bottom: 10px; display: grid; gap: 8px; padding: 16px 18px; border-radius: var(--control-radius); background: var(--garden-control-bg); }
.garden-choice-title { display: flex; justify-content: space-between; align-items: center; gap: 8px; font: 30px/1.15 var(--font-display); }
.garden-choice-title .iconify { width: 18px; height: 18px; flex-shrink: 0; color: var(--color-lantern-200); transition: transform 160ms ease; }
.garden-choice-description { min-height: 42px; font-size: 14px; line-height: 1.5; color: var(--color-garden-100); }
.garden-choice:hover .garden-choice-title .iconify { transform: translate(2px, -2px); }
.garden-choice:active .garden-choice-caption { background: var(--color-garden-900); }
.canvas-host :deep(canvas) { position: absolute; left: var(--drawing-left); top: var(--drawing-top); display: block; width: var(--drawing-width); height: var(--drawing-height); touch-action: pan-y; }
.canvas-state { position: absolute; inset: 0; z-index: calc(var(--garden-detail-layer) + 1); display: grid; place-items: center; color: #f8f3e8; --ui-primary: #efc681; --focus-color: #efc681; cursor: default; }
.canvas-state::before { content: ''; position: absolute; inset: 0; background: var(--scene-tint, #173c32); opacity: var(--scene-cover, 1); pointer-events: none; }
.canvas-state > * { position: relative; }
.scene-preparing { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; max-height: 100%; padding: 16px; }
.scene-preparing :deep(.garden-loading) { min-height: 0; flex-shrink: 1; }
.canvas-state > .scene-cancel { position: absolute; top: 20px; left: 20px; display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 10px 16px; border-radius: var(--control-radius); color: var(--garden-cream); background: #14372fe6; font-size: 13px; cursor: pointer; }
.scene-cancel:hover { background: var(--garden-control-hover); }
.scene-cancel:focus-visible { outline: var(--focus-width) solid var(--color-lantern-300); outline-offset: var(--focus-offset); }
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
@media (prefers-reduced-motion: reduce) { .garden-choice-title .iconify, .canvas-wrapper :deep(.memorial-detail-layer) { transition: none; } }
</style>

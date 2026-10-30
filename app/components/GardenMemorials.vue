<script setup lang="ts">
import { getMemorialLayout } from '../data/demoMemorials'
import type { GardenMemorial } from '../data/demoMemorials'
import type { GardenId } from '../data/demoGardens'
import type { PublicMemorial } from '../../shared/memorials'
import { getMonumentKind } from '../data/monuments'
import type { GardenProjection } from '../utils/gardenProjection'

const props = withDefaults(defineProps<{ gardenId: GardenId, width: number, height: number, projection: GardenProjection, camera: { zoom: number, x: number, y: number }, interacting: boolean, blocked?: boolean, detailReady?: boolean, saved: PublicMemorial[], focusId?: string, canCreate: boolean, paused: boolean, reducedMotion: boolean, effectsEnabled: boolean, effectsSupported: boolean }>(), { blocked: false, detailReady: true, focusId: undefined })
const emit = defineEmits<{ modal: [open: boolean], detail: [memorial: GardenMemorial | undefined], pause: [], effects: [], reveal: [x: number, y: number, halfWidth: number, halfHeight: number], create: [place: number] }>()
const { t } = useI18n()
const layout = computed(() => getMemorialLayout(props.width, props.height, props.gardenId, props.saved))
const selected = shallowRef<GardenMemorial>()
const open = ref(false)
const previewId = ref<string>()
const suppressedPreview = ref<string>()
let previewMode: 'hover' | 'pinned' | 'keyboard' | undefined
let hoverTimer: ReturnType<typeof setTimeout> | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined
let trigger: HTMLButtonElement | undefined
let activation: { memorial: GardenMemorial, keyboard: boolean, trigger: HTMLButtonElement } | undefined
let restoringFocus = false
let pendingRestore: string | undefined

function stoneElement(id: string) {
  return document.querySelector<HTMLButtonElement>(`[data-testid="memorial-${id}"]`)
}

function clearPreviewTimers() {
  clearTimeout(hoverTimer)
  clearTimeout(closeTimer)
}

function closePreview(suppress = false) {
  clearPreviewTimers()
  if (suppress && previewId.value) suppressedPreview.value = previewId.value
  previewId.value = undefined
  previewMode = undefined
}

watch(open, value => {
  closePreview()
  suppressedPreview.value = selected.value?.id
  emit('modal', value)
}, { flush: 'sync' })
watch([open, selected], ([value, memorial]) => emit('detail', value ? memorial : undefined), { flush: 'sync' })
watch(() => props.interacting, value => { if (value) closePreview(true) }, { flush: 'sync' })
watch(() => props.blocked, (blocked) => {
  if (blocked) closePreview(true)
  else if (pendingRestore) restoreMarkerFocus()
})
watch(() => props.detailReady, (ready) => { if (ready && open.value) focusDetailClose() })
watch(layout, value => {
  if (previewId.value && !value.places.some(place => place.memorial?.id === previewId.value)) closePreview()
  if (selected.value?.source !== 'saved') return
  const current = value.places.find(place => place.memorial?.id === selected.value?.id)?.memorial
  if (current?.source === 'saved') selected.value = current
  else { open.value = false; selected.value = undefined }
})

function show(memorial: GardenMemorial) {
  if (props.interacting || props.blocked) return
  trigger = stoneElement(memorial.id) ?? undefined
  selected.value = memorial
  open.value = true
}

function prepareActivation(memorial: GardenMemorial, event: MouseEvent) {
  // Keep the native popover trigger (and its generated ARIA relationships),
  // while distinguishing an intentional activation from outside dismissal.
  activation = { memorial, keyboard: event.detail === 0, trigger: event.currentTarget as HTMLButtonElement }
}

function activatePreview(action: NonNullable<typeof activation>) {
  if (open.value || props.interacting) return
  const { memorial, keyboard } = action
  clearPreviewTimers()
  suppressedPreview.value = undefined
  trigger = action.trigger
  if (!keyboard && previewId.value === memorial.id && previewMode === 'pinned') {
    closePreview(true)
    return
  }
  previewMode = keyboard ? 'keyboard' : 'pinned'
  previewId.value = memorial.id
  if (keyboard) focusPreview(memorial.id)
}

function focusPreview(id: string) {
  nextTick(() => {
    if (previewId.value === id && !open.value) document.getElementById(`summary-${id}`)?.focus({ preventScroll: true })
  })
}

function hoverPreview(id: string, event: PointerEvent) {
  if (event.pointerType !== 'mouse' || !window.matchMedia('(any-hover: hover)').matches || open.value || props.interacting || suppressedPreview.value === id) return
  clearTimeout(hoverTimer)
  if (previewId.value === id) {
    clearTimeout(closeTimer)
    return
  }
  hoverTimer = setTimeout(() => {
    if (open.value || props.interacting || suppressedPreview.value === id) return
    clearTimeout(closeTimer)
    previewMode = 'hover'
    previewId.value = id
  }, 180)
}

function leavePreview(id: string, event: PointerEvent) {
  if (event.pointerType !== 'mouse') return
  clearTimeout(hoverTimer)
  if (!open.value && suppressedPreview.value === id) suppressedPreview.value = undefined
  if (previewId.value !== id || previewMode !== 'hover') return
  clearTimeout(closeTimer)
  closeTimer = setTimeout(() => {
    if (previewId.value === id && previewMode === 'hover') closePreview()
  }, 220)
}

function resumePreview(id: string, event: PointerEvent) {
  if (event.pointerType !== 'mouse' || !window.matchMedia('(any-hover: hover)').matches || (!event.movementX && !event.movementY) || open.value || props.interacting || suppressedPreview.value !== id) return
  suppressedPreview.value = undefined
  hoverPreview(id, event)
}

function previewContent(id: string) {
  return {
    side: 'top' as const, sideOffset: 10, collisionPadding: 16,
    prioritizePosition: true, sticky: 'always' as const,
    'data-memorial-preview': '',
    onOpenAutoFocus: (event: Event) => {
      event.preventDefault()
      if (previewMode === 'keyboard') focusPreview(id)
    },
    onCloseAutoFocus: (event: Event) => event.preventDefault(),
    onEscapeKeyDown: (event: KeyboardEvent) => {
      event.preventDefault()
      closePreview(true)
      stoneElement(id)?.focus({ preventScroll: true })
    },
    onPointerenter: () => clearPreviewTimers(),
    onPointerleave: (event: PointerEvent) => leavePreview(id, event)
  }
}

function setPreviewOpen(id: string, value: boolean) {
  const action = activation
  activation = undefined
  if (action?.memorial.id === id) activatePreview(action)
  else if (!value && previewId.value === id) closePreview(true)
}

function revealFocused(event: FocusEvent, x: number, y: number) {
  // Pointer focus must not move a stone between pressing and releasing it.
  if (restoringFocus || (event.currentTarget as HTMLButtonElement).matches(':active')) return
  emit('reveal', x, y, 45 / props.width, 50 / props.height)
}

function restoreFocus(event: Event) {
  event.preventDefault()
  pendingRestore = selected.value?.id
  if (!props.blocked) restoreMarkerFocus()
}

function restoreMarkerFocus() {
  const id = pendingRestore
  nextTick(() => {
    const active = document.activeElement
    // An action taken in the header while the dialog is closing must keep its focus.
    if (active && active !== document.body && !active.closest('.memorial-story-card, .scene-preparing')) { pendingRestore = undefined; return }
    const target = id ? stoneElement(id) : trigger
    if (target?.isConnected) {
      restoringFocus = true
      target.focus({ preventScroll: true })
      restoringFocus = false
    }
    pendingRestore = undefined
  })
}

function focusDetail(event: Event) {
  event.preventDefault()
  if (props.detailReady) focusDetailClose()
  else nextTick(() => document.querySelector<HTMLButtonElement>('[data-testid="scene-cancel"]')?.focus({ preventScroll: true }))
}

function focusDetailClose() {
  nextTick(() => { if (open.value) document.querySelector<HTMLButtonElement>('.memorial-detail-layer .memorial-close')?.focus({ preventScroll: true }) })
}

// Nuxt UI forwards additional content attributes to the native dialog node.
const detailContent = computed(() => ({
  onCloseAutoFocus: restoreFocus,
  onOpenAutoFocus: focusDetail,
  onInteractOutside: (event: Event) => {
    const target = (event as CustomEvent<{ originalEvent: Event }>).detail?.originalEvent?.target
    // The preparation cancel button belongs to this view, although its veil
    // sits outside the dialog so the waiting content can stay entirely inert.
    if (target instanceof Element && target.closest('.scene-preparing')) event.preventDefault()
  },
  inert: !props.detailReady,
  'aria-hidden': !props.detailReady || undefined
}))
defineExpose({ closeDetail: () => { open.value = false } })

function name(memorial: GardenMemorial) { return memorial.source === 'saved' ? memorial.name : t(`garden.pets.${memorial.profile}`) }
function quote(memorial: GardenMemorial) { return memorial.source === 'saved' ? memorial.story : t(`memorial.profiles.${memorial.profile}.quote`) }
function years(memorial: GardenMemorial) { return `${memorial.born} — ${memorial.died}` }

let revealedId = ''
watch([() => props.focusId, layout], async () => {
  if (!props.focusId || props.focusId === revealedId) return
  const memorial = layout.value.places.find(place => place.memorial?.id === props.focusId)?.memorial
  if (!memorial) return
  await nextTick()
  const button = stoneElement(memorial.id)
  if (!button) return
  revealedId = memorial.id
  trigger = button
  button.focus({ preventScroll: true })
  selected.value = memorial
  open.value = true
}, { immediate: true, flush: 'post' })
onBeforeUnmount(() => { clearPreviewTimers(); emit('detail', undefined); emit('modal', false) })
</script>

<template>
  <div class="memorial-controls" role="group" :inert="open || blocked" :aria-hidden="open || blocked || undefined" :aria-label="t('memorial.places')" :style="{ width: `${projection.width}px`, height: `${projection.height}px`, transform: `translate(${projection.offsetX + camera.x}px, ${projection.offsetY + camera.y}px) scale(${camera.zoom})` }">
    <div v-for="place in layout.places" :key="place.place" class="memorial-position" :data-world-x="place.x" :data-world-y="place.y" :data-chunk-id="place.chunkId" :style="{ left: `${place.x / width * 100}%`, top: `${(place.y + 5) / height * 100}%`, width: `${90 / width * 100}%`, height: `${100 / height * 100}%` }">
      <UPopover v-if="place.memorial" :open="previewId === place.memorial.id && !open && !interacting" :modal="false" :content="previewContent(place.memorial.id)" :ui="{ content: 'memorial-preview h-auto w-80 max-w-[calc(100vw-32px)] p-0 bg-[var(--surface-panel)] text-[var(--ui-text-highlighted)] rounded-[var(--panel-radius)] shadow-xl ring-1 ring-[var(--ui-border)]' }" @update:open="setPreviewOpen(place.memorial.id, $event)">
        <button
          type="button"
          class="memorial-hit"
          :data-testid="`memorial-${place.memorial.id}`"
          :data-monument-kind="getMonumentKind(gardenId, place.place)"
          :aria-label="t('memorial.preview', { name: name(place.memorial), years: years(place.memorial), place: place.memorial.place })"
          @focus="revealFocused($event, place.x / width, (place.y + 5) / height)"
          @pointerenter="hoverPreview(place.memorial.id, $event)"
          @pointerleave="leavePreview(place.memorial.id, $event)"
          @pointermove="resumePreview(place.memorial.id, $event)"
          @click.capture="prepareActivation(place.memorial, $event)"
        />
        <template #content>
          <button :id="`summary-${place.memorial.id}`" type="button" class="memorial-summary" data-testid="memorial-summary" :aria-label="t('memorial.readStory', { name: name(place.memorial) })" aria-haspopup="dialog" @click="show(place.memorial)" @focus="previewMode = 'keyboard'">
            <span class="memorial-summary-heading">
              <span class="memorial-summary-emblem" aria-hidden="true"><PetSpeciesIcon :species="place.memorial.species" /></span>
              <span class="memorial-summary-title"><strong>{{ name(place.memorial) }}</strong><span>{{ t(`memorial.species.${place.memorial.species}`) }} · {{ years(place.memorial) }}</span></span>
            </span>
            <span class="memorial-summary-quote">{{ quote(place.memorial) }}</span>
            <span class="memorial-summary-action">{{ t('memorial.hint') }}<UIcon name="i-lucide-arrow-right" aria-hidden="true" /></span>
          </button>
        </template>
      </UPopover>
      <UTooltip v-else :text="t('creation.addAt', { place: place.place })" :disabled="interacting || !canCreate">
        <button
          :id="`empty-${gardenId}-${place.place}`"
          type="button"
          class="memorial-hit memorial-empty"
          :data-testid="`empty-${gardenId}-${place.place}`"
          :aria-label="t('creation.addAt', { place: place.place })"
          :disabled="!canCreate"
          @focus="revealFocused($event, place.x / width, (place.y + 5) / height)"
          @click="emit('create', place.place)"
        />
      </UTooltip>
    </div>
  </div>
  <UModal
    v-if="selected"
    v-model:open="open"
    class="memorial-story-card memorial-detail-layer"
    :title="name(selected)"
    :description="`${t(`memorial.species.${selected.species}`)} · ${years(selected)}`"
    :modal="false"
    :overlay="false"
    :portal="false"
    :transition="false"
    fullscreen
    :content="detailContent"
    :ui="{ content: 'absolute z-[var(--garden-detail-layer)] bg-transparent rounded-none ring-0 shadow-none' }"
  >
    <template #content>
      <GardenMemorialDetail :memorial="selected" :paused="paused" :reduced-motion="reducedMotion" :effects-enabled="effectsEnabled" :effects-supported="effectsSupported" @close="open = false" @pause="emit('pause')" @effects="emit('effects')" />
    </template>
  </UModal>
</template>

<style scoped>
.memorial-controls { position: absolute; inset: 0; pointer-events: none; transform-origin: 0 0; }
.memorial-position { position: absolute; transform: translate(-50%, -50%); min-width: 44px; min-height: 44px; }
.memorial-hit { display: block; width: 100%; height: 100%; min-height: 44px; border-radius: 18px; pointer-events: auto; cursor: pointer; touch-action: none; border: 0; background: transparent; }
.memorial-hit:focus-visible { outline: 2px solid #fff5d9; outline-offset: 2px; background: #f2c9851a; }
.memorial-empty:disabled { cursor: wait; }
.memorial-summary { width: 100%; max-height: calc(100dvh - 32px); padding: 20px; display: grid; gap: 16px; white-space: normal; overflow-wrap: anywhere; overflow-y: auto; line-height: 1.5; text-align: left; cursor: pointer; border-radius: var(--panel-radius); touch-action: manipulation; }
.memorial-summary:hover { background: var(--garden-cream); }
.memorial-summary:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: -4px; }
.memorial-summary-heading { display: flex; align-items: start; gap: 12px; }
.memorial-summary-title { display: grid; min-width: 0; gap: 3px; }
.memorial-summary strong { font: 26px/1.2 var(--font-display); color: var(--ui-text-highlighted); }
.memorial-summary-title > span { font-size: 14px; color: var(--ui-text-muted); }
.memorial-summary-emblem { width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--control-radius); background: var(--color-garden-100); color: var(--color-garden-800); flex-shrink: 0; }
.memorial-summary-emblem > * { width: 24px; height: 24px; }
.memorial-summary-quote { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font: italic 18px/1.55 var(--font-display); color: var(--ui-text); }
.memorial-summary-action { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding-top: 14px; border-top: 1px solid var(--ui-border); font-size: 14px; font-weight: 600; color: var(--color-garden-800); }
.memorial-summary-action > * { flex-shrink: 0; width: 18px; height: 18px; }
</style>

<style>
.memorial-preview { animation: none !important; }
/* A persistent, non-modal view fills only the owning map stage. */
.memorial-detail-layer { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; transform: none; overflow: hidden; }
</style>

<script setup lang="ts">
import { getMemorialLayout } from '../data/demoMemorials'
import type { GardenMemorial } from '../data/demoMemorials'
import type { GardenId } from '../data/demoGardens'
import type { PublicMemorial } from '../../shared/memorials'
import { getMonumentKind } from '../data/monuments'
import type { GardenProjection } from '../utils/gardenProjection'

const props = defineProps<{ gardenId: GardenId, width: number, height: number, projection: GardenProjection, camera: { zoom: number, x: number, y: number }, interacting: boolean, saved: PublicMemorial[], focusId?: string, canCreate: boolean }>()
const emit = defineEmits<{ modal: [open: boolean], reveal: [x: number, y: number, halfWidth: number, halfHeight: number], create: [place: number] }>()
const { t } = useI18n()
const localePath = useLocalePath()
const layout = computed(() => getMemorialLayout(props.width, props.height, props.gardenId, props.saved))
const selected = shallowRef<GardenMemorial>()
const open = ref(false)
const previewId = ref<string>()
const suppressedPreview = ref<string>()
let trigger: HTMLButtonElement | undefined
watch(open, value => {
  previewId.value = undefined
  suppressedPreview.value = selected.value?.id
  emit('modal', value)
}, { flush: 'sync' })
watch(() => props.interacting, value => { if (value) previewId.value = undefined })
watch(layout, value => {
  if (selected.value?.source !== 'saved') return
  const current = value.places.find(place => place.memorial?.id === selected.value?.id)?.memorial
  if (current?.source === 'saved') selected.value = current
  else { open.value = false; selected.value = undefined }
})

function show(memorial: GardenMemorial, event: MouseEvent) {
  trigger = event.currentTarget as HTMLButtonElement
  selected.value = memorial
  open.value = true
}

function togglePreview(id: string, value: boolean) {
  if (!value) {
    if (previewId.value === id) previewId.value = undefined
  } else if (!open.value && !props.interacting && suppressedPreview.value !== id) previewId.value = id
}

function leavePreview(id: string) {
  if (previewId.value === id) previewId.value = undefined
  // Restoring modal focus must not reopen the tooltip. A fresh hover or keyboard
  // visit becomes available after the user actually leaves this place.
  if (!open.value && suppressedPreview.value === id) suppressedPreview.value = undefined
}

function resumePreview(id: string, event: PointerEvent) {
  if (event.pointerType !== 'mouse' || (!event.movementX && !event.movementY) || open.value || props.interacting || suppressedPreview.value !== id) return
  suppressedPreview.value = undefined
  previewId.value = id
}

function revealFocused(event: FocusEvent, x: number, y: number) {
  // Pointer focus must not move a stone between pressing and releasing it.
  if ((event.currentTarget as HTMLButtonElement).matches(':active')) return
  emit('reveal', x, y, 45 / props.width, 50 / props.height)
}

function restoreFocus(event: Event) {
  event.preventDefault()
  const id = selected.value?.id
  nextTick(() => {
    const active = document.activeElement
    // An action taken in the header while the dialog is closing must keep its focus.
    if (active && active !== document.body && !active.closest('.memorial-story-card')) return
    const target = id ? document.getElementById(`stone-${id}`) : trigger
    if (target?.isConnected) target.focus({ preventScroll: true })
  })
}

function name(memorial: GardenMemorial) { return memorial.source === 'saved' ? memorial.name : t(`garden.pets.${memorial.profile}`) }
function quote(memorial: GardenMemorial) { return memorial.source === 'saved' ? `${memorial.story.slice(0, 140)}${memorial.story.length > 140 ? '…' : ''}` : t(`memorial.profiles.${memorial.profile}.quote`) }
function years(memorial: GardenMemorial) { return `${memorial.born} — ${memorial.died}` }

let revealedId = ''
watch([() => props.focusId, layout], async () => {
  if (!props.focusId || props.focusId === revealedId) return
  const memorial = layout.value.places.find(place => place.memorial?.id === props.focusId)?.memorial
  if (!memorial) return
  await nextTick()
  const button = document.getElementById(`stone-${memorial.id}`) as HTMLButtonElement | null
  if (!button) return
  revealedId = memorial.id
  trigger = button
  button.focus({ preventScroll: true })
  selected.value = memorial
  open.value = true
}, { immediate: true, flush: 'post' })
</script>

<template>
  <div class="memorial-controls" role="group" :aria-label="t('memorial.places')" :style="{ width: `${projection.width}px`, height: `${projection.height}px`, transform: `translate(${projection.offsetX + camera.x}px, ${projection.offsetY + camera.y}px) scale(${camera.zoom})` }">
    <div v-for="place in layout.places" :key="place.place" class="memorial-position" :data-world-x="place.x" :data-world-y="place.y" :data-chunk-id="place.chunkId" :style="{ left: `${place.x / width * 100}%`, top: `${(place.y + 5) / height * 100}%`, width: `${90 / width * 100}%`, height: `${100 / height * 100}%` }">
      <UTooltip v-if="place.memorial" :open="previewId === place.memorial.id && !open && !interacting" :delay-duration="180" disable-hoverable-content :disabled="open || interacting" :content="{ side: 'top', collisionPadding: 16 }" :ui="{ content: 'memorial-preview pointer-events-none h-auto max-w-72 p-0 bg-[#fffcf5] text-[#244b3b] rounded-[12px] shadow-xl ring-1 ring-[#dcd9c7]' }" @update:open="togglePreview(place.memorial.id, $event)">
        <button
          :id="`stone-${place.memorial.id}`"
          type="button"
          class="memorial-hit"
          :data-testid="`memorial-${place.memorial.id}`"
          :data-monument-kind="getMonumentKind(gardenId, place.place)"
          :aria-label="t('memorial.open', { name: name(place.memorial), years: years(place.memorial), place: place.memorial.place })"
          aria-haspopup="dialog"
          @focus="revealFocused($event, place.x / width, (place.y + 5) / height)"
          @blur="leavePreview(place.memorial.id)"
          @pointerleave="leavePreview(place.memorial.id)"
          @pointermove="resumePreview(place.memorial.id, $event)"
          @click="show(place.memorial, $event)"
        />
        <template #content>
          <div class="memorial-summary" data-testid="memorial-summary">
            <div class="memorial-summary-heading">
              <span class="memorial-summary-emblem" aria-hidden="true"><PetSpeciesIcon :species="place.memorial.species" /></span>
              <div><strong>{{ name(place.memorial) }}</strong><span>{{ t(`memorial.species.${place.memorial.species}`) }} · {{ years(place.memorial) }}</span></div>
            </div>
            <p>{{ quote(place.memorial) }}</p>
            <small>{{ t('memorial.hint') }}<UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></small>
          </div>
        </template>
      </UTooltip>
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
    class="memorial-story-card"
    :title="name(selected)"
    :description="`${t(`memorial.species.${selected.species}`)} · ${years(selected)}`"
    :content="{ onCloseAutoFocus: restoreFocus }"
    :ui="{ overlay: 'bg-[#0e2728]/65 backdrop-blur-sm', content: 'bg-[#fffcf5] rounded-[var(--panel-radius)] max-w-xl ring-1 ring-[#d8d5c3]/60', header: 'block p-6 sm:p-7', wrapper: 'w-full', title: 'font-normal', description: 'mt-3', body: 'p-6 sm:p-8', footer: 'p-4 sm:px-8 gap-4 justify-between' }"
  >
    <template #title>
      <span class="memorial-dedication" aria-hidden="true">{{ t('memorial.inMemory') }}</span>
      <span class="memorial-emblem" aria-hidden="true"><PetSpeciesIcon :species="selected.species" /></span>
      <span class="memorial-name">{{ name(selected) }}</span>
    </template>
    <template #close><UButton class="memorial-close absolute top-3 end-3" icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="t('memorial.close')" /></template>
    <template #body>
      <div class="memorial-details">
        <div class="memorial-location-row">
          <p class="memorial-location"><UIcon name="i-lucide-sprout" aria-hidden="true" />{{ t('memorial.location', { garden: t(`garden.names.${selected.gardenId}`), place: selected.place }) }}</p>
          <UButton v-if="selected.source === 'saved' && selected.canEdit" class="memorial-edit" :to="localePath(`/memorials/${selected.id}/edit`)" icon="i-lucide-pencil" color="primary" variant="soft" :aria-label="t('editing.edit')" :title="t('editing.edit')" data-testid="memorial-edit" />
        </div>
        <p v-if="selected.source === 'saved'" class="memorial-creator" data-testid="memorial-creator"><UIcon :name="selected.creatorName ? 'i-lucide-user-round' : 'i-lucide-user-round-minus'" aria-hidden="true" /><span>{{ t('memorial.creator') }} <strong>{{ selected.creatorName ?? t('memorial.anonymous') }}</strong></span></p>
        <blockquote v-if="selected.source === 'demo'"><UIcon name="i-lucide-heart" aria-hidden="true" /><p>{{ quote(selected) }}</p></blockquote>
        <section class="memorial-story"><h3>{{ t('memorial.story') }}</h3><p class="whitespace-pre-line">{{ selected.source === 'saved' ? selected.story : t(`memorial.profiles.${selected.profile}.story`) }}</p></section>
        <section v-if="selected.source === 'demo'" class="memorial-favorite"><UIcon name="i-lucide-sun" aria-hidden="true" /><div><h3>{{ t('memorial.favorite') }}</h3><p>{{ t(`memorial.profiles.${selected.profile}.favorite`) }}</p></div></section>
        <p v-if="selected.source === 'demo'" class="memorial-demo"><UIcon name="i-lucide-info" aria-hidden="true" />{{ t('memorial.demo') }}</p>
      </div>
    </template>
    <template #footer>
      <span class="memorial-keepsake"><UIcon name="i-lucide-leaf" aria-hidden="true" />{{ t('memorial.remembered') }}</span>
      <UButton class="memorial-return" icon="i-lucide-arrow-left" color="primary" @click="open = false">{{ t('memorial.back') }}</UButton>
    </template>
  </UModal>
</template>

<style scoped>
.memorial-controls { position: absolute; inset: 0; pointer-events: none; transform-origin: 0 0; }
.memorial-position { position: absolute; transform: translate(-50%, -50%); min-width: 44px; min-height: 44px; }
.memorial-hit { display: block; width: 100%; height: 100%; min-height: 44px; border-radius: 18px; pointer-events: auto; cursor: pointer; touch-action: none; border: 0; background: transparent; }
.memorial-hit:focus-visible { outline: 2px solid #fff5d9; outline-offset: 2px; background: #f2c9851a; }
.memorial-empty:disabled { cursor: wait; }
.memorial-summary { padding: 18px; display: grid; gap: 14px; white-space: normal; line-height: 1.5; }
.memorial-summary-heading { display: flex; align-items: center; gap: 12px; }
.memorial-summary-heading > div { display: grid; gap: 3px; }
.memorial-summary strong { font: 24px Georgia, serif; color: #213e36; }
.memorial-summary-heading > div > span { font-size: 12px; color: #586b5e; }
.memorial-summary-emblem { width: 42px; height: 48px; display: grid; place-items: center; border-radius: 24px 24px 12px 12px; background: #e8ecdf; color: #315d46; flex-shrink: 0; }
.memorial-summary-emblem > * { width: 24px; height: 24px; }
.memorial-summary p { font: italic 17px/1.55 Georgia, serif; color: #4c5e55; }
.memorial-summary small { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 12px; border-top: 1px solid #e5dfcf; font-size: 12px; color: #526451; }
.memorial-summary small > * { flex-shrink: 0; }
.memorial-dedication { display: block; margin: 0 28px 18px; color: #ecd4a9; font: 10px/1.5 'Segoe UI', sans-serif; letter-spacing: 2px; text-transform: uppercase; }
.memorial-emblem { width: 72px; height: 82px; display: grid; place-items: center; margin: 0 auto 16px; background: linear-gradient(145deg, #fbefd4, #d9dfc7); color: #315d46; border: 1px solid #f3ddb1; border-radius: 40px 40px 18px 18px; box-shadow: 0 0 0 6px #edcf8d0d, 0 0 36px #edcf8d24; }
.memorial-emblem > * { width: 38px; height: 38px; }
.memorial-name { display: block; font: 40px/1.1 Georgia, serif; overflow-wrap: anywhere; }
.memorial-details { display: grid; gap: 24px; line-height: 1.8; color: #4c5e55; overflow-wrap: anywhere; }
.memorial-location { display: flex; align-items: center; justify-content: center; gap: 8px; text-align: center; font-size: 12px; color: #62715d; }
.memorial-location > * { flex-shrink: 0; width: 16px; height: 16px; }
.memorial-location-row { display: flex; align-items: center; gap: 12px; }
.memorial-location-row .memorial-location { flex: 1; min-width: 0; }
.memorial-edit { flex: 0 0 44px; display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid #d5ddc9; border-radius: var(--control-radius); background: #edf0e3; color: #315d46; }
.memorial-edit:hover { background: #dfe7d3; }
.memorial-edit:focus-visible { outline: var(--focus-width) solid #c99d51; outline-offset: var(--focus-offset); }
.memorial-creator { display: flex; align-items: start; gap: 10px; padding: 12px 16px; border: 1px solid #e7dfca; border-radius: 12px; background: #f8f3e8; font-size: 13px; }
.memorial-creator > .iconify { flex-shrink: 0; width: 18px; height: 18px; margin-top: 3px; color: #62715d; }
.memorial-creator strong { font-weight: 500; color: #244b3b; }
blockquote { padding: 0 12px 24px; border-bottom: 1px solid #e6deca; font: italic 24px/1.5 Georgia, serif; color: #315d46; text-align: center; }
blockquote > .iconify { display: block; width: 18px; height: 18px; margin: 0 auto 12px; color: #a67b3c; }
h3 { font: 23px/1.3 Georgia, serif; color: #213e36; margin-bottom: 10px; }
.memorial-story p, .memorial-favorite p { font-size: 15px; }
.memorial-favorite { display: flex; align-items: start; gap: 14px; padding: 20px; border-radius: 12px; background: #f1eedf; border: 1px solid #e7dfca; }
.memorial-favorite > .iconify { flex-shrink: 0; width: 22px; height: 22px; margin-top: 2px; color: #997437; }
.memorial-favorite h3 { font-size: 21px; margin-bottom: 8px; }
.memorial-demo { display: flex; align-items: start; gap: 8px; font-size: 12px; line-height: 1.6; color: #6c7467; }
.memorial-demo > * { flex-shrink: 0; margin-top: 2px; width: 14px; height: 14px; }
.memorial-keepsake { display: flex; align-items: center; gap: 7px; font: italic 14px Georgia, serif; color: #62715d; }
@media (max-width: 480px) {
  .memorial-details { gap: 20px; }
  blockquote { padding-inline: 0; font-size: 22px; }
  .memorial-favorite { padding: 16px; gap: 10px; }
  .memorial-keepsake { display: none; }
}
</style>

<style>
/* Previews are descriptive only; they must not block neighboring stones. */
[data-reka-popper-content-wrapper]:has(.memorial-preview) { pointer-events: none; }
/* The dialog is portalled; scope its surface styles by the component class. */
.memorial-story-card [data-slot='header'] { position: relative; flex-shrink: 0; text-align: center; border: 0; background: linear-gradient(#163b36de, #132f2af2), url('/images/34a7d373-ee89-4a01-a2e3-7fc7b31039c3.jpg') center 45% / cover; }
.memorial-story-card [data-slot='title'] { color: #fff8e8; }
.memorial-story-card [data-slot='description'] { color: #d6ddc9; font-size: 13px; }
.memorial-story-card [data-slot='footer'] { flex-shrink: 0; border-color: #e6deca; background: #f8f3e8; }
.memorial-story-card .memorial-close { width: 44px; height: 44px; display: grid; place-items: center; border: 1px solid #d9e3ca35; border-radius: var(--control-radius); background: #183e35; color: #fff8e8; }
.memorial-story-card .memorial-close:hover { background: #315c49; }
.memorial-story-card .memorial-close:focus-visible { outline: var(--focus-width) solid #f2c179; outline-offset: var(--focus-offset); }
.memorial-story-card .memorial-return { min-height: 44px; padding: 12px 18px; justify-content: center; border-radius: var(--control-radius); background: #213e36; color: #fffaed; }
.memorial-story-card .memorial-return:hover { background: #315c49; }
@media (max-width: 480px) {
  .memorial-story-card .memorial-return { width: 100%; }
}
@media (max-height: 600px) {
  .memorial-story-card [data-slot='header'] { padding: 16px 60px; }
  .memorial-story-card .memorial-dedication, .memorial-story-card .memorial-emblem { display: none; }
  .memorial-story-card .memorial-name { font-size: 30px; }
  .memorial-story-card [data-slot='description'] { margin-top: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .memorial-story-card { animation: none !important; transition: none !important; }
}
</style>

<script setup lang="ts">
import type { GardenMemorial } from '../data/demoMemorials'

const props = defineProps<{
  memorial: GardenMemorial
  compact: boolean
  paused: boolean
  reducedMotion: boolean
  effectsEnabled: boolean
  effectsSupported: boolean
}>()
const emit = defineEmits<{ close: [], pause: [], effects: [] }>()
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const petName = computed(() => props.memorial.source === 'saved' ? props.memorial.name : t(`garden.pets.${props.memorial.profile}`))
const story = computed(() => props.memorial.source === 'saved' ? props.memorial.story : t(`memorial.profiles.${props.memorial.profile}.story`))
const years = computed(() => `${props.memorial.born} — ${props.memorial.died}`)
const weatherIcon = computed(() => ({ meadow: 'i-lucide-sun', lake: 'i-lucide-cloud-rain', grove: 'i-lucide-sun-medium', hill: 'i-lucide-cloud-sun' })[props.memorial.gardenId])
const weatherLabel = computed(() => t(!props.effectsSupported ? 'garden.effects.unavailable' : props.effectsEnabled ? 'garden.effects.disable' : 'garden.effects.enable'))
const expanded = ref(false)
const cardId = useId()
const expandButton = ref<HTMLButtonElement>()
const sharing = ref(false)
const shareButton = ref<{ $el: HTMLButtonElement }>()
const manualShareLink = ref('')
const shareLinkField = ref<HTMLElement>()
const shareLinkId = useId()
let shareRevision = 0
watch(() => props.compact, compact => { if (!compact) expanded.value = false })
watch(() => props.memorial.id, () => {
  shareRevision++
  sharing.value = false
  manualShareLink.value = ''
})
onBeforeUnmount(() => { shareRevision++ })

async function shareMemorial() {
  if (sharing.value) return
  const revision = ++shareRevision
  const url = new URL(localePath({ path: '/gardens', query: { garden: props.memorial.gardenId, memorial: props.memorial.id } }), window.location.origin).href
  const data = {
    url,
    title: t('memorial.sharing.title', { name: petName.value }),
    text: t('memorial.sharing.text', { name: petName.value, garden: t(`garden.names.${props.memorial.gardenId}`) })
  }
  sharing.value = true
  manualShareLink.value = ''
  try {
    if (navigator.share) {
      try {
        if (!navigator.canShare || navigator.canShare(data)) {
          await navigator.share(data)
          return
        }
      } catch (error) {
        // Dismissing the system sheet must not silently copy anything.
        if ((error as { name?: string } | null)?.name === 'AbortError') return
      }
    }
    if (revision !== shareRevision) return
    await navigator.clipboard.writeText(url)
    if (revision === shareRevision) toast.add({ title: t('memorial.sharing.copied'), icon: 'i-lucide-check', color: 'success' })
  } catch {
    if (revision !== shareRevision) return
    manualShareLink.value = url
    await nextTick()
    if (revision !== shareRevision) return
    const input = shareLinkField.value?.querySelector('input')
    input?.focus()
    input?.select()
  } finally {
    if (revision === shareRevision) {
      sharing.value = false
      await nextTick()
      if (revision === shareRevision && document.activeElement === document.body) shareButton.value?.$el.focus({ preventScroll: true })
    }
  }
}

function toggleCard() {
  expanded.value = !expanded.value
  nextTick(() => expandButton.value?.focus({ preventScroll: true }))
}

function collapseCard() {
  if (!expanded.value) return false
  expanded.value = false
  nextTick(() => expandButton.value?.focus({ preventScroll: true }))
  return true
}

defineExpose({ collapseCard })
</script>

<template>
  <div class="memorial-detail" :data-garden="memorial.gardenId" :data-expanded="expanded" data-testid="memorial-detail">
    <div class="memorial-detail-layout">
      <button type="button" class="memorial-return" :aria-label="t('memorial.back')" :title="t('memorial.back')" data-testid="memorial-detail-return" @click="emit('close')"><UIcon name="i-lucide-arrow-left" aria-hidden="true" /><span class="memorial-return-label">{{ t('memorial.back') }}</span><span class="memorial-return-label-compact">{{ t('memorial.backShort') }}</span></button>
      <section :inert="expanded" :aria-hidden="expanded || undefined" class="memorial-detail-visual" :aria-label="t('memorial.detail.scene', { garden: t(`garden.names.${memorial.gardenId}`) })" data-testid="memorial-detail-visual">
        <div class="memorial-detail-scene-header">
          <div class="memorial-detail-controls" role="group" :aria-label="t('memorial.detail.controls')">
            <button
              type="button"
              :aria-pressed="effectsEnabled && effectsSupported"
              :aria-label="weatherLabel"
              :title="weatherLabel"
              :disabled="!effectsSupported"
              :class="{ 'detail-toggle-active': effectsEnabled && effectsSupported }"
              :aria-describedby="!effectsSupported ? 'memorial-detail-weather-note' : undefined"
              data-testid="memorial-detail-effects"
              @click="emit('effects')"
            ><UIcon :name="weatherIcon" aria-hidden="true" /></button>
            <button
              v-if="!reducedMotion"
              type="button"
              :aria-pressed="paused"
              :aria-label="t(paused ? 'garden.resumeMotion' : 'garden.pauseMotion')"
              :title="t(paused ? 'garden.resumeMotion' : 'garden.pauseMotion')"
              :class="{ 'detail-toggle-active': paused }"
              data-testid="memorial-detail-motion"
              @click="emit('pause')"
            ><UIcon :name="paused ? 'i-lucide-play' : 'i-lucide-pause'" aria-hidden="true" /></button>
          </div>
        </div>
        <p v-if="!effectsSupported" id="memorial-detail-weather-note" class="memorial-detail-weather-note">{{ t('garden.effects.unavailable') }}</p>
      </section>
      <aside :id="cardId" class="memorial-detail-panel" :aria-label="t('memorial.detail.reading')">
        <button v-if="compact" ref="expandButton" type="button" class="memorial-expand" :aria-expanded="expanded" :aria-controls="cardId" :aria-label="t(expanded ? 'memorial.detail.collapseCard' : 'memorial.detail.expandCard')" :title="t(expanded ? 'memorial.detail.collapseCard' : 'memorial.detail.expandCard')" data-testid="memorial-detail-expand" @click="toggleCard"><UIcon :name="expanded ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" aria-hidden="true" /></button>
        <div class="memorial-detail-reading" data-testid="memorial-detail-reading" data-slot="body">
          <header class="memorial-detail-identity" data-slot="header">
            <p class="memorial-detail-dedication">{{ t('memorial.inMemory') }}</p>
            <span class="memorial-detail-emblem memorial-emblem" aria-hidden="true"><PetSpeciesIcon :species="memorial.species" /></span>
            <h1 class="memorial-name" :class="{ 'memorial-name-long': petName.length > 36 }">{{ petName }}</h1>
            <p class="memorial-detail-years" data-slot="description">{{ t(`memorial.species.${memorial.species}`) }} · {{ years }}</p>
            <div v-if="manualShareLink" ref="shareLinkField" class="memorial-share-fallback">
              <label :for="shareLinkId">{{ t('memorial.sharing.manual') }}</label>
              <UInput :id="shareLinkId" :model-value="manualShareLink" readonly class="w-full" :ui="{ base: 'text-base' }" :aria-describedby="`${shareLinkId}-hint`" data-testid="memorial-share-link" @focus="($event.target as HTMLInputElement).select()" />
              <p :id="`${shareLinkId}-hint`">{{ t('memorial.sharing.manualHint') }}</p>
            </div>
          </header>
          <div class="memorial-details">
            <div class="memorial-detail-location-row">
              <p class="memorial-detail-location memorial-location"><UIcon name="i-lucide-sprout" aria-hidden="true" />{{ t('memorial.location', { garden: t(`garden.names.${memorial.gardenId}`), place: memorial.place }) }}</p>
              <UButton v-if="memorial.source === 'saved' && memorial.canEdit" class="memorial-edit" :to="localePath(`/memorials/${memorial.id}/edit`)" icon="i-lucide-pencil" color="primary" variant="soft" :aria-label="t('editing.edit')" data-testid="memorial-edit">{{ t('memorial.edit') }}</UButton>
            </div>
            <p v-if="memorial.source === 'saved'" class="memorial-detail-creator" data-testid="memorial-creator"><UIcon :name="memorial.creatorName ? 'i-lucide-user-round' : 'i-lucide-user-round-minus'" aria-hidden="true" /><span>{{ t('memorial.creator') }} <strong>{{ memorial.creatorName ?? t('memorial.anonymous') }}</strong></span></p>
            <blockquote v-if="memorial.source === 'demo'"><UIcon name="i-lucide-heart" aria-hidden="true" /><p>{{ t(`memorial.profiles.${memorial.profile}.quote`) }}</p></blockquote>
            <section class="memorial-story"><h3>{{ t('memorial.story') }}</h3><p class="whitespace-pre-line">{{ story }}</p></section>
            <section v-if="memorial.source === 'demo'" class="memorial-detail-favorite memorial-favorite"><UIcon name="i-lucide-sun" aria-hidden="true" /><div><h3>{{ t('memorial.favorite') }}</h3><p>{{ t(`memorial.profiles.${memorial.profile}.favorite`) }}</p></div></section>
            <p v-if="memorial.source === 'demo'" class="memorial-detail-demo memorial-demo"><UIcon name="i-lucide-info" aria-hidden="true" />{{ t('memorial.demo') }}</p>
          </div>
        </div>
        <footer class="memorial-detail-footer" data-slot="footer">
          <UButton ref="shareButton" class="memorial-share" icon="i-lucide-share-2" color="primary" :loading="sharing" :disabled="sharing" :aria-busy="sharing" :aria-label="t('memorial.sharing.label', { name: petName })" data-testid="memorial-share" @click="shareMemorial">{{ t('memorial.sharing.button') }}</UButton>
        </footer>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.memorial-detail { container-type: size; width: 100%; height: 100%; min-height: 0; color: var(--ui-text); --detail-accent: var(--color-garden-400); }
.memorial-detail[data-garden='meadow'] { --detail-accent: var(--color-lantern-300); }
.memorial-detail[data-garden='lake'] { --detail-accent: var(--color-garden-200); }
.memorial-detail[data-garden='grove'] { --detail-accent: var(--color-garden-700); }
.memorial-detail-layout { position: relative; display: grid; grid-template-columns: clamp(320px, 34cqw, 440px) minmax(0, 1fr); width: 100%; height: 100%; min-height: 0; pointer-events: none; }
.memorial-detail-panel { position: relative; grid-column: 1; grid-row: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; margin: 24px; overflow: hidden; border: 1px solid var(--ui-border); border-radius: var(--panel-radius); background: var(--surface-panel); box-shadow: 0 16px 40px #102f322b, 0 3px 10px #102f3212; pointer-events: auto; }
.memorial-expand { position: absolute; top: 10px; right: 10px; z-index: 1; display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--control-radius); color: var(--ui-text-highlighted); background: var(--surface-panel); cursor: pointer; }
.memorial-expand > * { width: 19px; height: 19px; }
.memorial-expand:hover { background: var(--garden-mist); }
.memorial-expand:active { background: var(--ui-bg-muted); }
.memorial-expand:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: -2px; }
.memorial-detail-panel::before { content: ''; flex-shrink: 0; height: 3px; background: var(--detail-accent); }
.memorial-detail-reading { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 24px; scrollbar-gutter: stable; }
.memorial-detail-identity { display: grid; grid-template-columns: 40px minmax(0, 1fr); column-gap: 12px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--ui-border); }
.memorial-detail-dedication { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; margin-bottom: 16px; color: var(--ui-text-muted); font-size: 11px; font-weight: 600; line-height: 1.6; letter-spacing: 1.4px; text-transform: uppercase; }
.memorial-detail-emblem { grid-column: 1; grid-row: 2 / 4; display: grid; place-items: center; width: 40px; height: 40px; margin: 0; border-radius: var(--control-radius); background: var(--garden-mist); color: var(--color-garden-800); }
.memorial-detail-emblem > * { width: 24px; height: 24px; }
.memorial-name { grid-column: 2; margin: 0; color: var(--ui-text-highlighted); font: 400 34px/1.15 var(--font-display); letter-spacing: -0.7px; white-space: normal; overflow-wrap: anywhere; }
.memorial-name-long { font-size: 26px; letter-spacing: -0.4px; }
.memorial-detail-years { grid-column: 2; margin-top: 8px; font-size: 14px; line-height: 1.6; color: var(--ui-text-muted); }
.memorial-share { justify-content: center; width: 100%; min-height: 44px; padding: 12px 16px; border-radius: var(--control-radius); font-size: 14px; }
.memorial-share-fallback { grid-column: 1 / -1; display: grid; gap: 8px; min-width: 0; margin-top: 12px; font-size: 14px; line-height: 1.5; }
.memorial-share-fallback label { color: var(--ui-text-highlighted); font-weight: 600; }
.memorial-share-fallback p { color: var(--ui-text-muted); }
.memorial-details { display: grid; gap: 22px; min-width: 0; color: var(--ui-text); line-height: 1.8; overflow-wrap: anywhere; }
.memorial-detail-location-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.memorial-detail-location { display: flex; align-items: start; gap: 8px; flex: 1; min-width: 120px; font-size: 14px; line-height: 1.6; color: var(--ui-text-muted); }
.memorial-detail-location > * { width: 18px; height: 18px; flex-shrink: 0; margin-top: 2px; }
.memorial-edit { min-height: 44px; padding: 10px 12px; border-radius: var(--control-radius); font-size: 14px; }
.memorial-detail-creator { display: flex; align-items: start; gap: 10px; padding: 14px; border: 1px solid var(--ui-border); border-radius: var(--control-radius); background: var(--garden-cream); font-size: 14px; }
.memorial-detail-creator > *:first-child { flex-shrink: 0; width: 18px; height: 18px; margin-top: 3px; color: var(--ui-text-muted); }
.memorial-detail-creator strong { color: var(--color-garden-800); font-weight: 600; }
blockquote { padding-bottom: 24px; border-bottom: 1px solid var(--ui-border); color: var(--color-garden-700); font: italic 22px/1.5 var(--font-display); }
blockquote > .iconify { display: block; width: 18px; height: 18px; margin-bottom: 12px; color: var(--color-lantern-700); }
h3 { margin-bottom: 12px; color: var(--ui-text-highlighted); font: 400 24px/1.3 var(--font-display); letter-spacing: -.3px; }
.memorial-story p, .memorial-detail-favorite p { max-width: 42ch; font-size: 16px; line-height: 1.8; }
.memorial-detail-favorite { display: flex; align-items: start; gap: 12px; padding: 18px; border: 1px solid var(--ui-border); border-radius: var(--control-radius); background: var(--garden-mist); }
.memorial-detail-favorite > .iconify { width: 20px; height: 20px; margin-top: 4px; flex-shrink: 0; color: var(--color-lantern-700); }
.memorial-detail-favorite h3 { font-size: 21px; }
.memorial-detail-demo { display: flex; align-items: start; gap: 8px; font-size: 14px; line-height: 1.6; color: var(--ui-text-muted); }
.memorial-detail-demo > * { width: 16px; height: 16px; margin-top: 3px; flex-shrink: 0; }
.memorial-detail-footer { flex-shrink: 0; padding: 14px 20px; border-top: 1px solid var(--ui-border); background: var(--garden-cream); }
.memorial-return { position: absolute; z-index: 2; top: max(24px, env(safe-area-inset-top)); left: calc(clamp(320px, 34cqw, 440px) + max(24px, env(safe-area-inset-left))); display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-width: 44px; min-height: 44px; padding: 10px 12px; border: 1px solid var(--garden-control-border); border-radius: var(--control-radius); background: var(--garden-control-bg); color: var(--garden-control-text); font-size: 14px; line-height: 20px; white-space: nowrap; cursor: pointer; pointer-events: auto; }
.memorial-return > .iconify { width: 19px; height: 19px; flex-shrink: 0; }
.memorial-return:hover { background: var(--garden-control-hover); }
.memorial-return:active { background: var(--color-garden-800); }
.memorial-return:focus-visible { outline: var(--focus-width) solid var(--color-lantern-300); outline-offset: var(--focus-offset); }
.memorial-return-label-compact { display: none; }
.memorial-detail-visual { position: relative; grid-column: 2; grid-row: 1; min-width: 0; min-height: 0; pointer-events: none; }
.memorial-detail-scene-header { position: absolute; left: max(24px, env(safe-area-inset-left)); right: max(24px, env(safe-area-inset-right)); top: max(24px, env(safe-area-inset-top)); display: flex; align-items: start; justify-content: flex-end; gap: 12px; }
.memorial-detail-controls { display: flex; flex-shrink: 0; gap: 6px; pointer-events: auto; }
.memorial-detail-controls button { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid var(--garden-control-border); border-radius: var(--control-radius); background: var(--garden-control-bg); color: var(--garden-control-text); cursor: pointer; }
.memorial-detail-controls button > * { width: 19px; height: 19px; }
.memorial-detail-controls button:hover:not(:disabled) { background: var(--garden-control-hover); }
.memorial-detail-controls button:active:not(:disabled) { background: var(--color-garden-800); }
.memorial-detail-controls button:focus-visible { outline: var(--focus-width) solid var(--color-lantern-300); outline-offset: var(--focus-offset); }
.memorial-detail-controls button.detail-toggle-active { color: var(--color-lantern-300); background: var(--garden-control-hover); }
.memorial-detail-controls button:disabled { opacity: .55; cursor: default; }
.memorial-detail-weather-note { position: absolute; left: 20px; right: 20px; bottom: 20px; max-width: 340px; width: fit-content; padding: 10px 14px; border-radius: var(--control-radius); background: var(--garden-control-bg); color: var(--garden-control-text); font-size: 14px; line-height: 1.5; }
@container (min-width: 760px) and (max-width: 1000px) {
  .memorial-detail-panel { margin: 16px; }
  .memorial-detail-reading { padding: 20px; }
}
@container (max-width: 759px) {
  .memorial-detail-layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: clamp(180px, 42cqh, 340px) minmax(0, 1fr); }
  .memorial-detail-visual { grid-column: 1; grid-row: 1; }
  .memorial-detail-panel { position: absolute; grid-area: auto; z-index: 1; left: max(12px, env(safe-area-inset-left)); right: max(12px, env(safe-area-inset-right)); bottom: max(12px, env(safe-area-inset-bottom)); top: min(calc(clamp(180px, 42cqh, 340px) + 12px), calc(100cqh - 132px)); margin: 0; }
  .memorial-detail[data-expanded='true'] .memorial-detail-panel { top: max(12px, env(safe-area-inset-top)); }
  .memorial-return { left: max(12px, env(safe-area-inset-left)); top: max(12px, env(safe-area-inset-top)); }
  .memorial-return-label { display: none; }
  .memorial-return-label-compact { display: inline; }
  .memorial-detail[data-expanded='true'] .memorial-return { left: calc(max(12px, env(safe-area-inset-left)) + 12px); top: calc(max(12px, env(safe-area-inset-top)) + 12px); }
  .memorial-detail[data-expanded='true'] .memorial-detail-reading { margin-top: 56px; }
  .memorial-detail-dedication { padding-right: 38px; min-height: 24px; }
  .memorial-detail-reading { padding: 20px; }
  .memorial-name { font-size: 30px; }
  .memorial-name-long { font-size: 24px; }
  .memorial-details { gap: 20px; }
  .memorial-detail-footer { padding: 12px 16px max(12px, env(safe-area-inset-bottom)); }
  .memorial-detail-scene-header { left: max(12px, env(safe-area-inset-left)); right: max(12px, env(safe-area-inset-right)); top: max(12px, env(safe-area-inset-top)); gap: 8px; }
  .memorial-detail-controls { gap: 4px; }
  .memorial-detail-weather-note { left: 12px; right: 12px; bottom: 10px; padding: 8px 10px; }
}
@media (prefers-reduced-motion: no-preference) {
  @container (min-width: 760px) {
    .memorial-detail-panel { animation: memorial-detail-enter 280ms ease-out both; }
  }
  @container (max-width: 759px) {
    .memorial-detail-panel { transition: top 320ms cubic-bezier(.22, 1, .36, 1); }
  }
}
@keyframes memorial-detail-enter { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
</style>

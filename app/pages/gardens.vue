<script setup lang="ts">
import { demoGardens, findDemoGarden } from '../data/demoGardens'
import type { GardenId } from '../data/demoGardens'
import type { PublicMemorial } from '../../shared/memorials'
import { isCreatablePlace } from '#shared/gardens'
import { gardenDiagnosticsAllowed } from '../utils/gardenDiagnosticsFlag'

definePageMeta({ middleware: 'legacy-memorial-create', colorMode: 'light' })
const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const selected = computed(() => findDemoGarden(route.query.garden))
const { fullscreen, toggleFullscreen } = useGardenFullscreen()
const { seed: authSessionSeed } = useGardenSession()
const gardenMenuOpen = ref(false)
const sceneReady = ref(false)
const displayedGardenId = ref(selected.value?.id)
const displayed = computed(() => findDemoGarden(displayedGardenId.value))
const detailOpen = ref(false)
const diagnosticsEnabled = gardenDiagnosticsAllowed(useRuntimeConfig().public.gardenDiagnostics)
let apiRequestId = 0
const gardenIcons: Record<GardenId, string> = { meadow: 'i-lucide-flower-2', lake: 'i-lucide-waves', grove: 'i-lucide-trees', hill: 'i-lucide-mountain' }
const gardenIndex = computed(() => demoGardens.findIndex(garden => garden.id === displayedGardenId.value))
const previousGarden = computed(() => demoGardens[(gardenIndex.value + demoGardens.length - 1) % demoGardens.length]!)
const nextGarden = computed(() => demoGardens[(gardenIndex.value + 1) % demoGardens.length]!)
const { data: saved, error: loadError, status, refresh: reload } = await useAsyncData('map-memorials', async (_app, { signal }) => {
  const gardenId = selected.value?.id
  const started = diagnosticsEnabled ? performance.now() : 0
  const requestId = diagnosticsEnabled && gardenId ? ++apiRequestId : undefined
  const memorials = gardenId ? await $fetch<PublicMemorial[]>(`/api/gardens/${gardenId}/memorials`, { signal }) : []
  return { gardenId, memorials, apiWaitMs: diagnosticsEnabled && gardenId ? performance.now() - started : 0, apiStartedAt: diagnosticsEnabled && gardenId ? started : undefined, requestId }
}, { server: false, default: () => ({ gardenId: undefined, memorials: [], apiWaitMs: 0, apiStartedAt: undefined, requestId: undefined }) })
// Nuxt's option-level watch serializes pending requests. Navigation must cancel
// the old garden immediately, including its network request, rather than queue.
watch([() => selected.value?.id, authSessionSeed], () => { void reload({ dedupe: 'cancel' }) }, { flush: 'sync' })
const focusId = computed(() => typeof route.query.memorial === 'string' ? route.query.memorial : undefined)
const records = computed(() => (saved.value?.memorials ?? []).filter(item => item.gardenId === selected.value?.id))
const placesState = computed(() => !selected.value ? 'ready' : status.value === 'pending' ? 'loading' : loadError.value ? 'error' : status.value === 'success' && saved.value?.gardenId === selected.value.id ? 'ready' : 'loading')
const heading = ref<HTMLHeadingElement>()
const title = computed(() => (sceneReady.value ? displayed.value : selected.value) ? t(`garden.names.${(sceneReady.value ? displayed.value : selected.value)!.id}`) : t('garden.title'))
const titleVisible = ref(false)
const titleOnMap = computed(() => !!displayed.value && sceneReady.value && !detailOpen.value)
let titleGarden: GardenId | undefined
let titleTimer: ReturnType<typeof setTimeout> | undefined
watch([displayedGardenId, sceneReady, detailOpen], ([id, ready, detail]) => {
  // Only a committed, interactive garden starts a new title interval. Returning
  // from a story or cancelling to the same source must not restart its timer.
  if (!ready || detail || id === titleGarden) return
  clearTimeout(titleTimer)
  titleGarden = id
  titleVisible.value = !!id
  if (id) titleTimer = setTimeout(() => { titleVisible.value = false }, 3000)
})
onBeforeUnmount(() => { clearTimeout(titleTimer) })
useHead({ htmlAttrs: { lang: () => locale.value } })
useSeoMeta({ title: () => `${title.value} — PetMemoreal`, description: () => t('garden.description') })

async function selectGarden(id: GardenId) {
  gardenMenuOpen.value = false
  await navigateTo(gardenLink(id))
}

function gardenLink(id?: GardenId) {
  const query = { ...route.query }
  delete query.memorial
  if (id) query.garden = id
  else delete query.garden
  return { path: localePath('/gardens'), query }
}

async function cancelGarden(id?: GardenId) {
  await navigateTo(gardenLink(id), { replace: true })
}

async function createAt(place: number) {
  if (!selected.value || status.value !== 'success' || loadError.value || !isCreatablePlace(selected.value.id, place)) return
  await navigateTo({ path: localePath('/memorials/new'), query: { garden: selected.value.id, place } })
}

let focusedView: string | undefined
watch([() => selected.value?.id, sceneReady], async () => {
  const view = selected.value?.id ?? 'overview'
  if (!sceneReady.value || focusId.value || focusedView === view) return
  await nextTick()
  if (!sceneReady.value || (selected.value?.id ?? 'overview') !== view) return
  // Finishing the scene must not steal focus from a header or camera action
  // already started by the visitor, including its portaled menu.
  if (document.activeElement?.closest('[data-testid="garden-header"], [role="menu"], .camera-toolbar, .garden-tools-menu') || document.querySelector('[data-testid="garden-header"] [aria-expanded="true"]')) {
    focusedView = view
    return
  }
  heading.value?.focus({ preventScroll: true })
  focusedView = view
})
watch(() => selected.value?.id, (id) => { if (!id) fullscreen.value = false })
</script>

<template>
  <div class="gardens-page" :class="{ 'gardens-page-expanded': fullscreen }" :data-expanded="fullscreen">
    <a href="#garden-main" class="skip-link">{{ t('nav.skip') }}</a>
    <GardenHeader v-show="!fullscreen" />
    <main id="garden-main" class="garden-stage" tabindex="-1">
      <h1 ref="heading" :class="{ 'garden-title': titleOnMap, 'garden-title-expired': titleOnMap && !titleVisible, 'sr-only': !titleOnMap }" :data-title-visible="titleOnMap && titleVisible" data-testid="garden-title" tabindex="-1">{{ title }}</h1>
      <div class="garden-canvas-area">
        <ClientOnly>
          <GardenCanvas :garden-id="selected?.id" :memorials="records" :places-state="placesState" :api-wait-ms="saved?.apiWaitMs" :api-started-at="saved?.apiStartedAt" :api-request-id="saved?.gardenId === selected?.id ? saved?.requestId : undefined" :focus-id="focusId" :can-create="status === 'success' && !loadError" :fullscreen="fullscreen" @toggle-fullscreen="toggleFullscreen" @select="selectGarden" @cancel="cancelGarden" @displayed="displayedGardenId = $event" @create="createAt" @ready="sceneReady = $event" @detail="detailOpen = $event" @retry="reload()" />
          <template #fallback><div class="garden-fallback"><GardenLoading :completed="0" phase="opening" /></div></template>
        </ClientOnly>
      </div>

      <div v-if="displayed && sceneReady && !detailOpen" class="garden-hud">
        <UPopover v-model:open="gardenMenuOpen" :content="{ side: 'bottom', align: 'start', sideOffset: 8 }" :ui="{ content: 'bg-(--surface-panel) rounded-(--panel-radius) ring-1 ring-(--ui-border) shadow-xl' }">
          <button type="button" class="garden-control garden-switch" :aria-label="t('garden.switch')" data-testid="garden-switch"><UIcon name="i-lucide-trees" aria-hidden="true" /><span class="garden-switch-label">{{ t('garden.switch') }}</span><UIcon name="i-lucide-chevron-down" class="garden-switch-chevron" aria-hidden="true" /></button>
          <template #content>
            <div class="garden-menu">
              <p class="garden-menu-heading">{{ t('garden.choose') }}</p>
              <nav :aria-label="t('garden.choose')">
                <button v-for="garden in demoGardens" :key="garden.id" type="button" :aria-pressed="selected?.id === garden.id" :data-testid="`garden-${garden.id}`" @click="selectGarden(garden.id)">
                  <UIcon :name="gardenIcons[garden.id]" class="garden-menu-icon" aria-hidden="true" />
                  <span>{{ t(`garden.names.${garden.id}`) }}</span>
                  <UIcon :name="selected?.id === garden.id ? 'i-lucide-check' : 'i-lucide-arrow-up-right'" class="garden-menu-indicator" aria-hidden="true" />
                </button>
              </nav>
              <div class="garden-menu-links">
                <NuxtLink :to="gardenLink()" data-testid="garden-overview" @click="gardenMenuOpen = false"><UIcon name="i-lucide-layout-grid" aria-hidden="true" />{{ t('garden.back') }}</NuxtLink>
              </div>
            </div>
          </template>
        </UPopover>

        <nav class="garden-paths" :aria-label="t('garden.navigation.label')">
          <NuxtLink class="garden-control garden-path" :to="gardenLink(previousGarden.id)" :aria-label="t('garden.previous', { name: t(`garden.names.${previousGarden.id}`) })" data-testid="garden-previous">
            <UIcon name="i-lucide-arrow-left" aria-hidden="true" />
            <span class="garden-path-copy"><span>{{ t(`garden.names.${previousGarden.id}`) }}</span></span>
          </NuxtLink>
          <NuxtLink class="garden-control garden-path garden-path-next" :to="gardenLink(nextGarden.id)" :aria-label="t('garden.next', { name: t(`garden.names.${nextGarden.id}`) })" data-testid="garden-next">
            <span class="garden-path-copy"><span>{{ t(`garden.names.${nextGarden.id}`) }}</span></span>
            <UIcon name="i-lucide-arrow-right" aria-hidden="true" />
          </NuxtLink>
        </nav>
      </div>

    </main>
  </div>
</template>

<style scoped>
.gardens-page { position: relative; display: flex; flex-direction: column; width: 100%; height: 100dvh; overflow: clip; background: var(--garden-cream); }
.garden-stage { position: relative; flex: 1; min-height: 0; margin: 0 20px calc(20px + env(safe-area-inset-bottom)); border-radius: var(--panel-radius); overflow: clip; background: var(--color-garden-950); box-shadow: 0 0 0 1px #244b3b1a; }
.garden-stage:focus { outline: none; }
.gardens-page-expanded .garden-stage { margin: 0; border-radius: 0; box-shadow: none; }
.garden-canvas-area { position: absolute; inset: 0; }
.garden-hud { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.garden-control { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-width: 48px; min-height: 48px; padding: 10px 16px; border: 1px solid var(--garden-control-border); border-radius: var(--control-radius); color: var(--garden-control-text); background: var(--garden-control-bg); box-shadow: 0 3px 12px #0c282b20; pointer-events: auto; cursor: pointer; }
.garden-control:hover { background: var(--garden-control-hover); }
.garden-control:active { background: var(--color-garden-800); }
.garden-control:focus-visible { outline: var(--focus-width) solid #efc681; outline-offset: var(--focus-offset); }
.garden-control > .iconify { width: 20px; height: 20px; flex-shrink: 0; }
.garden-switch { position: absolute; top: calc(20px + env(safe-area-inset-top)); left: calc(20px + env(safe-area-inset-left)); font-size: 13px; }
.garden-switch-chevron { width: 15px !important; }
.garden-title { position: absolute; z-index: 2; left: 50%; top: calc(20px + env(safe-area-inset-top)); transform: translateX(-50%); max-width: calc(100% - 350px); margin: 0; padding: 10px 24px; border: 1px solid var(--garden-control-border); border-radius: var(--control-radius); color: var(--garden-control-text); background: var(--garden-control-bg); font: 400 28px/1.1 var(--font-display); text-align: center; pointer-events: none; opacity: 1; transition: opacity 150ms ease-out; }
.garden-title-expired { opacity: 0; }
.garden-title:focus { outline: none; }
.garden-paths { position: absolute; left: calc(20px + env(safe-area-inset-left)); right: calc(20px + env(safe-area-inset-right)); bottom: calc(20px + env(safe-area-inset-bottom)); display: flex; justify-content: space-between; gap: 16px; }
.garden-path { justify-content: flex-start; max-width: calc(50% - 8px); min-width: 140px; min-height: 60px; font-size: 15px; }
.garden-path-copy { display: grid; gap: 2px; min-width: 0; text-align: left; }
.garden-path-copy > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.garden-path-label { color: #c1d0c0; font-size: 12px; line-height: 1.2; }
.garden-path-next { justify-content: flex-end; }
.garden-path-next .garden-path-copy { text-align: right; }
.garden-menu { width: min(280px, calc(100vw - 32px)); max-height: min(440px, calc(100dvh - 90px)); overflow-y: auto; overscroll-behavior: contain; padding: 10px; color: var(--ui-text-highlighted); }
.garden-menu-heading { padding: 8px 12px 12px; color: var(--ui-text-muted); font-size: 12px; line-height: 1.5; }
.garden-menu nav { display: grid; gap: 4px; }
.garden-menu nav button { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 10px 12px; border-radius: var(--control-radius); font-size: 14px; text-align: left; cursor: pointer; }
.garden-menu nav button:hover { background: var(--ui-bg-muted); }
.garden-menu nav button[aria-pressed='true'] { color: var(--garden-cream); background: var(--color-garden-800); }
.garden-menu-icon { width: 20px; height: 20px; flex-shrink: 0; }
.garden-menu-indicator { width: 17px; height: 17px; margin-left: auto; flex-shrink: 0; }
.garden-menu-links { display: grid; gap: 4px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--ui-border); }
.garden-menu-links a { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 10px 14px; border-radius: var(--control-radius); font-size: 13px; letter-spacing: 0; }
.garden-menu-links a:hover { background: var(--ui-bg-muted); }
.garden-menu-links .iconify { width: 17px; height: 17px; }
.garden-fallback { position: absolute; inset: 0; display: grid; place-items: center; background: var(--color-garden-950); }
@media (max-width: 600px), (pointer: coarse) and (max-width: 1000px) {
  .garden-stage { margin: 0 8px calc(8px + env(safe-area-inset-bottom)); }
  .garden-control { min-width: 44px; min-height: 44px; gap: 8px; padding: 8px 12px; box-shadow: none; }
  .garden-control > .iconify { width: 18px; height: 18px; }
  .garden-switch { top: calc(12px + env(safe-area-inset-top)); left: calc(12px + env(safe-area-inset-left)); width: 44px; gap: 3px; padding: 0; }
  .garden-switch-label { display: none; }
  .garden-switch-chevron { width: 12px !important; }
  .garden-title { top: calc(12px + env(safe-area-inset-top)); max-width: calc(100% - 136px); min-height: 44px; display: grid; place-items: center; padding: 8px 14px; font-size: 22px; }
  .garden-paths { left: calc(12px + env(safe-area-inset-left)); right: calc(12px + env(safe-area-inset-right)); bottom: calc(12px + env(safe-area-inset-bottom)); }
  .garden-path { min-width: 96px; min-height: 44px; padding: 8px 12px; font-size: 13px; }
  .garden-menu { display: flex; flex-direction: column; max-height: min(440px, calc(100dvh - 90px), calc(var(--reka-popover-content-available-height, 440px) - env(safe-area-inset-bottom))); overflow: hidden; }
  .garden-menu-heading, .garden-menu-links { flex-shrink: 0; }
  .garden-menu nav { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
  .garden-menu nav button:focus-visible { outline-offset: -2px; }
}
@media (max-height: 450px) { .garden-title { font-size: 23px; } .garden-paths { bottom: calc(12px + env(safe-area-inset-bottom)); } .garden-path { min-height: 44px; padding-block: 6px; } .garden-path-label { display: none; } }
@media (prefers-reduced-motion: reduce) { .garden-title { transition: none; } }
</style>

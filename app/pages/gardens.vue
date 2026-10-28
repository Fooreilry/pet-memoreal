<script setup lang="ts">
import { demoGardens, findDemoGarden } from '../data/demoGardens'
import type { GardenId } from '../data/demoGardens'
import type { PublicMemorial } from '../../shared/memorials'
import { isCreatablePlace } from '#shared/gardens'

definePageMeta({ middleware: 'legacy-memorial-create', colorMode: 'light' })
const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const selected = computed(() => findDemoGarden(route.query.garden))
const { seed: authSessionSeed } = useGardenSession()
const gardenMenuOpen = ref(false)
const sceneReady = ref(false)
const gardenIndex = computed(() => demoGardens.findIndex(garden => garden.id === selected.value?.id))
const previousGarden = computed(() => demoGardens[(gardenIndex.value + demoGardens.length - 1) % demoGardens.length]!)
const nextGarden = computed(() => demoGardens[(gardenIndex.value + 1) % demoGardens.length]!)
const { data: saved, error: loadError, status, refresh: reload } = await useAsyncData('map-memorials', async () => {
  const gardenId = selected.value?.id
  return { gardenId, memorials: gardenId ? await $fetch<PublicMemorial[]>(`/api/gardens/${gardenId}/memorials`) : [] }
}, { server: false, default: () => ({ gardenId: undefined, memorials: [] }), watch: [() => selected.value?.id, authSessionSeed] })
const focusId = computed(() => typeof route.query.memorial === 'string' ? route.query.memorial : undefined)
const records = computed(() => (saved.value?.memorials ?? []).filter(item => item.gardenId === selected.value?.id))
const placesState = computed(() => !selected.value ? 'ready' : loadError.value ? 'error' : status.value === 'success' && saved.value?.gardenId === selected.value.id ? 'ready' : 'loading')
const heading = ref<HTMLHeadingElement>()
const title = computed(() => selected.value ? t(`garden.names.${selected.value.id}`) : t('garden.title'))
useHead({ htmlAttrs: { lang: () => locale.value } })
useSeoMeta({ title: () => `${title.value} — PetMemoreal`, description: () => t('garden.description') })

async function selectGarden(id: GardenId) {
  gardenMenuOpen.value = false
  await navigateTo({ path: localePath('/gardens'), query: { garden: id } })
}

async function createAt(place: number) {
  if (!selected.value || status.value !== 'success' || loadError.value || !isCreatablePlace(selected.value.id, place)) return
  await navigateTo({ path: localePath('/memorials/new'), query: { garden: selected.value.id, place } })
}

watch([() => selected.value?.id, sceneReady], async () => {
  if ((selected.value && !sceneReady.value) || focusId.value) return
  await nextTick()
  heading.value?.focus({ preventScroll: true })
})
</script>

<template>
  <div class="gardens-page">
    <a href="#garden-main" class="skip-link">{{ t('nav.skip') }}</a>
    <GardenHeader />
    <main id="garden-main" class="garden-stage">
      <h1 v-if="!selected || !sceneReady" ref="heading" class="sr-only" tabindex="-1">{{ title }}</h1>
      <div class="garden-canvas-area">
        <ClientOnly>
          <GardenCanvas :garden-id="selected?.id" :memorials="records" :places-state="placesState" :focus-id="focusId" :can-create="status === 'success' && !loadError" @select="selectGarden" @create="createAt" @ready="sceneReady = $event" @retry="reload()" />
          <template #fallback><div class="garden-fallback"><GardenLoading :completed="0" phase="opening" /></div></template>
        </ClientOnly>
      </div>

      <div v-if="selected && sceneReady" class="garden-hud">
        <UPopover v-model:open="gardenMenuOpen" :content="{ side: 'bottom', align: 'start', sideOffset: 12 }" :ui="{ content: 'bg-[#fffcf5] rounded-[12px] ring-1 ring-[#d8d5c3] shadow-xl' }">
          <button type="button" class="garden-control garden-switch" :aria-label="t('garden.switch')" data-testid="garden-switch"><UIcon name="i-lucide-trees" aria-hidden="true" /><span class="garden-switch-label">{{ t('garden.switch') }}</span><UIcon name="i-lucide-chevron-down" class="garden-switch-chevron" aria-hidden="true" /></button>
          <template #content>
            <div class="garden-menu">
              <nav :aria-label="t('garden.choose')">
                <button v-for="garden in demoGardens" :key="garden.id" type="button" :aria-pressed="selected?.id === garden.id" :data-testid="`garden-${garden.id}`" @click="selectGarden(garden.id)"><span>{{ t(`garden.names.${garden.id}`) }}</span><UIcon :name="selected?.id === garden.id ? 'i-lucide-check' : 'i-lucide-arrow-up-right'" aria-hidden="true" /></button>
              </nav>
              <div class="garden-menu-links">
                <NuxtLink :to="localePath('/gardens')" data-testid="garden-overview" @click="gardenMenuOpen = false"><UIcon name="i-lucide-layout-grid" aria-hidden="true" />{{ t('garden.back') }}</NuxtLink>
              </div>
            </div>
          </template>
        </UPopover>

        <h1 ref="heading" class="garden-title" tabindex="-1">{{ title }}</h1>
        <nav class="garden-paths" :aria-label="t('garden.choose')">
          <NuxtLink class="garden-control garden-path" :to="{ path: localePath('/gardens'), query: { garden: previousGarden.id } }" :aria-label="t('garden.previous', { name: t(`garden.names.${previousGarden.id}`) })" data-testid="garden-previous"><UIcon name="i-lucide-arrow-left" aria-hidden="true" /><span>{{ t(`garden.names.${previousGarden.id}`) }}</span></NuxtLink>
          <NuxtLink class="garden-control garden-path" :to="{ path: localePath('/gardens'), query: { garden: nextGarden.id } }" :aria-label="t('garden.next', { name: t(`garden.names.${nextGarden.id}`) })" data-testid="garden-next"><span>{{ t(`garden.names.${nextGarden.id}`) }}</span><UIcon name="i-lucide-arrow-right" aria-hidden="true" /></NuxtLink>
        </nav>
      </div>

    </main>
  </div>
</template>

<style scoped>
.gardens-page { position: relative; display: flex; flex-direction: column; width: 100%; height: 100dvh; overflow: clip; background: var(--garden-cream); }
.garden-stage { position: relative; flex: 1; min-height: 0; margin: 0 20px calc(20px + env(safe-area-inset-bottom)); border-radius: 28px; overflow: clip; background: #193c37; box-shadow: 0 0 0 1px #244b3b1a; }
.garden-canvas-area { position: absolute; inset: 0; }
.garden-hud { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.garden-control { display: inline-flex; align-items: center; justify-content: center; gap: 12px; min-width: 48px; min-height: 48px; padding: 10px 18px; border: 1px solid #e4dcc33d; border-radius: var(--control-radius); color: #f8f3e8; background: #173d34ed; box-shadow: 0 8px 28px #0c282b35; backdrop-filter: blur(16px); pointer-events: auto; cursor: pointer; }
.garden-control:hover { background: #285346; }
.garden-control:focus-visible { outline: var(--focus-width) solid #efc681; outline-offset: var(--focus-offset); }
.garden-control > .iconify { width: 20px; height: 20px; flex-shrink: 0; }
.garden-switch { position: absolute; top: calc(20px + env(safe-area-inset-top)); left: calc(20px + env(safe-area-inset-left)); font-size: 13px; }
.garden-switch-chevron { width: 15px !important; }
.garden-title { position: absolute; left: 50%; top: calc(20px + env(safe-area-inset-top)); transform: translateX(-50%); max-width: calc(100% - 350px); margin: 0; padding: 9px 26px 11px; border: 1px solid #e4dcc329; border-radius: 12px; color: #fff6e3; background: #173d34dd; backdrop-filter: blur(16px); font: 400 28px/1.1 Georgia, serif; text-align: center; }
.garden-title:focus { outline: none; }
.garden-paths { position: absolute; left: calc(20px + env(safe-area-inset-left)); right: calc(20px + env(safe-area-inset-right)); bottom: calc(20px + env(safe-area-inset-bottom)); display: flex; justify-content: space-between; gap: 16px; }
.garden-path { max-width: calc(50% - 8px); min-width: 140px; min-height: 52px; font-size: 15px; }
.garden-path span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.garden-menu { width: min(270px, calc(100vw - 32px)); max-height: min(440px, calc(100dvh - 90px)); overflow-y: auto; overscroll-behavior: contain; padding: 10px; color: #244b3b; }
.garden-menu nav { display: grid; gap: 4px; }
.garden-menu nav button { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 46px; padding: 10px 14px; border-radius: var(--control-radius); text-align: left; cursor: pointer; }
.garden-menu nav button:hover { background: #edf0e5; }
.garden-menu nav button[aria-pressed='true'] { color: #fff6e3; background: #244b3b; }
.garden-menu-links { display: grid; gap: 4px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #dcdcc9; }
.garden-menu-links a { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 10px 14px; border-radius: var(--control-radius); font-size: 13px; letter-spacing: 0; }
.garden-menu-links a:hover { background: #edf0e5; }
.garden-menu-links .iconify { width: 17px; height: 17px; }
.garden-fallback { position: absolute; inset: 0; display: grid; place-items: center; background: #193c37; }
@media (max-width: 600px) {
  .garden-stage { margin: 0 8px calc(8px + env(safe-area-inset-bottom)); border-radius: 22px; }
  .garden-switch { top: calc(12px + env(safe-area-inset-top)); left: calc(12px + env(safe-area-inset-left)); width: 48px; padding: 0; }
  .garden-switch-label, .garden-switch-chevron { display: none; }
  .garden-title { top: calc(12px + env(safe-area-inset-top)); max-width: calc(100% - 152px); min-height: 48px; display: grid; place-items: center; padding: 10px 20px; font-size: 23px; }
  .garden-paths { left: calc(12px + env(safe-area-inset-left)); right: calc(12px + env(safe-area-inset-right)); bottom: calc(12px + env(safe-area-inset-bottom)); }
  .garden-path { min-width: 116px; min-height: 48px; padding: 10px 14px; font-size: 14px; }
}
@media (max-height: 450px) { .garden-title { font-size: 23px; } .garden-paths { bottom: calc(12px + env(safe-area-inset-bottom)); } .garden-path { min-height: 44px; padding-block: 8px; } }
</style>

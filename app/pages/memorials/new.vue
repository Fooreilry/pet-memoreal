<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import type { PublicMemorial } from '#shared/memorials'
import { gardenIds, isCreatablePlace } from '#shared/gardens'

definePageMeta({ middleware: 'auth', colorMode: 'light', key: route => `memorial-create-${String(route.query.garden ?? '')}-${String(route.query.place ?? '')}` })
const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const request = useRequestFetch()
const suppliedGarden = route.query.garden
const suppliedPlace = route.query.place
const gardenId = gardenIds.find(id => id === suppliedGarden) ?? 'meadow'
const place = typeof suppliedPlace === 'string' && isCreatablePlace(gardenId, Number(suppliedPlace)) ? Number(suppliedPlace) : undefined
const invalidLocation = (suppliedGarden !== undefined && !gardenIds.some(id => id === suppliedGarden))
  || (suppliedPlace !== undefined && (suppliedGarden === undefined || place === undefined))
const gardenDestination = { path: localePath('/gardens'), query: gardenIds.some(id => id === suppliedGarden) ? { garden: gardenId } : {} }
const availabilityKey = `memorial-create-availability-${gardenId}-${place ?? 'auto'}`
const { data: existing, error, status, refresh } = await useAsyncData(availabilityKey, async () => {
  if (invalidLocation || place === undefined) return []
  return request<PublicMemorial[]>(`/api/gardens/${gardenId}/memorials`)
}, { default: () => [] })
const occupied = computed(() => existing.value?.find(memorial => memorial.place === place))
useHead({ htmlAttrs: { lang: () => locale.value }, meta: [{ name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] })
useSeoMeta({ title: () => `${t('creation.title')} — PetMemoreal` })
onBeforeRouteLeave(() => { clearNuxtData('map-memorials') })

async function saved(memorial: PublicMemorial) {
  clearNuxtData(['map-memorials', 'my-memorials', availabilityKey])
  await navigateTo({ path: localePath('/gardens'), query: { garden: memorial.gardenId, memorial: memorial.id } }, { replace: true })
}

async function cancel() { await navigateTo(gardenDestination) }
</script>

<template>
  <MemorialFormPage
    mode="create"
    :title="t('creation.title')"
    :label="t('creation.label')"
    :intro="t('creation.page.intro')"
    :back-to="gardenDestination"
    :back-label="t('creation.page.back')"
    :summary-title="place ? t(`garden.names.${gardenId}`) : t('creation.page.summaryTitle')"
    :summary-detail="place ? t('account.place', { place }) : undefined"
    :summary-note="t('creation.page.placeNote')"
    :show-state="invalidLocation || status === 'pending' || !!error || !!occupied"
  >
    <template #state>
      <AppState v-if="invalidLocation" kind="empty" :title="t('creation.page.invalidTitle')" :description="t('creation.page.invalidDescription')" />
      <AppState v-else-if="status === 'pending'" kind="loading" :title="t('creation.page.loading')" />
      <AppState v-else-if="error" kind="error" :title="t('creation.page.loadError')" :description="t('creation.page.loadErrorDescription')" retry @retry="refresh()" />
      <div v-else-if="occupied" class="grid gap-5">
        <AppState kind="empty" :title="t('creation.page.occupiedTitle')" :description="t('creation.page.occupiedDescription')" />
        <UButton :to="{ path: localePath('/gardens'), query: { garden: gardenId, memorial: occupied.id } }" variant="outline" class="justify-center" data-testid="memorial-create-existing">{{ t('creation.page.viewExisting') }}</UButton>
      </div>
    </template>
    <MemorialCreationForm :garden-id="gardenId" :place="place" show-cancel @saved="saved" @cancel="cancel" />
  </MemorialFormPage>
</template>

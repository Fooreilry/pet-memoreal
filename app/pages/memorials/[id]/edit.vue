<script setup lang="ts">
import type { EditableMemorial, PublicMemorial } from '#shared/memorials'

definePageMeta({ middleware: 'auth', colorMode: 'light', key: route => `memorial-edit-${String(route.params.id)}` })
const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const memorialId = String(route.params.id)
const cacheKey = `memorial-edit-${memorialId}`
const { data: memorial, error, status, refresh } = await useFetch<EditableMemorial>(`/api/memorials/${encodeURIComponent(memorialId)}`, { key: cacheKey })
const unavailable = computed(() => error.value?.statusCode === 404 || error.value?.statusCode === 400)
const destination = (record: PublicMemorial) => ({ path: localePath('/gardens'), query: { garden: record.gardenId, memorial: record.id } })
useHead({ htmlAttrs: { lang: () => locale.value }, meta: [{ name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] })
useSeoMeta({ title: () => `${t('editing.title')} — PetMemoreal` })

async function saved(record: PublicMemorial) {
  clearNuxtData(['map-memorials', 'my-memorials', cacheKey])
  await navigateTo(destination(record), { replace: true })
}

async function cancel() {
  if (memorial.value) await navigateTo(destination(memorial.value))
}
</script>

<template>
  <MemorialFormPage
    mode="edit"
    :title="t('editing.title')"
    :label="t('editing.label')"
    :intro="t('editing.intro')"
    :back-to="memorial ? destination(memorial) : localePath('/account')"
    :back-label="t(memorial ? 'editing.back' : 'editing.backAccount')"
    :summary-title="memorial?.name"
    :summary-detail="memorial ? `${memorial.born} — ${memorial.died}` : undefined"
    :summary-note="t('editing.placeNote')"
    :garden-id="memorial?.gardenId"
    :species="memorial?.species"
    :show-state="status === 'pending' || !!error || !memorial"
  >
    <template #state>
      <AppState v-if="status === 'pending'" kind="loading" :title="t('editing.loading')" />
      <AppState v-else :kind="unavailable ? 'empty' : 'error'" :title="t(unavailable ? 'editing.unavailableTitle' : 'editing.loadError')" :description="t(unavailable ? 'editing.unavailableDescription' : 'editing.loadErrorDescription')" :retry="!unavailable" @retry="refresh()" />
    </template>
    <MemorialCreationForm v-if="memorial" :key="memorial.id" :memorial="memorial" @saved="saved" @cancel="cancel" />
  </MemorialFormPage>
</template>

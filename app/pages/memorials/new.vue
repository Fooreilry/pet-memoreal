<script setup lang="ts">
import type { PublicMemorial } from '#shared/memorials'
import { gardenIds, isCreatablePlace } from '#shared/gardens'

definePageMeta({ middleware: 'auth', colorMode: 'light' })
const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const gardenId = gardenIds.find(id => id === route.query.garden) ?? 'meadow'
const place = typeof route.query.place === 'string' && isCreatablePlace(gardenId, Number(route.query.place)) ? Number(route.query.place) : undefined
useSeoMeta({ title: () => `${t('creation.title')} — PetMemoreal` })

async function saved(memorial: PublicMemorial) {
  clearNuxtData('map-memorials')
  await navigateTo({ path: localePath('/gardens'), query: { garden: memorial.gardenId, memorial: memorial.id } })
}
</script>

<template>
  <AuthShell>
    <p class="eyebrow">{{ t('creation.label') }}</p>
    <h1>{{ t('creation.title') }}</h1>
    <p class="auth-intro">{{ t('creation.intro') }}</p>
    <MemorialCreationForm :garden-id="gardenId" :place="place" @saved="saved" />
    <div class="auth-links"><NuxtLink :to="localePath('/gardens')">{{ t('garden.back') }}</NuxtLink><NuxtLink :to="localePath('/account')">{{ t('creation.myPlaces') }}</NuxtLink></div>
  </AuthShell>
</template>

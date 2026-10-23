<script setup lang="ts">
import type { NuxtError } from '#app'
const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <UApp>
    <main class="error-page">
      <span class="eyebrow">PetMemoreal · {{ props.error.statusCode }}</span>
      <h1 class="sr-only">{{ t(props.error.statusCode === 404 ? 'states.notFound.title' : 'states.error.title') }}</h1>
      <AppState kind="error" :title="t(props.error.statusCode === 404 ? 'states.notFound.title' : 'states.error.title')" :description="t(props.error.statusCode === 404 ? 'states.notFound.description' : 'states.error.description')" />
      <UButton :to="localePath('/')" external>{{ t('states.home') }}</UButton>
    </main>
  </UApp>
</template>

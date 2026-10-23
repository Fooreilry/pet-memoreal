<script setup lang="ts">
const props = withDefaults(defineProps<{
  kind: 'loading' | 'error' | 'empty'
  title?: string
  description?: string
  retry?: boolean
}>(), { retry: false, title: undefined, description: undefined })
defineEmits<{ retry: [] }>()
const { t } = useI18n()
const icons = { loading: 'i-lucide-loader-circle', error: 'i-lucide-cloud-alert', empty: 'i-lucide-sprout' }
</script>

<template>
  <section class="app-state" :role="kind === 'error' ? 'alert' : 'status'" :aria-busy="kind === 'loading'">
    <UIcon :name="icons[kind]" class="size-8" :class="{ 'animate-spin': kind === 'loading', 'text-error': kind === 'error' }" aria-hidden="true" />
    <h3>{{ props.title || t(`states.${kind}.title`) }}</h3>
    <p>{{ props.description || t(`states.${kind}.description`) }}</p>
    <UButton v-if="retry && kind === 'error'" variant="outline" @click="$emit('retry')">{{ t('states.retry') }}</UButton>
  </section>
</template>

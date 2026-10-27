<script setup lang="ts">
const { t, locale } = useI18n()
const route = useRoute()
const mounted = ref(false)
onMounted(() => { mounted.value = true })
const href = computed(() => `/language?${new URLSearchParams({ locale: locale.value === 'ru' ? 'en' : 'ru', returnTo: route.fullPath.split('#')[0]! + (mounted.value ? route.hash : '') })}`)
</script>

<template>
  <a :href="href" class="language-link" :aria-label="t('nav.language')" :lang="locale === 'ru' ? 'en' : 'ru'">{{ locale === 'ru' ? 'EN' : 'RU' }}</a>
</template>

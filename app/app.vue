<script setup lang="ts">
import { en, ru } from '@nuxt/ui/locale'

const { t, locale } = useI18n()
const uiLocale = computed(() => locale.value === 'ru' ? ru : en)
const draftExit = useNuxtApp().$draftExit
function focusSignOutStatus(event: Event) {
  event.preventDefault()
  nextTick(() => document.querySelector<HTMLElement>('[data-testid="sign-out-pending"]')?.focus())
}
const signOutContent = { onOpenAutoFocus: focusSignOutStatus, 'aria-busy': true, 'data-testid': 'sign-out-pending' }
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLoadingIndicator color="var(--ui-secondary)" />
    <NuxtRouteAnnouncer />
    <NuxtPage />
    <ServiceUnavailableNotice />
    <UModal :open="draftExit.pending.value" :dismissible="false" :close="false" :title="t('auth.signingOut')" :description="t('auth.signingOutDescription')" :content="signOutContent" :ui="{ content: 'max-w-md' }">
      <template #body><div class="flex justify-center py-2" role="status" :aria-label="t('auth.signingOutDescription')"><UIcon name="i-lucide-loader-circle" class="size-7 shrink-0 animate-spin" aria-hidden="true" /></div></template>
    </UModal>
  </UApp>
</template>

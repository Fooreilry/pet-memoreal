<script setup lang="ts">
const { t } = useI18n()
const { unavailable } = useServiceAvailability()
const dismissed = ref(false)
const ready = ref(false)
watch(unavailable, () => { dismissed.value = false })
onMounted(() => { ready.value = true })
</script>

<template>
  <UAlert
    v-if="unavailable && !dismissed"
    class="service-unavailable-notice"
    color="warning"
    variant="soft"
    icon="i-lucide-cloud-off"
    :title="t('states.serviceUnavailable.title')"
    :description="t('states.serviceUnavailable.description')"
    close
    :ui="{ title: 'font-semibold leading-6', description: 'mt-1 leading-6', icon: 'mt-0.5 shrink-0' }"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    data-testid="service-unavailable-notice"
    @update:open="dismissed = true"
  >
    <template #close>
      <button v-if="ready" type="button" class="notice-close" :aria-label="t('states.serviceUnavailable.dismiss')" @click="dismissed = true"><UIcon name="i-lucide-x" aria-hidden="true" /></button>
    </template>
  </UAlert>
</template>

<style scoped>
.service-unavailable-notice { position: fixed; z-index: 40; right: max(24px, env(safe-area-inset-right)); bottom: max(24px, env(safe-area-inset-bottom)); width: min(420px, calc(100% - 48px)); max-height: calc(100dvh - 48px); overflow-y: auto; padding: 20px; border: 1px solid #d4bf91; border-radius: 14px; background: #fff8e8; color: #64512e; box-shadow: 0 8px 32px #173d3426; }
.notice-close { display: grid; place-items: center; flex-shrink: 0; width: 44px; height: 44px; border-radius: var(--control-radius); cursor: pointer; }
.notice-close:hover { background: #ead8b35c; }
.notice-close:focus-visible { outline: var(--focus-width) solid #8b713f; outline-offset: var(--focus-offset); }
@media (max-width: 600px) { .service-unavailable-notice { right: max(16px, env(safe-area-inset-right)); bottom: max(16px, env(safe-area-inset-bottom)); width: calc(100% - 32px); max-height: calc(100dvh - 32px); padding: 16px; border-radius: 14px; } }
</style>

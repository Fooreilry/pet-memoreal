<script setup lang="ts">
const props = withDefaults(defineProps<{ compact: boolean, dismissible?: boolean }>(), { dismissible: true })
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const content = computed(() => ({
  'aria-label': t('garden.camera.more'),
  side: 'left' as const, align: 'start' as const, sideOffset: 8,
  collisionPadding: 12, prioritizePosition: true, sticky: 'always' as const
}))
watch(() => props.compact, () => { open.value = false })
</script>

<template>
  <UPopover v-if="compact" v-model:open="open" :dismissible="dismissible" :content="content" :ui="{ content: 'bg-(--surface-panel) rounded-(--panel-radius) ring-1 ring-(--ui-border) shadow-xl' }">
    <button type="button" class="garden-more" :aria-label="t('garden.camera.more')" :title="t('garden.camera.more')" data-testid="garden-more"><UIcon name="i-lucide-ellipsis-vertical" aria-hidden="true" /></button>
    <template #content>
      <section class="garden-tools-menu" :aria-label="t('garden.camera.more')" data-testid="garden-tools-menu"><slot /></section>
    </template>
  </UPopover>
  <slot v-else />
</template>

<style scoped>
.garden-more { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid var(--garden-control-border); border-radius: var(--control-radius); background: var(--garden-control-bg); color: var(--garden-control-text); cursor: pointer; }
.garden-more > * { width: 18px; height: 18px; }
.garden-more:hover { background: var(--garden-control-hover); }
.garden-more:active { background: var(--color-garden-800); }
.garden-more:focus-visible { outline: var(--focus-width) solid var(--color-lantern-300); outline-offset: var(--focus-offset); }
.garden-tools-menu { width: min(240px, calc(100vw - 80px)); max-height: min(380px, calc(100dvh - 32px), var(--reka-popover-content-available-height, 380px)); overflow-y: auto; overscroll-behavior: contain; padding: 6px; }
.garden-tools-menu :deep(.camera-tools-group) { display: flex; flex-direction: column; gap: 2px; border: 0; padding: 0; background: transparent; box-shadow: none; }
.garden-tools-menu :deep(.camera-tools-group button) { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 44px; padding: 8px 10px; border-radius: var(--control-radius); background: transparent; color: var(--ui-text-highlighted); text-align: left; cursor: pointer; }
.garden-tools-menu :deep(.camera-tools-group button > .iconify) { width: 18px; height: 18px; flex-shrink: 0; }
.garden-tools-menu :deep(.camera-tool-label) { display: block; font-size: 14px; line-height: 1.4; }
.garden-tools-menu :deep(.camera-tools-group button:hover:not(:disabled)) { background: var(--garden-mist); }
.garden-tools-menu :deep(.camera-tools-group button:active:not(:disabled)) { background: var(--ui-bg-muted); }
.garden-tools-menu :deep(.camera-tools-group button:focus-visible) { outline: var(--focus-width) solid var(--focus-color); outline-offset: -2px; }
.garden-tools-menu :deep(.camera-tools-group button:disabled) { opacity: .55; cursor: default; }
.garden-tools-menu :deep(.camera-tools-group button[aria-pressed='true']) { background: var(--garden-mist); color: var(--color-garden-800); }
</style>

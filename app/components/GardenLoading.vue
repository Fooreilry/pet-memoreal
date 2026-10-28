<script setup lang="ts">
defineProps<{ completed: number, phase: 'opening' | 'stories' | 'places' }>()
const { t } = useI18n()
</script>

<template>
  <div class="garden-loading" data-testid="garden-loading" role="status" aria-live="polite">
    <div class="garden-loading-sprout" aria-hidden="true"><UIcon name="i-lucide-sprout" /></div>
    <h2>{{ t('garden.preparing.title') }}</h2>
    <p>{{ t(`garden.preparing.${phase}`) }}</p>
    <div class="garden-loading-track" role="progressbar" :aria-label="t('garden.preparing.label')" :aria-valuenow="completed" :aria-valuemin="0" :aria-valuemax="3" :aria-valuetext="t(`garden.preparing.${phase}`)">
      <span v-for="step in 3" :key="step" :class="{ complete: completed >= step }" />
    </div>
    <small>{{ t('garden.loadingHint') }}</small>
  </div>
</template>

<style scoped>
.garden-loading { display: grid; justify-items: center; gap: 16px; width: min(340px, calc(100% - 48px)); text-align: center; color: #e9ead8; }
.garden-loading-sprout { display: grid; place-items: center; width: 76px; height: 76px; margin-bottom: 4px; border-radius: 50%; border: 1px solid #b4c49742; background: #b5c69710; color: #e8c78f; }
.garden-loading-sprout .iconify { width: 34px; height: 34px; }
.garden-loading h2 { color: #faf5e9; font: 400 30px/1.25 var(--font-display); letter-spacing: -.5px; }
.garden-loading p { font-size: 14px; line-height: 1.6; color: #d2ddc9; }
.garden-loading-track { display: flex; gap: 6px; width: 100%; padding: 4px; border: 1px solid #a9bc9952; border-radius: 8px; }
.garden-loading-track > span { flex: 1; height: 7px; border-radius: 3px; background: #a3b99724; }
.garden-loading-track > .complete { background: #e6c180; }
.garden-loading small { max-width: 260px; color: #a8bdac; font-size: 12px; line-height: 1.7; }
@media (prefers-reduced-motion: no-preference) { .garden-loading-sprout .iconify { animation: sprout-breathe 2.2s ease-in-out infinite; } .garden-loading-track > span { transition: background-color .2s; } }
@keyframes sprout-breathe { 50% { transform: translateY(-3px); opacity: .7; } }
</style>

<script setup lang="ts">
defineProps<{ completed: number, phase: 'opening' | 'stories' | 'places' }>()
const { t } = useI18n()
const stages = ['opening', 'stories', 'places'] as const
</script>

<template>
  <div class="garden-loading" data-testid="garden-loading" :data-phase="phase">
    <svg class="garden-loading-landscape" viewBox="0 0 220 108" fill="none" aria-hidden="true">
      <ellipse cx="110" cy="87" rx="101" ry="16" fill="currentColor" opacity=".07" />
      <path d="M19 84C58 57 84 78 113 64C147 47 173 64 202 83" stroke="currentColor" stroke-opacity=".2" stroke-width="1.5" stroke-linecap="round" />
      <path d="M82 91C128 81 112 66 137 59" stroke="#d5bb81" stroke-opacity=".5" stroke-width="5" stroke-linecap="round" />
      <path d="M37 81V62M37 73C23 73 23 61 23 61C37 59 37 73 37 73ZM37 67C37 54 49 54 49 54C51 67 37 67 37 67Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".6" />
      <path d="M180 80V67M180 74C170 74 170 65 170 65C180 65 180 74 180 74ZM180 70C180 60 189 60 189 60C191 70 180 70 180 70Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity=".4" />
      <g class="garden-loading-sprout" stroke="#efcf95" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M107 68V43M107 55C89 55 89 39 89 39C106 37 107 55 107 55ZM107 46C107 27 123 27 123 27C125 44 107 46 107 46ZM97 69H117" />
      </g>
      <circle cx="153" cy="29" r="3" fill="#efcf95" opacity=".7" />
      <circle cx="69" cy="43" r="1.5" fill="#efcf95" opacity=".5" />
    </svg>
    <h2>{{ t('garden.preparing.title') }}</h2>
    <p class="garden-loading-status" role="status" aria-live="polite" aria-atomic="true">{{ t(`garden.preparing.${phase}`) }}</p>
    <div class="garden-loading-track" role="progressbar" :aria-label="t('garden.preparing.label')" :aria-valuenow="completed" :aria-valuemin="0" :aria-valuemax="3" :aria-valuetext="t(`garden.preparing.${phase}`)">
      <span v-for="(stage, index) in stages" :key="stage" :class="{ complete: completed > index, current: phase === stage }" />
    </div>
    <ol class="garden-loading-stages" aria-hidden="true">
      <li v-for="(stage, index) in stages" :key="stage" :class="{ complete: completed > index, current: phase === stage }">
        <UIcon :name="completed > index ? 'i-lucide-check' : 'i-lucide-circle-small'" />
        <span>{{ t(`garden.preparing.stages.${stage}`) }}</span>
      </li>
    </ol>
    <small>{{ t('garden.loadingHint') }}</small>
  </div>
</template>

<style scoped>
.garden-loading { display: grid; justify-items: center; gap: 14px; width: min(380px, calc(100% - 40px)); text-align: center; color: #c9dbc6; }
.garden-loading-landscape { width: 220px; height: 108px; margin-bottom: 2px; }
.garden-loading h2 { color: var(--garden-cream); font: 400 clamp(26px, 4vw, 32px)/1.25 var(--font-display); letter-spacing: -.5px; white-space: normal; }
.garden-loading-status { min-height: 24px; font-size: 14px; line-height: 1.7; color: #e1eadb; }
.garden-loading-track { display: flex; gap: 6px; width: 100%; margin-top: 8px; }
.garden-loading-track > span { flex: 1; height: 5px; border-radius: 2px; background: #9ab69b30; }
.garden-loading-track > .current { background: #d5bb8166; }
.garden-loading-track > .complete { background: #e6c180; }
.garden-loading-stages { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; width: 100%; list-style: none; }
.garden-loading-stages li { display: flex; justify-content: center; align-items: center; gap: 5px; color: #b4c8b7; font-size: 12px; line-height: 1.5; }
.garden-loading-stages .current { color: var(--garden-cream); }
.garden-loading-stages .complete { color: #e6c180; }
.garden-loading-stages .iconify { flex-shrink: 0; width: 14px; height: 14px; }
.garden-loading small { max-width: 310px; margin-top: 8px; color: #b4c8b7; font-size: 12px; line-height: 1.7; }
@media (prefers-reduced-motion: no-preference) { .garden-loading-sprout { animation: sprout-breathe 4s ease-in-out infinite; } .garden-loading-track > span { transition: background-color .2s; } }
@media (max-height: 450px) { .garden-loading { gap: 8px; } .garden-loading-landscape { width: 140px; height: 64px; } .garden-loading small { margin-top: 0; } }
@keyframes sprout-breathe { 50% { transform: translateY(-2px); opacity: .75; } }
</style>

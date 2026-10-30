<script setup lang="ts">
const props = withDefaults(defineProps<{ completed: number, phase: 'opening' | 'stories' | 'places', kind?: 'garden' | 'memorial' }>(), { kind: 'garden' })
const { t } = useI18n()
const stages = ['opening', 'stories', 'places'] as const
const milestones = computed(() => Math.max(0, Math.min(stages.length, Math.floor(Number.isFinite(props.completed) ? props.completed : 0))))
const activeStep = computed(() => Math.min(stages.length, milestones.value + 1))
const prefix = computed(() => props.kind === 'memorial' ? 'memorial.preparing' : 'garden.preparing')
const stepLabel = computed(() => t('garden.preparing.step', { step: activeStep.value, total: stages.length }))
const phaseLabel = computed(() => t(`${prefix.value}.${props.phase}`))
</script>

<template>
  <div class="garden-loading" data-testid="garden-loading" :data-phase="phase" :data-kind="kind" :data-completed="milestones">
    <div class="garden-loading-heading">
      <svg class="garden-loading-landscape" viewBox="0 0 84 72" fill="none" aria-hidden="true">
        <ellipse cx="42" cy="61" rx="34" ry="7" fill="currentColor" opacity=".09" />
        <path d="M11 60C25 50 35 61 47 53C57 47 66 52 75 59" stroke="currentColor" stroke-opacity=".28" stroke-width="1.5" stroke-linecap="round" />
        <path d="M36 61C53 56 44 51 55 46" stroke="currentColor" stroke-opacity=".45" stroke-width="3.5" stroke-linecap="round" />
        <g class="garden-loading-sprout" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M39 48V30M39 40C26 40 26 28 26 28C39 27 39 40 39 40ZM39 33C39 19 51 19 51 19C52 32 39 33 39 33ZM32 49H46" />
        </g>
        <circle cx="64" cy="23" r="2" fill="currentColor" opacity=".7" />
        <circle cx="20" cy="20" r="1.5" fill="currentColor" opacity=".4" />
      </svg>
      <div>
        <p class="garden-loading-step">{{ stepLabel }}</p>
        <h2>{{ t(`${prefix}.title`) }}</h2>
      </div>
    </div>
    <p class="garden-loading-status" role="status" aria-live="polite" aria-atomic="true">{{ phaseLabel }}</p>
    <div class="garden-loading-track" role="progressbar" :aria-label="t(`${prefix}.label`)" :aria-valuenow="milestones" :aria-valuemin="0" :aria-valuemax="stages.length" :aria-valuetext="`${stepLabel}. ${phaseLabel}`">
      <span v-for="(stage, index) in stages" :key="stage" :class="{ complete: milestones > index, current: milestones < stages.length && activeStep === index + 1 }" />
    </div>
    <ol class="garden-loading-stages" aria-hidden="true">
      <li v-for="(stage, index) in stages" :key="stage" :class="{ complete: milestones > index, current: milestones < stages.length && activeStep === index + 1 }">
        <UIcon :name="milestones > index ? 'i-lucide-check' : activeStep === index + 1 ? 'i-lucide-loader-circle' : 'i-lucide-circle-small'" />
        <span>{{ t(`${prefix}.stages.${stage}`) }}</span>
      </li>
    </ol>
    <small>{{ t(kind === 'memorial' ? 'memorial.preparing.hint' : 'garden.loadingHint') }}</small>
  </div>
</template>

<style scoped>
.garden-loading { display: grid; gap: 16px; width: min(420px, calc(100% - 32px)); max-height: calc(100% - 32px); padding: 26px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--garden-control-border); border-radius: var(--panel-radius); background: color-mix(in srgb, var(--garden-night) 94%, transparent); box-shadow: 0 18px 54px #102f324d, inset 0 1px #fff9ed0a; color: var(--color-garden-100); }
.garden-loading-heading { display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: center; gap: 16px; }
.garden-loading-landscape { display: block; width: 64px; height: 60px; color: var(--color-lantern-300); }
.garden-loading-step { margin-bottom: 6px; color: var(--color-garden-200); font-size: 12px; line-height: 1.5; font-variant-numeric: tabular-nums; }
.garden-loading h2 { margin: 0; color: var(--garden-cream); font: 400 26px/1.2 var(--font-display); letter-spacing: -.4px; white-space: normal; }
.garden-loading-status { min-height: 24px; font-size: 14px; line-height: 1.7; color: var(--garden-cream); }
.garden-loading-track { display: flex; gap: 6px; width: 100%; }
.garden-loading-track > span { position: relative; flex: 1; height: 5px; overflow: hidden; border-radius: 2px; background: var(--garden-control-hover); }
.garden-loading-track > .current { background: color-mix(in srgb, var(--color-lantern-300) 32%, var(--garden-control-bg)); }
.garden-loading-track > .current::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, var(--color-lantern-300), transparent); }
.garden-loading-track > .complete { background: var(--color-lantern-300); }
.garden-loading-stages { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; width: 100%; list-style: none; }
.garden-loading-stages li { display: grid; justify-items: center; align-content: start; gap: 6px; color: var(--color-garden-200); font-size: 12px; line-height: 1.5; text-align: center; }
.garden-loading-stages .current { color: var(--garden-cream); }
.garden-loading-stages .complete { color: var(--color-lantern-300); }
.garden-loading-stages .iconify { width: 16px; height: 16px; }
.garden-loading small { display: block; padding-top: 14px; border-top: 1px solid var(--garden-control-border); color: var(--color-garden-200); font-size: 13px; line-height: 1.65; }
@media (prefers-reduced-motion: no-preference) {
  .garden-loading-track > .current::after { animation: stage-pending 1.6s ease-in-out infinite; }
  .garden-loading-stages .current .iconify { animation: stage-turn 1.8s linear infinite; }
}
@media (max-width: 480px) { .garden-loading { padding: 20px; gap: 14px; } .garden-loading-heading { grid-template-columns: 48px minmax(0, 1fr); gap: 12px; } .garden-loading-landscape { width: 48px; height: 52px; } .garden-loading h2 { font-size: 24px; } }
@media (max-height: 450px) { .garden-loading { padding: 18px 22px; gap: 10px; } .garden-loading-heading { grid-template-columns: 44px minmax(0, 1fr); gap: 12px; } .garden-loading-landscape { width: 44px; height: 44px; } .garden-loading h2 { font-size: 23px; } .garden-loading-stages li { display: flex; justify-content: center; align-items: center; gap: 5px; } .garden-loading small { padding-top: 10px; } }
@media (forced-colors: active) { .garden-loading { border-color: CanvasText; background: Canvas; color: CanvasText; } .garden-loading h2, .garden-loading-status, .garden-loading-step, .garden-loading small, .garden-loading-stages li { color: inherit; } .garden-loading-track > span { border: 1px solid CanvasText; } .garden-loading-track > .complete { background: Highlight; } }
@keyframes stage-pending { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
@keyframes stage-turn { to { transform: rotate(360deg); } }
</style>

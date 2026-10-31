<script setup lang="ts">
import type { GardenDiagnosticSnapshot, GardenDiagnosticsReport } from '../utils/gardenDiagnostics'
import type { GardenBenchmarkRequest } from '../utils/gardenBenchmarkProtocol'

type RunnerProgress = { status: 'idle' | 'warming' | 'measuring' | 'switching' | 'completed' | 'cancelled' | 'error', scenario: string, repeat: number, total: number, completed: number, error?: string }
const props = defineProps<{ snapshot?: GardenDiagnosticSnapshot, mode: 'panel' | 'collect', fpsLimit: 30 | 60, recording: boolean, runner: RunnerProgress, results: GardenDiagnosticsReport[] }>()
const emit = defineEmits<{ mode: [value: 'panel' | 'collect'], fps: [value: 30 | 60], start: [scenario: string], stop: [], export: [runId?: string], open: [value: boolean], benchmark: [request: GardenBenchmarkRequest], cancelBenchmark: [] }>()
const { t, te, locale } = useI18n()
const opened = ref(false)
const scenario = ref('manual')
const benchmarkScenario = ref<GardenBenchmarkRequest['scenario']>('camera')
const benchmarkScope = ref<GardenBenchmarkRequest['scope']>('current')
const prefix = 'garden.diagnostics'
const ids = useId()
const context = computed(() => props.snapshot?.context)
const numberFormat = computed(() => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }))
const busy = computed(() => ['warming', 'measuring', 'switching'].includes(props.runner.status))
const modeItems = computed(() => [{ value: 'panel', label: t(`${prefix}.panelMode`) }, { value: 'collect', label: t(`${prefix}.collectMode`) }])
const fpsItems = computed(() => [{ value: 30, label: t(`${prefix}.fpsOption`, { limit: 30 }) }, { value: 60, label: t(`${prefix}.fpsOption`, { limit: 60 }) }])
const benchmarkItems = computed(() => (['steady-effects-on', 'steady-effects-off', 'camera', 'pointer-wheel', 'switching', 'opening', 'suite'] as const).map(id => ({ value: id, label: t(`${prefix}.scenarios.${id}`) })))
const scopeItems = computed(() => [{ value: 'current', label: t(`${prefix}.scopeCurrent`) }, { value: 'all', label: t(`${prefix}.scopeAll`) }])
const selectedMode = computed({ get: () => props.mode, set: value => { if (value === 'panel' || value === 'collect') emit('mode', value) } })
const selectedFps = computed({ get: () => props.fpsLimit, set: value => { if (value === 30 || value === 60) emit('fps', value) } })
const metrics = computed(() => props.snapshot ? [
  { key: 'tickIntervals', label: 'tickInterval', value: props.snapshot.tickIntervals },
  { key: 'updateCpu', label: 'updateCpu', value: props.snapshot.updateCpu },
  { key: 'renderCpu', label: 'renderCpu', value: props.snapshot.renderCpu },
  { key: 'allRenderCpu', label: 'allRenderCpu', value: props.snapshot.allRenderCpu },
  { key: 'generationMs', label: 'generation', value: props.snapshot.generationMs },
  { key: 'preparationMs', label: 'preparation', value: props.snapshot.preparationMs },
  { key: 'apiWaitMs', label: 'apiWait', value: props.snapshot.apiWaitMs },
  { key: 'totalReadyMs', label: 'totalReady', value: props.snapshot.totalReadyMs }
] : [])
const gardenName = computed(() => {
  const garden = context.value?.garden
  return garden && ['meadow', 'lake', 'grove', 'hill'].includes(garden) ? t(`garden.names.${garden}`) : t('garden.title')
})
function value(number: number | null | undefined) { return number === null || number === undefined || !Number.isFinite(number) ? '—' : numberFormat.value.format(number) }
function stateLabel(state: string) { return te(`${prefix}.states.${state}`) ? t(`${prefix}.states.${state}`) : state }
function reasonLabel(reason: string) {
  const key = reason.startsWith('conditions:') ? reason.slice('conditions:'.length) : reason
  return te(`${prefix}.reasons.${key}`) ? t(`${prefix}.reasons.${key}`) : reason
}
function start() { if (!busy.value) emit('start', scenario.value.trim().slice(0, 80) || 'manual') }
function scenarioKeydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); start() } }
function resultStatus(result: GardenDiagnosticsReport) {
  if (result.validation) return t(`${prefix}.${result.validation.valid ? 'comparable' : 'invalidResult'}`)
  if (result.endReason?.includes('cancel')) return t(`${prefix}.runner.cancelled`)
  if (result.endReason?.includes('condition')) return t(`${prefix}.conditionsChanged`)
  return t(`${prefix}.runner.completed`)
}
function endedAt(result: GardenDiagnosticsReport) {
  const date = new Date(result.endedAt ?? result.capturedAt)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short' }).format(date) : ''
}
function benchmarkEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !busy.value) return
  event.preventDefault()
  event.stopPropagation()
  opened.value = false
}
watch(opened, state => emit('open', state))
onBeforeUnmount(() => { if (opened.value) emit('open', false) })
</script>

<template>
  <UPopover v-model:open="opened" :dismissible="!busy" :content="{ side: 'bottom', align: 'end', sideOffset: 10, collisionPadding: 12, prioritizePosition: true, sticky: 'always' }" :ui="{ content: 'bg-(--surface-panel) rounded-(--panel-radius) ring-1 ring-(--ui-border) shadow-xl' }">
    <button type="button" class="diagnostics-toggle" :aria-label="t(`${prefix}.title`)" :title="t(`${prefix}.title`)" data-testid="diagnostics-toggle"><UIcon name="i-lucide-gauge" aria-hidden="true" /><span class="camera-tool-label">{{ t(`${prefix}.title`) }}</span></button>
    <template #content>
      <section class="diagnostics-panel" :aria-labelledby="`${ids}-title`" :aria-describedby="`${ids}-description`" :data-recording="recording" :data-runner-status="runner.status" data-testid="diagnostics-panel" @keydown.capture="benchmarkEscape">
        <header class="diagnostics-heading">
          <div><h2 :id="`${ids}-title`">{{ t(`${prefix}.title`) }}</h2><p :id="`${ids}-description`">{{ t(`${prefix}.description`) }}</p></div>
          <button type="button" class="diagnostics-close" :aria-label="t(`${prefix}.close`)" @click="opened = false"><UIcon name="i-lucide-x" aria-hidden="true" /></button>
        </header>
        <section class="diagnostics-actions" :aria-labelledby="`${ids}-recording`">
          <div class="diagnostics-section-heading"><h3 :id="`${ids}-recording`">{{ t(`${prefix}.recordingHeading`) }}</h3><span data-testid="diagnostics-recording-status">{{ t(recording ? `${prefix}.recording` : `${prefix}.notRecording`) }}</span></div>
          <div><label :for="`${ids}-scenario`">{{ t(`${prefix}.scenario`) }}</label><UInput :id="`${ids}-scenario`" v-model="scenario" :disabled="busy" :maxlength="80" :aria-describedby="`${ids}-scenario-help`" class="w-full" autocomplete="off" @keydown="scenarioKeydown" /><p :id="`${ids}-scenario-help`" class="diagnostics-note">{{ t(`${prefix}.scenarioHelp`) }}</p></div>
          <div class="diagnostics-action-row"><UButton icon="i-lucide-circle" class="min-h-11" :disabled="busy" data-testid="diagnostics-start" @click="start">{{ t(recording ? `${prefix}.startNew` : `${prefix}.start`) }}</UButton><UButton color="neutral" variant="outline" icon="i-lucide-square" class="min-h-11" :disabled="!recording || busy" data-testid="diagnostics-stop" @click="emit('stop')">{{ t(`${prefix}.stop`) }}</UButton></div>
          <p class="diagnostics-note">{{ t(`${prefix}.recordingHelp`) }}</p>
        </section>
        <div class="diagnostics-settings">
          <div><label :for="`${ids}-mode`">{{ t(`${prefix}.mode`) }}</label><USelect :id="`${ids}-mode`" v-model="selectedMode" :disabled="busy" :items="modeItems" value-key="value" class="w-full" data-testid="diagnostics-mode" /></div>
          <div><label :for="`${ids}-fps`">{{ t(`${prefix}.fpsLimit`) }}</label><USelect :id="`${ids}-fps`" v-model="selectedFps" :disabled="busy" :items="fpsItems" value-key="value" class="w-full" data-testid="diagnostics-fps" /></div>
        </div>
        <p class="diagnostics-note">{{ t(`${prefix}.fpsHelp`) }}</p>
        <section class="diagnostics-benchmark" :aria-labelledby="`${ids}-benchmark`">
          <h3 :id="`${ids}-benchmark`">{{ t(`${prefix}.benchmarkHeading`) }}</h3>
          <p class="diagnostics-note">{{ t(`${prefix}.benchmarkHelp`) }}</p>
          <div><label :for="`${ids}-benchmark-scenario`">{{ t(`${prefix}.benchmarkScenario`) }}</label><USelect :id="`${ids}-benchmark-scenario`" v-model="benchmarkScenario" :disabled="busy" :items="benchmarkItems" value-key="value" class="w-full" data-testid="diagnostics-benchmark-scenario" /></div>
          <div><label :for="`${ids}-scope`">{{ t(`${prefix}.scope`) }}</label><USelect :id="`${ids}-scope`" v-model="benchmarkScope" :disabled="busy" :items="scopeItems" value-key="value" class="w-full" data-testid="diagnostics-benchmark-scope" /></div>
          <div class="diagnostics-action-row"><UButton icon="i-lucide-play" class="min-h-11" :disabled="busy" data-testid="diagnostics-benchmark-start" @click="emit('benchmark', { scenario: benchmarkScenario, scope: benchmarkScope })">{{ t(`${prefix}.startBenchmark`) }}</UButton><UButton v-if="busy" color="neutral" variant="outline" class="min-h-11" data-testid="diagnostics-benchmark-cancel" @click="emit('cancelBenchmark')">{{ t(`${prefix}.cancelBenchmark`) }}</UButton></div>
          <div class="diagnostics-benchmark-status" data-testid="diagnostics-runner-status" role="status" aria-live="polite" aria-atomic="true"><strong>{{ t(`${prefix}.runner.${runner.status}`) }}</strong><span v-if="runner.total">{{ t(`${prefix}.benchmarkProgress`, { completed: runner.completed, total: runner.total, repeat: runner.repeat }) }}</span></div>
          <div v-if="busy && runner.total" class="diagnostics-progress" role="progressbar" :aria-label="t(`${prefix}.benchmarkHeading`)" :aria-valuemin="0" :aria-valuemax="runner.total" :aria-valuenow="runner.completed"><span :style="{ width: `${Math.min(100, runner.completed / runner.total * 100)}%` }" /></div>
          <p v-if="runner.error" role="alert" class="diagnostics-error">{{ runner.error }}</p>
        </section>
        <p v-if="mode === 'collect'" class="diagnostics-collect">{{ t(`${prefix}.collectHelp`) }}</p>
        <template v-else-if="snapshot">
          <div class="diagnostics-run"><span>{{ t(snapshot.active ? `${prefix}.active` : `${prefix}.paused`) }}</span><span>{{ t(`${prefix}.activeTime`, { seconds: value(snapshot.activeMs / 1000) }) }}</span></div>
          <h3>{{ t(`${prefix}.currentWindow`) }}</h3>
          <dl class="diagnostics-rates">
            <div><dt>{{ t(`${prefix}.tickRate`) }}</dt><dd>{{ value(snapshot.rates.current.ticksPerSecond) }}<small>{{ t(`${prefix}.perSecond`) }}</small></dd></div>
            <div><dt>{{ t(`${prefix}.renderRate`) }}</dt><dd>{{ value(snapshot.rates.current.rendersPerSecond) }}<small>{{ t(`${prefix}.perSecond`) }}</small></dd></div>
          </dl>
          <h3>{{ t(`${prefix}.averageWindow`) }}</h3>
          <dl class="diagnostics-rates diagnostics-average">
            <div><dt>{{ t(`${prefix}.tickRate`) }}</dt><dd>{{ value(snapshot.rates.average.ticksPerSecond) }}<small>{{ t(`${prefix}.perSecond`) }}</small></dd></div>
            <div><dt>{{ t(`${prefix}.renderRate`) }}</dt><dd>{{ value(snapshot.rates.average.rendersPerSecond) }}<small>{{ t(`${prefix}.perSecond`) }}</small></dd></div>
          </dl>
          <p class="diagnostics-note">{{ t(`${prefix}.activeHelp`) }}</p>
          <table class="diagnostics-timings">
            <caption>{{ t(`${prefix}.timings`) }}</caption>
            <thead><tr><th scope="col">{{ t(`${prefix}.measurement`) }}</th><th scope="col">p50</th><th scope="col">p95</th><th scope="col">p99</th></tr></thead>
            <tbody><tr v-for="metric in metrics" :key="metric.key"><th scope="row">{{ t(`${prefix}.${metric.label}`) }}<small>{{ t(`${prefix}.samples`, { count: value(metric.value.total) }) }}</small></th><td>{{ value(metric.value.p50) }}</td><td>{{ value(metric.value.p95) }}</td><td>{{ value(metric.value.p99) }}</td></tr></tbody>
          </table>
          <p class="diagnostics-note">{{ t(`${prefix}.cpuHelp`) }}</p>
          <div v-if="context" class="diagnostics-context">
            <h3>{{ t(`${prefix}.context`) }}</h3>
            <dl>
              <div><dt>{{ t(`${prefix}.garden`) }}</dt><dd>{{ gardenName }}</dd></div>
              <div><dt>{{ t(`${prefix}.chunks`) }}</dt><dd>{{ value(context.chunks.visible) }} / {{ value(context.chunks.total) }}</dd></div>
              <div><dt>{{ t(`${prefix}.memorials`) }}</dt><dd>{{ value(context.memorialCount) }}</dd></div>
              <div><dt>{{ t(`${prefix}.rebuilds`) }}</dt><dd>{{ value(context.rebuilds) }}</dd></div>
              <div><dt>{{ t(`${prefix}.seed`) }}</dt><dd>{{ value(context.seed) }}</dd></div>
              <div><dt>{{ t(`${prefix}.zoom`) }}</dt><dd>{{ value(context.zoom * 100) }}%</dd></div>
              <div><dt>{{ t(`${prefix}.dpr`) }}</dt><dd>{{ value(context.dpr) }}</dd></div>
              <div><dt>{{ t(`${prefix}.resolution`) }}</dt><dd>{{ value(context.renderResolution) }}</dd></div>
              <div><dt>{{ t(`${prefix}.viewport`) }}</dt><dd>{{ value(context.viewport.width) }} × {{ value(context.viewport.height) }}</dd></div>
              <div><dt>{{ t(`${prefix}.drawing`) }}</dt><dd>{{ value(context.rendererWidth) }} × {{ value(context.rendererHeight) }}</dd></div>
              <div><dt>{{ t(`${prefix}.effects`) }}</dt><dd>{{ stateLabel(context.effects) }}</dd></div>
              <div><dt>{{ t(`${prefix}.animation`) }}</dt><dd>{{ stateLabel(context.animation) }}</dd></div>
              <div><dt>{{ t(`${prefix}.nodes`) }}</dt><dd>{{ value(snapshot.resources.totalNodes) }}</dd></div>
              <div><dt>{{ t(`${prefix}.containers`) }}</dt><dd>{{ value(snapshot.resources.containers) }}</dd></div>
              <div><dt>{{ t(`${prefix}.graphics`) }}</dt><dd>{{ value(snapshot.resources.graphics) }}</dd></div>
              <div><dt>{{ t(`${prefix}.texts`) }}</dt><dd>{{ value(snapshot.resources.texts) }}</dd></div>
              <div><dt>{{ t(`${prefix}.cacheNodes`) }}</dt><dd>{{ value(snapshot.resources.cacheNodes) }}</dd></div>
              <div><dt>{{ t(`${prefix}.renderTextures`) }}</dt><dd>{{ value(snapshot.resources.renderTextures) }}</dd></div>
              <div><dt>{{ t(`${prefix}.weatherPasses`) }}</dt><dd>{{ value(snapshot.resources.atmospherePasses) }}</dd></div>
              <div class="diagnostics-wide"><dt>{{ t(`${prefix}.run`) }}</dt><dd>{{ snapshot.scenario }} · {{ snapshot.runId }}</dd></div>
              <div class="diagnostics-wide"><dt>{{ t(`${prefix}.build`) }}</dt><dd>{{ snapshot.buildId }}</dd></div>
              <div class="diagnostics-wide"><dt>{{ t(`${prefix}.browser`) }}</dt><dd>{{ context.browser }}</dd></div>
            </dl>
          </div>
        </template>
        <p v-else class="diagnostics-note" role="status">{{ t(`${prefix}.waiting`) }}</p>
        <section class="diagnostics-results" :aria-labelledby="`${ids}-results`" data-testid="diagnostics-results">
          <h3 :id="`${ids}-results`">{{ t(`${prefix}.resultsHeading`, { count: results.length }) }}</h3>
          <p class="diagnostics-note">{{ t(`${prefix}.resultsHelp`) }}</p>
          <p v-if="!results.length" class="diagnostics-note">{{ t(`${prefix}.noResults`) }}</p>
          <article v-for="result in results" :key="result.runId" class="diagnostics-result" :data-testid="`diagnostics-result-${result.runId}`" :data-end-reason="result.endReason" :data-valid="result.validation?.valid ?? 'manual'">
            <div class="diagnostics-section-heading"><h4>{{ result.scenario }}</h4><span>{{ resultStatus(result) }}</span></div>
            <p class="diagnostics-note">{{ endedAt(result) }}</p>
            <dl><div><dt>{{ t(`${prefix}.resultDuration`) }}</dt><dd>{{ value(result.elapsedMs / 1000) }} {{ t(`${prefix}.seconds`) }}</dd></div><div><dt>{{ t(`${prefix}.activeDuration`) }}</dt><dd>{{ value(result.activeMs / 1000) }} {{ t(`${prefix}.seconds`) }}</dd></div><div><dt>{{ t(`${prefix}.resultCurrent`) }}</dt><dd>{{ value(result.rates.current.rendersPerSecond) }}{{ t(`${prefix}.perSecond`) }}</dd></div><div><dt>{{ t(`${prefix}.resultAverage`) }}</dt><dd>{{ value(result.rates.average.rendersPerSecond) }}{{ t(`${prefix}.perSecond`) }}</dd></div><div><dt>{{ t(`${prefix}.resultP95`) }}</dt><dd>{{ value(result.renderCpu.p95) }} {{ t(`${prefix}.milliseconds`) }}</dd></div><div><dt>{{ t(`${prefix}.fpsLimit`) }}</dt><dd>{{ result.configuration?.fpsLimit ?? result.context.fpsLimit }}</dd></div></dl>
            <p v-if="result.endReason" class="diagnostics-note">{{ t(`${prefix}.endReason`) }}: {{ reasonLabel(result.endReason) }}</p>
            <ul v-if="result.validation?.reasons.length" class="diagnostics-result-reasons"><li v-for="reason in result.validation.reasons" :key="reason">{{ reason }}</li></ul>
            <UButton color="neutral" variant="outline" icon="i-lucide-download" class="min-h-11" :disabled="busy" :data-testid="`diagnostics-result-export-${result.runId}`" :aria-label="t(`${prefix}.exportResult`, { scenario: result.scenario })" @click="emit('export', result.runId)">{{ t(`${prefix}.export`) }}</UButton>
          </article>
          <UButton icon="i-lucide-download" class="min-h-11" :disabled="busy || !snapshot?.runId" data-testid="diagnostics-export" @click="emit('export')">{{ t(`${prefix}.exportCurrent`) }}</UButton>
        </section>
        <p class="diagnostics-note">{{ t(`${prefix}.privacy`) }}</p>
      </section>
    </template>
  </UPopover>
</template>

<style scoped>
.camera-tool-label { display: none; }
.diagnostics-toggle { display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--control-radius); color: var(--garden-control-text); cursor: pointer; }
.diagnostics-toggle:hover { background: var(--garden-control-hover); }
.diagnostics-toggle:focus-visible { outline: var(--focus-width) solid var(--color-lantern-300); outline-offset: -2px; }
.diagnostics-toggle > .iconify { width: 19px; height: 19px; }
.diagnostics-panel { display: grid; gap: 16px; width: min(460px, calc(100vw - 24px)); max-height: min(720px, calc(100dvh - 32px), var(--reka-popover-content-available-height, 720px)); padding: 20px; overflow-y: auto; overscroll-behavior: contain; color: var(--ui-text); background: var(--surface-panel); border-radius: var(--panel-radius); font: 14px/1.5 var(--font-sans); }
.diagnostics-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.diagnostics-heading h2 { color: var(--ui-text-highlighted); font: 26px/1.15 var(--font-display); margin-bottom: 6px; }
.diagnostics-heading p, .diagnostics-note { color: var(--ui-text-muted); font-size: 12px; line-height: 1.6; }
.diagnostics-close { display: grid; place-items: center; flex-shrink: 0; width: 44px; height: 44px; border-radius: var(--control-radius); cursor: pointer; }
.diagnostics-close:hover { background: var(--garden-mist); }
.diagnostics-close:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
.diagnostics-close > .iconify { width: 20px; height: 20px; }
.diagnostics-settings { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.diagnostics-panel label { display: block; margin-bottom: 6px; color: var(--ui-text-highlighted); font-size: 13px; font-weight: 600; }
.diagnostics-panel h3 { color: var(--ui-text-highlighted); font-size: 14px; font-weight: 600; }
.diagnostics-section-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 6px 12px; }
.diagnostics-section-heading > span { color: var(--ui-text-muted); font-size: 12px; }
.diagnostics-benchmark, .diagnostics-results { display: grid; gap: 12px; padding-top: 16px; border-top: 1px solid var(--ui-border); }
.diagnostics-benchmark-status { display: grid; gap: 3px; font-size: 12px; }
.diagnostics-benchmark-status strong { color: var(--ui-text-highlighted); font-weight: 600; }
.diagnostics-progress { height: 5px; overflow: hidden; border-radius: var(--control-radius); background: var(--garden-mist); }
.diagnostics-progress > span { display: block; height: 100%; background: var(--ui-primary); }
.diagnostics-error { color: var(--ui-error); font-size: 13px; }
.diagnostics-result { display: grid; gap: 10px; min-width: 0; padding: 14px; border: 1px solid var(--ui-border); border-radius: var(--control-radius); }
.diagnostics-result h4 { color: var(--ui-text-highlighted); font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.diagnostics-result dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; font-size: 12px; }
.diagnostics-result dt { color: var(--ui-text-muted); }
.diagnostics-result dd { color: var(--ui-text-highlighted); font-variant-numeric: tabular-nums; }
.diagnostics-result-reasons { padding-left: 18px; color: var(--ui-text); list-style: disc; font-size: 12px; overflow-wrap: anywhere; }
.diagnostics-result > button { justify-self: start; }
.diagnostics-run { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; border-top: 1px solid var(--ui-border); padding-top: 16px; font-size: 12px; }
.diagnostics-run > :first-child { color: var(--ui-text-highlighted); font-weight: 600; }
.diagnostics-rates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.diagnostics-rates > div { padding: 12px; background: var(--garden-mist); border-radius: var(--control-radius); }
.diagnostics-rates dt { font-size: 12px; }
.diagnostics-rates dd { color: var(--ui-text-highlighted); font-size: 28px; font-variant-numeric: tabular-nums; }
.diagnostics-rates small { margin-left: 6px; color: var(--ui-text-muted); font-size: 12px; }
.diagnostics-average dd { font-size: 22px; }
.diagnostics-timings { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; font-variant-numeric: tabular-nums; }
.diagnostics-timings caption { padding-bottom: 8px; color: var(--ui-text-highlighted); text-align: left; font-size: 14px; font-weight: 600; }
.diagnostics-timings th, .diagnostics-timings td { padding: 9px 3px; border-bottom: 1px solid var(--ui-border); text-align: right; vertical-align: top; }
.diagnostics-timings th:first-child { width: 49%; padding-left: 0; text-align: left; overflow-wrap: anywhere; }
.diagnostics-timings tbody th { font-weight: 400; }
.diagnostics-timings small { display: block; color: var(--ui-text-muted); font-size: 11px; }
.diagnostics-context { border-top: 1px solid var(--ui-border); padding-top: 16px; }
.diagnostics-context h3 { margin-bottom: 10px; color: var(--ui-text-highlighted); font-size: 14px; font-weight: 600; }
.diagnostics-context dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; font-size: 12px; }
.diagnostics-context dt { color: var(--ui-text-muted); }
.diagnostics-context dd { color: var(--ui-text-highlighted); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.diagnostics-context .diagnostics-wide { grid-column: 1 / -1; }
.diagnostics-actions { display: grid; gap: 12px; padding-top: 16px; border-top: 1px solid var(--ui-border); }
.diagnostics-actions .diagnostics-note { margin-top: 6px; }
.diagnostics-action-row { display: flex; flex-wrap: wrap; gap: 10px; }
.diagnostics-collect { padding: 12px; background: var(--garden-mist); border-radius: var(--control-radius); }
@media (max-width: 380px) { .diagnostics-panel { padding: 16px; } .diagnostics-settings { grid-template-columns: minmax(0, 1fr); } }
@media (max-height: 450px) { .diagnostics-panel { padding: 16px; gap: 12px; } }
</style>

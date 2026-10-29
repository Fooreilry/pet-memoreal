<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { GardenId } from '#shared/gardens'
import type { PetSpecies } from '#shared/pet-species'

const props = defineProps<{
  mode: 'create' | 'edit'
  title: string
  label: string
  intro: string
  backTo: RouteLocationRaw
  backLabel: string
  summaryTitle?: string
  summaryDetail?: string
  summaryNote: string
  gardenId?: GardenId
  species?: PetSpecies
  showState?: boolean
}>()
const { t } = useI18n()
const gardenIcons = { meadow: 'i-lucide-flower-2', lake: 'i-lucide-waves', grove: 'i-lucide-trees', hill: 'i-lucide-mountain' }
const gardenIcon = computed(() => gardenIcons[props.gardenId ?? 'meadow'])
</script>

<template>
  <div class="memorial-form-page" :class="`memorial-${mode}-page`" :data-testid="`memorial-${mode}-page`">
    <a :href="`#memorial-${mode}-main`" class="skip-link">{{ t('nav.skip') }}</a>
    <GardenHeader />
    <main :id="`memorial-${mode}-main`" class="memorial-form-container" tabindex="-1">
      <NuxtLink :to="backTo" class="memorial-form-back" :data-testid="`memorial-${mode}-back`"><UIcon name="i-lucide-arrow-left" aria-hidden="true" />{{ backLabel }}</NuxtLink>
      <div class="memorial-form-heading">
        <p class="eyebrow">{{ label }}</p>
        <h1>{{ title }}</h1>
        <p>{{ intro }}</p>
      </div>
      <div v-if="showState" class="memorial-form-panel" :data-testid="`memorial-${mode}-state`"><slot name="state" /></div>
      <div v-else class="memorial-form-layout">
        <section class="memorial-form-panel" :aria-label="title"><slot /></section>
        <aside class="memorial-form-summary">
          <p class="eyebrow">{{ t('creation.page.summaryTitle') }}</p>
          <span class="memorial-form-emblem" aria-hidden="true"><PetSpeciesIcon v-if="species" :species="species" /><UIcon v-else :name="gardenIcon" /></span>
          <h2 v-if="summaryTitle">{{ summaryTitle }}</h2>
          <p v-if="summaryDetail" class="memorial-form-detail">{{ summaryDetail }}</p>
          <p class="memorial-form-note">{{ summaryNote }}</p>
        </aside>
      </div>
    </main>
  </div>
</template>

<style scoped>
.memorial-form-page { min-height: 100dvh; background: var(--garden-cream); color: var(--ui-text); }
.memorial-form-container { width: min(1040px, calc(100% - 48px)); margin-inline: auto; padding-block: 24px 72px; }
.memorial-form-back { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: 14px; color: var(--ui-text-toned); text-decoration: underline; text-underline-offset: 4px; }
.memorial-form-back:hover { color: var(--ui-text-highlighted); }
.memorial-form-back:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); border-radius: 4px; }
.memorial-form-container:focus { outline: none; }
.memorial-form-heading { max-width: 690px; margin-block: 20px 32px; }
.memorial-form-heading h1 { margin-block: 12px 16px; color: var(--ui-text-highlighted); font-family: var(--font-display); font-size: clamp(32px, 4vw, 46px); font-weight: 400; line-height: 1.15; letter-spacing: -0.035em; }
.memorial-form-heading > p:last-child { max-width: 620px; color: var(--ui-text); font-size: 16px; line-height: 1.75; }
.memorial-form-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(220px, 1fr); align-items: start; gap: 40px; }
.memorial-form-panel { min-width: 0; padding: 32px; border: 1px solid var(--ui-border); border-radius: var(--panel-radius); background: var(--surface-panel); }
.memorial-form-summary { position: sticky; top: 28px; padding: 26px 0; }
.memorial-form-summary > .eyebrow { margin-bottom: 22px; }
.memorial-form-emblem { display: grid; place-items: center; width: 60px; height: 60px; margin-bottom: 20px; border-radius: var(--panel-radius); background: var(--ui-bg-accented); color: var(--color-garden-700); }
.memorial-form-emblem > * { width: 28px; height: 28px; }
.memorial-form-summary h2 { overflow-wrap: anywhere; font-family: var(--font-display); font-size: 30px; font-weight: 400; line-height: 1.3; }
.memorial-form-detail { margin-top: 8px; color: var(--ui-text); font-size: 15px; font-variant-numeric: tabular-nums; }
.memorial-form-note { margin-top: 28px; padding-top: 24px; border-top: 1px solid var(--ui-border); font-size: 15px; line-height: 1.8; color: var(--ui-text); }
@media (max-width: 700px) { .memorial-form-container { width: min(100% - 32px, 620px); padding-block: 16px 40px; } .memorial-form-heading { margin-top: 16px; } .memorial-form-layout { grid-template-columns: 1fr; gap: 12px; } .memorial-form-panel { padding: 24px 20px; } .memorial-form-summary { position: static; padding: 16px 8px; } .memorial-form-emblem, .memorial-form-summary > .eyebrow, .memorial-form-summary h2, .memorial-form-detail { display: none; } .memorial-form-note { margin: 0; padding-top: 0; border: 0; } }
</style>

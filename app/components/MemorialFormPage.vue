<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

defineProps<{
  mode: 'create' | 'edit'
  title: string
  label: string
  intro: string
  backTo: RouteLocationRaw
  backLabel: string
  summaryTitle?: string
  summaryDetail?: string
  summaryNote: string
  showState?: boolean
}>()
const { t } = useI18n()
</script>

<template>
  <div class="memorial-form-page" :class="`memorial-${mode}-page`" :data-testid="`memorial-${mode}-page`">
    <a :href="`#memorial-${mode}-main`" class="skip-link">{{ t('nav.skip') }}</a>
    <GardenHeader />
    <main :id="`memorial-${mode}-main`" class="memorial-form-container">
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
          <span class="memorial-form-emblem" aria-hidden="true"><UIcon name="i-lucide-paw-print" /></span>
          <h2 v-if="summaryTitle">{{ summaryTitle }}</h2>
          <p v-if="summaryDetail" class="memorial-form-detail">{{ summaryDetail }}</p>
          <p class="memorial-form-note">{{ summaryNote }}</p>
        </aside>
      </div>
    </main>
  </div>
</template>

<style scoped>
.memorial-form-page { min-height: 100dvh; background: var(--garden-cream, #f8f4e9); color: #244b3b; }
.memorial-form-container { width: min(1040px, calc(100% - 48px)); margin-inline: auto; padding-block: 32px 72px; }
.memorial-form-back { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: 14px; color: #546d5b; }
.memorial-form-back:hover { color: #254d3b; }
.memorial-form-back:focus-visible { outline: var(--focus-width) solid #b39150; outline-offset: var(--focus-offset); border-radius: 4px; }
.memorial-form-heading { max-width: 690px; margin-block: 22px 32px; }
.memorial-form-heading h1 { margin-block: 12px 16px; font-family: Georgia, serif; font-size: clamp(32px, 4vw, 48px); font-weight: 400; line-height: 1.15; letter-spacing: -0.035em; }
.memorial-form-heading > p:last-child { max-width: 620px; color: #617467; font-size: 16px; line-height: 1.75; }
.memorial-form-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(220px, 1fr); align-items: start; gap: 32px; }
.memorial-form-panel { min-width: 0; padding: 32px; border: 1px solid #dedfce; border-radius: var(--panel-radius); background: #fffdf6; box-shadow: 0 14px 44px #23453508; }
.memorial-form-summary { padding: 24px 12px; }
.memorial-form-emblem { display: grid; place-items: center; width: 60px; height: 60px; margin-bottom: 20px; border-radius: 50%; background: #e4eadb; color: #6d8b63; }
.memorial-form-emblem > * { width: 28px; height: 28px; }
.memorial-form-summary h2 { overflow-wrap: anywhere; font-family: Georgia, serif; font-size: 30px; font-weight: 400; line-height: 1.3; }
.memorial-form-detail { margin-top: 6px; color: #6b7e6e; font-variant-numeric: tabular-nums; }
.memorial-form-note { margin-top: 28px; padding-top: 24px; border-top: 1px solid #d9dece; font-size: 14px; line-height: 1.8; color: #65776b; }
@media (max-width: 700px) { .memorial-form-container { width: min(100% - 32px, 620px); padding-block: 20px 40px; } .memorial-form-layout { grid-template-columns: 1fr; gap: 12px; } .memorial-form-panel { padding: 24px 20px; border-radius: var(--panel-radius); } .memorial-form-summary { padding: 16px 8px; } .memorial-form-emblem, .memorial-form-summary h2, .memorial-form-detail { display: none; } .memorial-form-note { margin: 0; padding-top: 0; border: 0; } }
</style>

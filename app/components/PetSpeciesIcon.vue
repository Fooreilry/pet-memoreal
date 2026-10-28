<script setup lang="ts">
import type { PetSpecies } from '#shared/pet-species'
import { petSpeciesIcons } from '../data/petSpeciesIcons'

const props = defineProps<{ species: PetSpecies }>()
const drawing = computed(() => petSpeciesIcons[props.species] ?? petSpeciesIcons.pet)
</script>

<template>
  <span class="pet-species-icon" :data-species="species" aria-hidden="true">
    <UIcon v-if="'icon' in drawing" :name="drawing.icon" />
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">
      <path v-for="(path, index) in drawing.paths" :key="index" :d="path" />
    </svg>
  </span>
</template>

<style scoped>
.pet-species-icon { display: inline-flex; width: 1em; height: 1em; flex-shrink: 0; vertical-align: middle; }
.pet-species-icon > * { width: 100%; height: 100%; }
</style>

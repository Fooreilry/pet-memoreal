<script setup lang="ts">
defineProps<{
  name: string
  label: string
  placeholder?: string
  help?: string
  required?: boolean
  disabled?: boolean
  multiline?: boolean
  maxlength?: number
}>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <UFormField :name="name" :label="label" :help="help" :required="required">
    <UTextarea v-if="multiline" v-model="model" :name="name" :placeholder="placeholder" :maxlength="maxlength" :aria-required="required" :disabled="disabled" :rows="5" :maxrows="16" autoresize :ui="{ base: 'resize-none' }" class="w-full" />
    <UInput v-else v-model="model" :name="name" :placeholder="placeholder" :maxlength="maxlength" :aria-required="required" :disabled="disabled" class="w-full" />
  </UFormField>
</template>

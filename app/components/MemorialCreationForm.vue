<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { memorialSchema, memorialUpdateSchema } from '#shared/memorials'
import type { EditableMemorial, MemorialUpdate, NewMemorial, PublicMemorial } from '#shared/memorials'
import { gardenIds } from '#shared/gardens'
import type { GardenId } from '#shared/gardens'
import { petSpecies } from '#shared/pet-species'
import type { PetSpecies } from '#shared/pet-species'

const props = defineProps<{ gardenId?: GardenId, place?: number, memorial?: EditableMemorial, showCancel?: boolean }>()
const emit = defineEmits<{ saved: [memorial: PublicMemorial], unavailable: [], cancel: [] }>()
const { t, locale } = useI18n()
const container = useTemplateRef('container')
const form = useTemplateRef('form')
const ready = ref(false)
const busy = ref(false)
const errorKey = ref('')
const editing = computed(() => !!props.memorial)
const state = reactive({ name: props.memorial?.name ?? '', species: props.memorial?.species as PetSpecies | undefined, born: props.memorial ? String(props.memorial.born) : '', died: props.memorial ? String(props.memorial.died) : '',
  story: props.memorial?.story ?? '', isAnonymous: props.memorial?.isAnonymous ?? false, gardenId: props.memorial?.gardenId ?? props.gardenId ?? 'meadow', place: props.memorial?.place ?? props.place, requestId: '' })
const speciesOptions = computed(() => petSpecies.map(value => ({ value, label: t(value === 'pet' ? 'creation.otherSpecies' : `memorial.species.${value}`) })))
const speciesSearch = computed(() => ({ placeholder: t('creation.speciesSearch'), 'aria-label': t('creation.speciesSearch'), class: 'pet-species-search' }))
const content = computed(() => ({ name: state.name, species: state.species, born: state.born, died: state.died, story: state.story, isAnonymous: state.isAnonymous }))
const formState = computed(() => editing.value ? content.value : state)
const schema = computed(() => (editing.value ? memorialUpdateSchema : memorialSchema)(key => t(`creation.validation.${key}`)))
onMounted(() => { if (!editing.value) state.requestId = crypto.randomUUID(); ready.value = true })
watch(locale, () => form.value?.clear())
watch(() => state.gardenId, () => { state.place = undefined })

async function focusError() {
  await nextTick()
  container.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}

async function submit(event: FormSubmitEvent<NewMemorial | MemorialUpdate>) {
  if (busy.value) return
  busy.value = true
  errorKey.value = ''
  try {
    const memorial = props.memorial
      ? await $fetch<PublicMemorial>(`/api/memorials/${props.memorial.id}`, { method: 'PATCH', body: {
          name: event.data.name, species: event.data.species, born: event.data.born, died: event.data.died, story: event.data.story, isAnonymous: event.data.isAnonymous
        } })
      : await $fetch<PublicMemorial>('/api/memorials', { method: 'POST', body: event.data })
    clearNuxtData('my-memorials')
    emit('saved', memorial)
  } catch (error) {
    const failure = error as { statusCode?: number, data?: { statusMessage?: string } }
    const reason = failure.data?.statusMessage
    errorKey.value = editing.value
      ? failure.statusCode === 401 ? 'session' : failure.statusCode === 404 ? 'unavailable' : 'save'
      : failure.statusCode === 401 ? 'session' : reason === 'Place occupied' ? 'occupied' : reason === 'Garden full' ? 'full' : failure.statusCode === 409 ? 'conflict' : 'save'
    if (reason === 'Place occupied') emit('unavailable')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div ref="container">
    <UForm ref="form" :schema="schema" :state="formState" :validate-on="[]" :disabled="!ready || busy" :loading-auto="false" class="auth-form memorial-creation-form" :data-testid="editing ? 'memorial-edit-form' : 'memorial-create-form'" @submit="submit" @error="focusError">
      <p v-if="state.place" class="form-note" :data-testid="editing ? 'memorial-edit-location' : 'creation-location'"><UIcon name="i-lucide-map-pin" aria-hidden="true" />{{ t('memorial.location', { garden: t(`garden.names.${state.gardenId}`), place: state.place }) }}</p>
      <FormTextField v-model="state.name" name="name" :label="t('creation.name')" :maxlength="80" required />
      <UFormField name="species" :label="t('creation.species')" required>
        <USelectMenu v-model="state.species" name="species" :items="speciesOptions" value-key="value" :placeholder="t('creation.speciesPlaceholder')" :search-input="speciesSearch" :ui="{ base: 'min-h-12 rounded-lg bg-[#f8f5ec] text-base', content: 'rounded-lg bg-[#fffcf5]', item: 'min-h-11' }" size="lg" class="w-full" aria-required="true" data-testid="memorial-species">
          <template #leading><PetSpeciesIcon :species="state.species ?? 'pet'" class="size-5 text-primary" /></template>
          <template #item-leading="{ item }"><PetSpeciesIcon :species="item.value" class="size-5 shrink-0 text-primary" /></template>
          <template #empty>{{ t('creation.speciesEmpty') }}</template>
        </USelectMenu>
      </UFormField>
      <div class="grid grid-cols-2 gap-4">
        <UFormField name="born" :label="t('creation.born')" required><UInput v-model="state.born" name="born" inputmode="numeric" :maxlength="4" placeholder="2012" class="w-full" aria-required="true" /></UFormField>
        <UFormField name="died" :label="t('creation.died')" required><UInput v-model="state.died" name="died" inputmode="numeric" :maxlength="4" placeholder="2025" class="w-full" aria-required="true" /></UFormField>
      </div>
      <FormTextField v-model="state.story" name="story" :label="t('creation.story')" :help="t('creation.storyHelp')" :maxlength="5000" multiline required />
      <UFormField v-if="!editing && !place" name="gardenId" :label="t('creation.garden')" required>
        <select v-model="state.gardenId" name="gardenId" class="w-full rounded-lg border border-[var(--ui-border)] bg-[#fffdf8] px-3 py-3 text-base" :disabled="!ready || busy" aria-required="true">
          <option v-for="id in gardenIds" :key="id" :value="id">{{ t(`garden.names.${id}`) }}</option>
        </select>
      </UFormField>
      <UFormField name="isAnonymous"><UCheckbox v-model="state.isAnonymous" :label="t('creation.anonymous')" :description="t('creation.anonymousHelp')" /></UFormField>
      <p class="form-note"><UIcon name="i-lucide-globe" aria-hidden="true" />{{ t(editing ? 'editing.publicNote' : 'creation.publicNote') }}</p>
      <UAlert v-if="errorKey" color="error" :title="t(`${editing ? 'editing' : 'creation'}.errors.${errorKey}`)" role="alert" />
      <UButton v-if="!editing && showCancel && ['occupied', 'full', 'conflict'].includes(errorKey)" type="button" variant="link" :disabled="busy" data-testid="memorial-create-conflict-back" @click="emit('cancel')">{{ t('creation.page.chooseAnother') }}</UButton>
      <div :class="{ 'memorial-edit-actions': editing, 'memorial-form-actions': editing || showCancel }">
        <UButton v-if="editing || showCancel" type="button" variant="outline" :disabled="busy" :data-testid="editing ? 'memorial-edit-cancel' : 'memorial-create-cancel'" @click="emit('cancel')">{{ t(editing ? 'editing.cancel' : 'creation.page.cancel') }}</UButton>
        <UButton type="submit" color="secondary" :loading="busy" :disabled="!ready || busy" :block="!editing && !showCancel" :data-testid="editing ? 'memorial-edit-save' : 'memorial-create-save'">{{ t(editing ? 'editing.submit' : 'creation.submit') }}</UButton>
      </div>
    </UForm>
  </div>
</template>

<style scoped>
.memorial-creation-form { display: grid; gap: 20px; }
:global(.pet-species-search input:focus-visible) { outline-offset: -2px; }
.memorial-form-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; }
.memorial-form-actions > * { min-height: 44px; }
@media (max-width: 480px) { .memorial-form-actions { display: grid; grid-template-columns: 1fr; } .memorial-form-actions > :first-child { order: 2; } }
</style>

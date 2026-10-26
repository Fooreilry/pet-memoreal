<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { memorialSchema } from '#shared/memorials'
import type { NewMemorial, PublicMemorial } from '#shared/memorials'
import { gardenIds } from '#shared/gardens'
import type { GardenId } from '#shared/gardens'

const props = defineProps<{ gardenId?: GardenId, place?: number }>()
const emit = defineEmits<{ saved: [memorial: PublicMemorial], unavailable: [] }>()
const { t, locale } = useI18n()
const container = useTemplateRef('container')
const form = useTemplateRef('form')
const ready = ref(false)
const busy = ref(false)
const errorKey = ref('')
const state = reactive({ name: '', born: '', died: '', story: '', isAnonymous: false, gardenId: props.gardenId ?? 'meadow', place: props.place, requestId: '' })
const schema = computed(() => memorialSchema(key => t(`creation.validation.${key}`)))
onMounted(() => { state.requestId = crypto.randomUUID(); ready.value = true })
watch(locale, () => form.value?.clear())
watch(() => state.gardenId, () => { state.place = undefined })

async function focusError() {
  await nextTick()
  container.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}

async function submit(event: FormSubmitEvent<NewMemorial>) {
  if (busy.value) return
  busy.value = true
  errorKey.value = ''
  try {
    const memorial = await $fetch<PublicMemorial>('/api/memorials', { method: 'POST', body: event.data })
    clearNuxtData('my-memorials')
    emit('saved', memorial)
  } catch (error) {
    const failure = error as { statusCode?: number, data?: { statusMessage?: string } }
    const reason = failure.data?.statusMessage
    errorKey.value = failure.statusCode === 401 ? 'session' : reason === 'Place occupied' ? 'occupied' : reason === 'Garden full' ? 'full' : failure.statusCode === 409 ? 'conflict' : 'save'
    if (reason === 'Place occupied') emit('unavailable')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div ref="container">
    <UForm ref="form" :schema="schema" :state="state" :validate-on="[]" :disabled="!ready || busy" :loading-auto="false" class="auth-form memorial-creation-form" @submit="submit" @error="focusError">
      <p v-if="place" class="form-note" data-testid="creation-location"><UIcon name="i-lucide-map-pin" aria-hidden="true" />{{ t('memorial.location', { garden: t(`garden.names.${state.gardenId}`), place }) }}</p>
      <FormTextField v-model="state.name" name="name" :label="t('creation.name')" :maxlength="80" required />
      <div class="grid grid-cols-2 gap-4">
        <UFormField name="born" :label="t('creation.born')" required><UInput v-model="state.born" name="born" inputmode="numeric" :maxlength="4" placeholder="2012" class="w-full" aria-required="true" /></UFormField>
        <UFormField name="died" :label="t('creation.died')" required><UInput v-model="state.died" name="died" inputmode="numeric" :maxlength="4" placeholder="2025" class="w-full" aria-required="true" /></UFormField>
      </div>
      <FormTextField v-model="state.story" name="story" :label="t('creation.story')" :help="t('creation.storyHelp')" :maxlength="5000" multiline required />
      <UFormField v-if="!place" name="gardenId" :label="t('creation.garden')" required>
        <select v-model="state.gardenId" name="gardenId" class="w-full rounded-xl border border-[var(--ui-border)] bg-[#fffdf8] px-3 py-3 text-base" :disabled="!ready || busy" aria-required="true">
          <option v-for="id in gardenIds" :key="id" :value="id">{{ t(`garden.names.${id}`) }}</option>
        </select>
      </UFormField>
      <UFormField name="isAnonymous"><UCheckbox v-model="state.isAnonymous" :label="t('creation.anonymous')" :description="t('creation.anonymousHelp')" /></UFormField>
      <p class="form-note"><UIcon name="i-lucide-globe" aria-hidden="true" />{{ t('creation.publicNote') }}</p>
      <UAlert v-if="errorKey" color="error" :title="t(`creation.errors.${errorKey}`)" role="alert" />
      <UButton type="submit" color="secondary" :loading="busy" :disabled="!ready || busy" block>{{ t('creation.submit') }}</UButton>
    </UForm>
  </div>
</template>

<style scoped>
.memorial-creation-form { display: grid; gap: 20px; }
</style>

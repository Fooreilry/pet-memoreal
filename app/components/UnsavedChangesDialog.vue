<script setup lang="ts">
defineProps<{ pending?: boolean }>()
defineEmits<{ keep: [], discard: [] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const keepButton = useTemplateRef('keepButton')

function focusKeep(event: Event) {
  event.preventDefault()
  nextTick(() => keepButton.value?.$el?.focus())
}
const dialogContent = { onOpenAutoFocus: focusKeep, 'data-testid': 'unsaved-changes-dialog' }
</script>

<template>
  <UModal v-model:open="open" class="unsaved-changes-dialog" :title="t(pending ? 'unsaved.pendingTitle' : 'unsaved.title')" :description="t(pending ? 'unsaved.pendingDescription' : 'unsaved.description')" :content="dialogContent" :dismissible="!pending" :close="!pending" :ui="{ content: 'max-w-md bg-(--surface-panel)', footer: 'flex-wrap justify-end gap-3' }">
    <template #footer>
      <UButton ref="keepButton" color="neutral" variant="outline" class="min-h-11" data-testid="unsaved-keep" @click="$emit('keep')">{{ t(pending ? 'unsaved.wait' : 'unsaved.keep') }}</UButton>
      <UButton v-if="!pending" color="error" class="min-h-11" data-testid="unsaved-discard" @click="$emit('discard')">{{ t('unsaved.discard') }}</UButton>
    </template>
  </UModal>
</template>

import type { MaybeRefOrGetter } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import type { RouteLocationNormalized } from 'vue-router'

/** Keep drafts in the current page; never persist personal text in browser storage. */
export function useUnsavedChangesGuard(dirtySource: MaybeRefOrGetter<boolean>, pendingSource: MaybeRefOrGetter<boolean> = false, options: {
  guardUpdate?: (to: RouteLocationNormalized, from: RouteLocationNormalized) => boolean
} = {}) {
  const draftExit = useNuxtApp().$draftExit
  const open = ref(false)
  const dirty = computed(() => toValue(dirtySource))
  const pending = computed(() => toValue(pendingSource))
  let allowed = false
  let answer: ((discard: boolean) => void) | undefined
  let confirmation: Promise<boolean> | undefined
  let unregister: (() => void) | undefined

  function settle(discard: boolean) {
    const resolve = answer
    answer = undefined
    confirmation = undefined
    open.value = false
    resolve?.(discard)
  }

  function confirmDiscard(): Promise<boolean> {
    if (draftExit.pending.value && !allowed) return Promise.resolve(false)
    if (allowed || (!dirty.value && !pending.value)) return Promise.resolve(true)
    if (confirmation) return confirmation
    confirmation = new Promise<boolean>((resolve) => { answer = resolve })
    open.value = true
    return confirmation
  }

  async function requestDiscard(action: () => unknown): Promise<boolean> {
    if (!await confirmDiscard()) return false
    await action()
    return true
  }

  function keepEditing() { settle(false) }
  function discard() {
    if (!pending.value) settle(true)
  }

  function allowNavigation() {
    allowed = true
    // A completed save owns its destination, rather than an earlier attempted exit.
    settle(false)
  }

  function beforeUnload(event: BeforeUnloadEvent) {
    if (allowed || (!dirty.value && !pending.value)) return
    event.preventDefault()
    event.returnValue = ''
  }

  watch(open, value => { if (!value && answer) settle(false) })
  watch(dirty, value => { if (value) allowed = false }, { flush: 'sync' })
  watch([dirty, pending], ([hasChanges, saving]) => {
    if (answer && !hasChanges && !saving) settle(true)
  })
  onBeforeRouteLeave(() => confirmDiscard())
  onBeforeRouteUpdate((to, from) => to.fullPath.split('#')[0] === from.fullPath.split('#')[0] || options.guardUpdate?.(to, from) === false || confirmDiscard())
  onMounted(() => {
    unregister = draftExit.register({ confirmDiscard, allowNavigation })
    window.addEventListener('beforeunload', beforeUnload)
  })
  onBeforeUnmount(() => {
    unregister?.()
    window.removeEventListener('beforeunload', beforeUnload)
    settle(false)
  })

  return { open, pending, confirmDiscard, requestDiscard, keepEditing, discard, allowNavigation }
}

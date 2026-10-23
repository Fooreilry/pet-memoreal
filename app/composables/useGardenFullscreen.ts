export function useGardenFullscreen() {
  const { t } = useI18n()
  const toast = useToast()
  const fullscreen = ref(false)
  const supported = ref(false)
  const busy = ref(false)
  let owned = false
  let disposed = false

  function changed() {
    fullscreen.value = !!document.fullscreenElement
    if (!fullscreen.value) owned = false
  }

  async function toggleFullscreen() {
    if (!supported.value || busy.value) return
    busy.value = true
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else {
        // Include body portals so forms, stories and menus remain visible.
        owned = true
        await document.documentElement.requestFullscreen()
        if (disposed && owned && document.fullscreenElement === document.documentElement) await document.exitFullscreen()
      }
    } catch {
      owned = false
      if (!disposed) toast.add({ title: t('garden.camera.fullscreenError'), color: 'error' })
    } finally {
      busy.value = false
    }
  }

  onMounted(() => {
    supported.value = document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function'
    changed()
    document.addEventListener('fullscreenchange', changed)
  })
  onBeforeUnmount(() => {
    disposed = true
    document.removeEventListener('fullscreenchange', changed)
    if (owned && document.fullscreenElement === document.documentElement) void document.exitFullscreen().catch(() => {})
  })

  return { fullscreen, supported, busy, toggleFullscreen }
}

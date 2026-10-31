export function useGardenFullscreen() {
  // Expand only the map inside the browser's content viewport.
  const fullscreen = ref(false)

  function toggleFullscreen() {
    fullscreen.value = !fullscreen.value
  }

  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.repeat || event.defaultPrevented || !fullscreen.value) return
    // Portaled stories and popovers receive the first Escape. Inspect them before
    // their own handlers close the layer; a subsequent Escape restores the map.
    if (document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"], [data-memorial-preview][data-state="open"]')) return
    event.preventDefault()
    fullscreen.value = false
    nextTick(() => {
      const fullscreenButton = document.querySelector<HTMLButtonElement>('[data-testid="garden-fullscreen"]')
      const target = fullscreenButton?.offsetParent ? fullscreenButton : document.querySelector<HTMLButtonElement>('[data-testid="garden-more"]')
      target?.focus({ preventScroll: true })
    })
  }

  onMounted(() => window.addEventListener('keydown', escape, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', escape, true))

  return { fullscreen, toggleFullscreen }
}

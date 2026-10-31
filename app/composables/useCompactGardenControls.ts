export function useCompactGardenControls() {
  const compact = ref(false)
  let media: MediaQueryList | undefined
  const update = () => { compact.value = media?.matches ?? false }
  onMounted(() => {
    media = window.matchMedia('(max-width: 600px), (pointer: coarse) and (max-width: 1000px)')
    update()
    media.addEventListener('change', update)
  })
  onBeforeUnmount(() => media?.removeEventListener('change', update))
  return compact
}

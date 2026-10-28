export default defineNuxtRouteMiddleware(async () => {
  const app = useNuxtApp()
  // SSR has already made this decision; do not recheck while hydrating the guest page.
  if (import.meta.client && app.isHydrating && app.payload.serverRendered) return
  const localePath = useLocalePath()
  const { unavailable, session } = useServiceAvailability()
  if (unavailable.value || session.value !== 'member') return
  return navigateTo(localePath('/gardens'), { replace: true })
})

export default defineNuxtRouteMiddleware(async (to) => {
  const app = useNuxtApp()
  // Reuse the SSR decision during hydration; a second request can race the redirect.
  if (import.meta.client && app.isHydrating && app.payload.serverRendered) return
  if (!to.matched.length) return
  const localePath = useLocalePath()
  const { unavailable, check } = useServiceAvailability()
  await check()
  if (unavailable.value && to.path !== localePath('/')) {
    return navigateTo(localePath('/'), { replace: true })
  }
})

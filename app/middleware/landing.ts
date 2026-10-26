export default defineNuxtRouteMiddleware(async () => {
  const app = useNuxtApp()
  // SSR has already made this decision; do not recheck while hydrating the guest page.
  if (import.meta.client && app.isHydrating && app.payload.serverRendered) return
  const request = useRequestFetch()
  const localePath = useLocalePath()
  try {
    await request('/api/me')
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 401) return
    throw createError({ statusCode: 503, statusMessage: 'Authentication unavailable', fatal: true })
  }
  return navigateTo(localePath('/gardens'), { replace: true })
})

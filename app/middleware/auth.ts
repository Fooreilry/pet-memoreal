export default defineNuxtRouteMiddleware(async (to) => {
  const localePath = useLocalePath()
  const { unavailable, session } = useServiceAvailability()
  if (unavailable.value) return navigateTo(localePath('/'), { replace: true })
  if (session.value !== 'member') return navigateTo({ path: localePath('/login'), query: to.path.endsWith('/memorials/new') || /^\/memorials\/[^/]+\/edit$/.test(to.path) ? { redirect: to.fullPath } : {} })
})

export default defineNuxtRouteMiddleware(async () => {
  const localePath = useLocalePath()
  const { unavailable, session, markUnavailable } = useServiceAvailability()
  if (unavailable.value) return navigateTo(localePath('/'), { replace: true })
  if (session.value !== 'member') return navigateTo(localePath('/login'), { replace: true })
  try {
    const user = await useRequestFetch()('/api/me', { retry: 0, timeout: 4000 })
    if (!user.permissions.adminPanel) return navigateTo(localePath('/account'), { replace: true })
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 401) return navigateTo(localePath('/login'), { replace: true })
    markUnavailable()
    return navigateTo(localePath('/'), { replace: true })
  }
})

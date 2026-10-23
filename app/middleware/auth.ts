export default defineNuxtRouteMiddleware(async (to) => {
  const localePath = useLocalePath()
  const request = useRequestFetch()
  try {
    await request('/api/me')
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return navigateTo({ path: localePath('/login'), query: to.path.endsWith('/memorials/new') ? { redirect: to.fullPath } : {} })
    throw createError({ statusCode: 503, statusMessage: 'Authentication unavailable' })
  }
})

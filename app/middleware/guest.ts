import { authRedirect } from '../utils/authRedirect'

export default defineNuxtRouteMiddleware(async (to) => {
  const request = useRequestFetch()
  const localePath = useLocalePath()
  try {
    // Validate the server session instead of trusting a cookie or cached client state.
    await request('/api/me')
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 401) return
    throw createError({ statusCode: 503, statusMessage: 'Authentication unavailable', fatal: true })
  }
  return navigateTo(authRedirect(to.query.redirect) ?? localePath('/account'), { replace: true })
})

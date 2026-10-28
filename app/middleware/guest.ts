import { authRedirect } from '../utils/authRedirect'

export default defineNuxtRouteMiddleware(async (to) => {
  const localePath = useLocalePath()
  const { unavailable, session } = useServiceAvailability()
  if (unavailable.value) return navigateTo(localePath('/'), { replace: true })
  if (session.value !== 'member') return
  return navigateTo(authRedirect(to.query.redirect) ?? localePath('/account'), { replace: true })
})

import { createAuthClient } from 'better-auth/vue'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import { profileFields } from '#shared/profile'
import { roleFields } from '#shared/roles'

export function useAuthClient() {
  const { locale } = useI18n()
  const gardenSession = useGardenSession()
  return createAuthClient({
    plugins: [inferAdditionalFields({ user: { ...profileFields, ...roleFields } })],
    fetchOptions: {
      headers: { 'x-app-locale': locale.value },
      onSuccess({ request }) {
        const path = new URL(request.url, 'http://localhost').pathname
        if (path.endsWith('/sign-in/email') || path.endsWith('/sign-out')) gardenSession.rotate()
      }
    }
  })
}

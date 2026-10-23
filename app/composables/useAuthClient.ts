import { createAuthClient } from 'better-auth/vue'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import { profileFields } from '#shared/profile'

export function useAuthClient() {
  const { locale } = useI18n()
  return createAuthClient({
    plugins: [inferAdditionalFields({ user: profileFields })],
    fetchOptions: { headers: { 'x-app-locale': locale.value } }
  })
}

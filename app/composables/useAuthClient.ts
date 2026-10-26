import { createAuthClient } from 'better-auth/vue'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import { profileFields } from '#shared/profile'
import { roleFields } from '#shared/roles'

export function useAuthClient() {
  const { locale } = useI18n()
  return createAuthClient({
    plugins: [inferAdditionalFields({ user: { ...profileFields, ...roleFields } })],
    fetchOptions: { headers: { 'x-app-locale': locale.value } }
  })
}

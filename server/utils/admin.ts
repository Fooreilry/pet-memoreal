import type { H3Event } from 'h3'
import { getAuthConfig } from './auth-config'

export function requireAdminMutationOrigin(event: H3Event) {
  if (getHeader(event, 'origin') !== new URL(getAuthConfig().BETTER_AUTH_URL).origin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden origin' })
  }
}

export function requireJsonRequest(event: H3Event) {
  if (!getHeader(event, 'content-type')?.toLowerCase().startsWith('application/json')) {
    throw createError({ statusCode: 415, statusMessage: 'JSON required' })
  }
}

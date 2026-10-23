import type { H3Event } from 'h3'
import { getAuth } from './auth'

export async function requireUser(event: H3Event) {
  const session = await getAuth().api.getSession({ headers: getRequestHeaders(event) as HeadersInit })
  if (!session?.user.emailVerified) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return session.user
}

export async function requireAdmin(event: H3Event) {
  const user = await requireUser(event)
  if (user.role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return user
}

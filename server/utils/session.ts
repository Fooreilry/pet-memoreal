import type { H3Event } from 'h3'
import { getAuth } from './auth'

async function readSession(event: H3Event) {
  try {
    return await getAuth().api.getSession({ headers: getRequestHeaders(event) as HeadersInit })
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Authentication unavailable' })
  }
}

export async function requireUser(event: H3Event) {
  const session = await readSession(event)
  if (!session?.user.emailVerified) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return session.user
}

export async function requireAdmin(event: H3Event) {
  const user = await requireUser(event)
  if (user.role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return user
}

import type { H3Event } from 'h3'
import { getAuth } from './auth'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../db/client'
import { user as users } from '../db/schema'
import { canAccessAdmin, isUserRole } from '../../shared/roles'

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
  try {
    // Read the current role on every authorized request: a downgrade must also
    // apply to sessions created before the change.
    const [current] = await getDatabase().db.select({ role: users.role, emailVerified: users.emailVerified })
      .from(users).where(eq(users.id, session.user.id))
    if (!current?.emailVerified || !isUserRole(current.role)) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    return { ...session.user, role: current.role }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    throw createError({ statusCode: 503, statusMessage: 'Authentication unavailable' })
  }
}

export async function requireAdminAccess(event: H3Event, action: 'view' | 'edit' | 'create' | 'delete' = 'view') {
  const user = await requireUser(event)
  if (!canAccessAdmin(user.role, action)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return user
}

export async function requireAdmin(event: H3Event) {
  const user = await requireUser(event)
  if (user.role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return user
}

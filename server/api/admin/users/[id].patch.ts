import { count, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requireAdmin } from '../../../utils/session'
import { requireAdminMutationOrigin, requireJsonRequest } from '../../../utils/admin'
import { getDatabase } from '../../../db/client'
import { user } from '../../../db/schema'
import { getPermissions, userRoles } from '../../../../shared/roles'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const viewer = await requireAdmin(event)
  requireAdminMutationOrigin(event)
  requireJsonRequest(event)
  const id = z.string().min(1).max(256).safeParse(getRouterParam(event, 'id'))
  const parsed = z.object({ role: z.enum(userRoles) }).strict().safeParse(await readBody(event))
  if (!id.success || !parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid role assignment' })
  if (id.data === viewer.id && parsed.data.role !== viewer.role) {
    throw createError({ statusCode: 409, statusMessage: 'Cannot change your own role' })
  }
  try {
    return await getDatabase().db.transaction(async (transaction) => {
      // Keep simultaneous role changes ordered across all server instances.
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended('admin-role-management', 0))`)
      const [currentViewer] = await transaction.select({ role: user.role, emailVerified: user.emailVerified })
        .from(user).where(eq(user.id, viewer.id))
      if (currentViewer?.role !== 'admin' || !currentViewer.emailVerified) {
        throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
      }
      const [target] = await transaction.select({ role: user.role }).from(user).where(eq(user.id, id.data))
      if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
      if (target.role === 'admin' && parsed.data.role !== 'admin') {
        const [administrators] = await transaction.select({ value: count() }).from(user).where(eq(user.role, 'admin'))
        if (!administrators || administrators.value <= 1) {
          throw createError({ statusCode: 409, statusMessage: 'Cannot remove the last administrator' })
        }
      }
      const [updated] = await transaction.update(user).set({ role: parsed.data.role, updatedAt: new Date() })
        .where(eq(user.id, id.data)).returning({ id: user.id, role: user.role })
      if (!updated) throw createError({ statusCode: 404, statusMessage: 'User not found' })
      return { ...updated, permissions: getPermissions(updated.role) }
    })
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    throw createError({ statusCode: 503, statusMessage: 'Administration unavailable' })
  }
})

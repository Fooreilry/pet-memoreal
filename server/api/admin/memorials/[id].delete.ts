import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireAdminAccess } from '../../../utils/session'
import { requireAdminMutationOrigin } from '../../../utils/admin'
import { getDatabase } from '../../../db/client'
import { memorials } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireAdminAccess(event, 'delete')
  requireAdminMutationOrigin(event)
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Invalid memorial id' })
  try {
    const [deleted] = await getDatabase().db.delete(memorials).where(eq(memorials.id, id.data)).returning({ id: memorials.id })
    if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Memorial not found' })
    return { deleted: true }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    throw createError({ statusCode: 503, statusMessage: 'Administration unavailable' })
  }
})

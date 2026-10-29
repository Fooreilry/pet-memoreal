import { gardenIds } from '../../../../shared/gardens'
import type { GardenId } from '../../../../shared/gardens'
import { listGardenMemorials } from '../../../utils/memorials'
import { getAuth } from '../../../utils/auth'
import { getDatabase } from '../../../db/client'
import { user } from '../../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'Vary', 'Cookie')
  const slug = getRouterParam(event, 'slug') as GardenId
  if (!gardenIds.includes(slug)) throw createError({ statusCode: 404, statusMessage: 'Garden not found' })
  try {
    const session = await getAuth().api.getSession({ headers: getRequestHeaders(event) as HeadersInit })
    const [viewer] = session?.user.emailVerified
      ? await getDatabase().db.select({ id: user.id, role: user.role, emailVerified: user.emailVerified }).from(user).where(eq(user.id, session.user.id))
      : []
    return await listGardenMemorials(slug, viewer?.emailVerified ? viewer.id : undefined, viewer?.role)
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Memorials unavailable' })
  }
})

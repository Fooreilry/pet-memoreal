import { gardenIds } from '../../../../shared/gardens'
import type { GardenId } from '../../../../shared/gardens'
import { listGardenMemorials } from '../../../utils/memorials'
import { getAuth } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'Vary', 'Cookie')
  const slug = getRouterParam(event, 'slug') as GardenId
  if (!gardenIds.includes(slug)) throw createError({ statusCode: 404, statusMessage: 'Garden not found' })
  try {
    const session = await getAuth().api.getSession({ headers: getRequestHeaders(event) as HeadersInit })
    return await listGardenMemorials(slug, session?.user.emailVerified ? session.user.id : undefined)
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Memorials unavailable' })
  }
})

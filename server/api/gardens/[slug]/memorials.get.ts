import { gardenIds } from '../../../../shared/gardens'
import type { GardenId } from '../../../../shared/gardens'
import { listGardenMemorials } from '../../../utils/memorials'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const slug = getRouterParam(event, 'slug') as GardenId
  if (!gardenIds.includes(slug)) throw createError({ statusCode: 404, statusMessage: 'Garden not found' })
  try {
    return await listGardenMemorials(slug)
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Memorials unavailable' })
  }
})

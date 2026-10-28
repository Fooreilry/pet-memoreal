import { z } from 'zod'
import { requireUser } from '../../utils/session'
import { getOwnedMemorial } from '../../utils/memorials'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireUser(event)
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Invalid memorial id' })
  try {
    const memorial = await getOwnedMemorial(user.id, id.data)
    if (!memorial) throw createError({ statusCode: 404, statusMessage: 'Memorial not found' })
    return memorial
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    throw createError({ statusCode: 503, statusMessage: 'Memorials unavailable' })
  }
})

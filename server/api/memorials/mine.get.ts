import { requireUser } from '../../utils/session'
import { listOwnedMemorials } from '../../utils/memorials'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const user = await requireUser(event)
  try {
    return await listOwnedMemorials(user.id)
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Memorials unavailable' })
  }
})

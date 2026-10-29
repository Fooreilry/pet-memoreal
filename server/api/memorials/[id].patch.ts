import { z } from 'zod'
import { memorialUpdateSchema } from '../../../shared/memorials'
import { requireUser } from '../../utils/session'
import { updateOwnedMemorial } from '../../utils/memorials'
import { getAuthConfig } from '../../utils/auth-config'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireUser(event)
  if (getHeader(event, 'origin') !== new URL(getAuthConfig().BETTER_AUTH_URL).origin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden origin' })
  }
  if (!getHeader(event, 'content-type')?.toLowerCase().startsWith('application/json')) {
    throw createError({ statusCode: 415, statusMessage: 'JSON required' })
  }
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Invalid memorial id' })
  const parsed = memorialUpdateSchema().safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid memorial' })
  try {
    const memorial = await updateOwnedMemorial(user.id, id.data, parsed.data, user.role)
    if (!memorial) throw createError({ statusCode: 404, statusMessage: 'Memorial not found' })
    return memorial
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    throw createError({ statusCode: 503, statusMessage: 'Memorial storage unavailable' })
  }
})

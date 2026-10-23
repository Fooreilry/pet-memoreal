import { memorialSchema } from '../../../shared/memorials'
import { requireUser } from '../../utils/session'
import { createMemorial } from '../../utils/memorials'
import { getAuthConfig } from '../../utils/auth-config'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const user = await requireUser(event)
  if (getHeader(event, 'origin') !== new URL(getAuthConfig().BETTER_AUTH_URL).origin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden origin' })
  }
  if (!getHeader(event, 'content-type')?.toLowerCase().startsWith('application/json')) {
    throw createError({ statusCode: 415, statusMessage: 'JSON required' })
  }
  const parsed = memorialSchema().safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid memorial' })
  try {
    const memorial = await createMemorial(user.id, parsed.data)
    setResponseStatus(event, 201)
    return memorial
  } catch (error) {
    const failure = error as { statusCode?: number, cause?: { code?: string }, code?: string }
    if (failure.statusCode) throw error
    if (failure.code === '23505' || failure.cause?.code === '23505') throw createError({ statusCode: 409, statusMessage: 'Request conflict' })
    throw createError({ statusCode: 503, statusMessage: 'Memorial storage unavailable' })
  }
})

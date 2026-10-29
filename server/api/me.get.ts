import { requireUser } from '../utils/session'
import { checkServiceReadiness } from '../utils/service-readiness'
import { getPermissions } from '../../shared/roles'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  try {
    await checkServiceReadiness()
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Authentication unavailable' })
  }
  const user = await requireUser(event)
  return { id: user.id, name: user.name, surname: user.surname ?? '', email: user.email, emailVerified: user.emailVerified, role: user.role, permissions: getPermissions(user.role) }
})

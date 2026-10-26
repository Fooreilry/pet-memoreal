import { requireUser } from '../utils/session'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const user = await requireUser(event)
  return { id: user.id, name: user.name, surname: user.surname ?? '', email: user.email, emailVerified: user.emailVerified, role: user.role }
})

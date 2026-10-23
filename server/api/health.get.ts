import { getDatabase } from '../db/client'
import { checkDatabase } from '../utils/database-health'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  try {
    await checkDatabase(getDatabase().db)
    return { status: 'ok' }
  } catch {
    setResponseStatus(event, 503)
    return { status: 'unavailable' }
  }
})

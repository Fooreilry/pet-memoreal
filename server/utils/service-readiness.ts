import { getDatabase } from '../db/client'

export function createReadinessCheck(probe: () => Promise<unknown>, now = Date.now, ttl = 2000) {
  let readyUntil = 0
  let pending: Promise<void> | undefined

  return () => {
    if (now() < readyUntil) return Promise.resolve()
    if (pending) return pending
    // Start in a microtask so even a synchronously throwing probe clears pending.
    pending = Promise.resolve().then(probe).then(() => {
      readyUntil = now() + ttl
    }).finally(() => { pending = undefined })
    return pending
  }
}

// Cache only readiness, never a visitor's session or profile. LIMIT 0 checks the
// critical auth table without loading user data or running the full health audit.
const readinessQuery = {
  text: 'SELECT id FROM auth_user LIMIT 0',
  query_timeout: 2500
}
export const checkServiceReadiness = createReadinessCheck(async () => {
  await getDatabase().pool.query(readinessQuery)
})

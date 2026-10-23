import { randomUUID } from 'node:crypto'
import { lt, or, lte, eq, sql } from 'drizzle-orm'
import { APIError } from 'better-auth/api'
import type { createDatabase } from '../db/client'
import { rateLimit } from '../db/schema'

export function createDatabaseRateLimitStorage(db: ReturnType<typeof createDatabase>['db']) {
  let pruneAfter = 0
  return {
    async consume(key: string, rule: { window: number, max: number }) {
      const now = Date.now()
      const cutoff = now - rule.window * 1000
      try {
        // ON CONFLICT checks the limit against the locked current row, not a stale ID subquery.
        const [accepted] = await db.insert(rateLimit).values({ id: randomUUID(), key, count: 1, lastRequest: now })
          .onConflictDoUpdate({
            target: rateLimit.key,
            set: {
              count: sql`case when ${rateLimit.lastRequest} <= ${cutoff} then 1 else ${rateLimit.count} + 1 end`,
              lastRequest: sql`greatest(${rateLimit.lastRequest}, ${now})`
            },
            setWhere: or(lte(rateLimit.lastRequest, cutoff), lt(rateLimit.count, rule.max))
          }).returning({ id: rateLimit.id })
        if (!accepted) {
          const [row] = await db.select({ lastRequest: rateLimit.lastRequest }).from(rateLimit).where(eq(rateLimit.key, key))
          return { allowed: false, retryAfter: Math.max(1, Math.ceil(((row?.lastRequest ?? now) + rule.window * 1000 - now) / 1000)) }
        }
        if (now >= pruneAfter) {
          pruneAfter = now + 60000
          // Current auth windows are at most 60s; retain inactive keys for an hour, then prune by index.
          await db.delete(rateLimit).where(lt(rateLimit.lastRequest, now - 3600000))
            .catch(() => console.error('Could not prune expired auth rate limits'))
        }
        return { allowed: true, retryAfter: null }
      } catch {
        // Fail closed without leaking a driver's query, parameters or connection details.
        throw new APIError('SERVICE_UNAVAILABLE', { message: 'Authentication temporarily unavailable' })
      }
    }
  }
}

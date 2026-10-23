import { inArray } from 'drizzle-orm'
import type { createDatabase } from '../db/client'
import { gardens, memorials, rateLimit, user } from '../db/schema'
import { gardenIds } from '../../shared/gardens'

export async function checkDatabase(db: ReturnType<typeof createDatabase>['db']) {
  // Check required columns too, so a reachable but unmigrated database is not reported as ready.
  await db.select().from(user).limit(0)
  await db.select().from(memorials).limit(0)
  await db.select().from(rateLimit).limit(0)
  const rows = await db.select({ slug: gardens.slug }).from(gardens).where(inArray(gardens.slug, [...gardenIds]))
  if (rows.length !== gardenIds.length) throw new Error('Garden metadata is missing')
}

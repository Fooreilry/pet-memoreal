import { count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDatabase } from '../../db/client'
import { gardens, memorials, user } from '../../db/schema'
import { requireAdminAccess } from '../../utils/session'
import { gardenCapacity, gardenIds } from '../../../shared/gardens'
import type { GardenId } from '../../../shared/gardens'
import { getPermissions } from '../../../shared/roles'
import type { AdminOverview } from '../../../shared/admin'

const querySchema = z.object({
  usersPage: z.coerce.number().int().min(1).max(1_000_000).default(1),
  memorialsPage: z.coerce.number().int().min(1).max(1_000_000).default(1)
}).strict()
const pageSize = 20

export default defineEventHandler(async (event): Promise<AdminOverview> => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const viewer = await requireAdminAccess(event)
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid pagination' })
  const { usersPage, memorialsPage } = parsed.data
  const { db } = getDatabase()
  try {
    const [people, places, userTotals, memorialTotals, occupied] = await Promise.all([
      db.select({ id: user.id, name: user.name, surname: user.surname, email: user.email, role: user.role,
        emailVerified: user.emailVerified, createdAt: user.createdAt }).from(user)
        .orderBy(desc(user.createdAt), desc(user.id)).limit(pageSize).offset((usersPage - 1) * pageSize),
      db.select({ id: memorials.id, gardenId: gardens.slug, place: memorials.place, name: memorials.name,
        species: memorials.species, born: memorials.born, died: memorials.died, story: memorials.story,
        isAnonymous: memorials.isAnonymous, ownerId: memorials.ownerId, creatorName: user.name })
        .from(memorials).innerJoin(gardens, eq(gardens.id, memorials.gardenId))
        .innerJoin(user, eq(user.id, memorials.ownerId))
        .orderBy(desc(memorials.createdAt), desc(memorials.id)).limit(pageSize).offset((memorialsPage - 1) * pageSize),
      db.select({ value: count() }).from(user),
      db.select({ value: count() }).from(memorials),
      db.select({ slug: gardens.slug, value: count(memorials.id) }).from(gardens)
        .leftJoin(memorials, eq(memorials.gardenId, gardens.id)).groupBy(gardens.slug)
    ])
    return {
      users: people.map(person => ({ ...person, createdAt: person.createdAt.toISOString() })),
      memorials: places.map(place => ({ ...place, gardenId: place.gardenId as GardenId })),
      gardens: gardenIds.map(id => ({ id, capacity: gardenCapacity[id], occupied: occupied.find(row => row.slug === id)?.value ?? 0 })),
      totals: { users: userTotals[0]!.value, memorials: memorialTotals[0]!.value },
      permissions: getPermissions(viewer.role), pageSize, usersPage, memorialsPage
    }
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Administration unavailable' })
  }
})

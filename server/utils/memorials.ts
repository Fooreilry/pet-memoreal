import { and, asc, eq, sql } from 'drizzle-orm'
import { getDatabase } from '../db/client'
import { gardens, memorials, user } from '../db/schema'
import { gardenCapacity, isCreatablePlace } from '../../shared/gardens'
import type { GardenId } from '../../shared/gardens'
import type { NewMemorial, PublicMemorial } from '../../shared/memorials'

const publicFields = {
  id: memorials.id, place: memorials.place, name: memorials.name,
  born: memorials.born, died: memorials.died, story: memorials.story,
  creatorName: sql<string | null>`case when ${memorials.isAnonymous} then null else ${user.name} end`
}

type PublicRow = Pick<typeof memorials.$inferSelect, 'id' | 'place' | 'name' | 'born' | 'died' | 'story'> & { creatorName: string | null }

function publicRecord(row: PublicRow, gardenId: GardenId): PublicMemorial {
  return { source: 'saved', id: row.id, gardenId, place: row.place, name: row.name, born: row.born, died: row.died, story: row.story, creatorName: row.creatorName, species: 'pet' }
}

export async function listGardenMemorials(gardenId: GardenId) {
  const rows = await getDatabase().db.select(publicFields).from(memorials)
    .innerJoin(gardens, eq(memorials.gardenId, gardens.id))
    .innerJoin(user, eq(memorials.ownerId, user.id))
    .where(eq(gardens.slug, gardenId)).orderBy(asc(memorials.place))
  return rows.map(row => publicRecord(row, gardenId))
}

export async function listOwnedMemorials(ownerId: string) {
  const rows = await getDatabase().db.select({ ...publicFields, slug: gardens.slug }).from(memorials)
    .innerJoin(gardens, eq(memorials.gardenId, gardens.id))
    .innerJoin(user, eq(memorials.ownerId, user.id))
    .where(eq(memorials.ownerId, ownerId)).orderBy(asc(memorials.createdAt))
  return rows.map(row => publicRecord(row, row.slug as GardenId))
}

export async function createMemorial(ownerId: string, input: NewMemorial) {
  return getDatabase().db.transaction(async (tx) => {
    async function createdRecord(row: typeof memorials.$inferSelect) {
      const [creator] = row.isAnonymous ? [] : await tx.select({ name: user.name }).from(user).where(eq(user.id, ownerId))
      return publicRecord({ ...row, creatorName: creator?.name ?? null }, input.gardenId)
    }
    // Lock one garden row so competing requests cannot claim the same place.
    const [garden] = await tx.select().from(gardens).where(eq(gardens.slug, input.gardenId)).for('update')
    if (!garden) throw createError({ statusCode: 503, statusMessage: 'Garden unavailable' })
    const [previous] = await tx.select().from(memorials).where(and(eq(memorials.ownerId, ownerId), eq(memorials.requestId, input.requestId)))
    if (previous) {
      if (previous.gardenId !== garden.id || previous.name !== input.name || previous.born !== input.born || previous.died !== input.died || previous.story !== input.story || previous.isAnonymous !== input.isAnonymous || (input.place !== undefined && previous.place !== input.place)) {
        throw createError({ statusCode: 409, statusMessage: 'Request conflict' })
      }
      return createdRecord(previous)
    }
    const occupied = await tx.select({ place: memorials.place }).from(memorials).where(eq(memorials.gardenId, garden.id))
    const taken = new Set(occupied.map(row => row.place))
    if (input.place !== undefined && !isCreatablePlace(input.gardenId, input.place)) throw createError({ statusCode: 400, statusMessage: 'Invalid place' })
    if (input.place !== undefined && taken.has(input.place)) throw createError({ statusCode: 409, statusMessage: 'Place occupied' })
    const place = input.place ?? Array.from({ length: gardenCapacity[input.gardenId] }, (_, index) => index + 1).find(number => isCreatablePlace(input.gardenId, number) && !taken.has(number))
    if (!place) throw createError({ statusCode: 409, statusMessage: 'Garden full' })
    const [row] = await tx.insert(memorials).values({ ...input, ownerId, gardenId: garden.id, place }).returning()
    return createdRecord(row!)
  })
}

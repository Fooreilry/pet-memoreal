import type { createDatabase } from '../../server/db/client'
import { gardens } from '../../server/db/schema'

export const COMMON_GARDEN_ID = '00000000-0000-4000-8000-000000000001'
export const COMMON_GARDEN_SLUG = 'common'
export const MAP_GARDENS = [
  { id: '00000000-0000-4000-8000-000000000002', slug: 'meadow' },
  { id: '00000000-0000-4000-8000-000000000003', slug: 'lake' },
  { id: '00000000-0000-4000-8000-000000000004', slug: 'grove' },
  { id: '00000000-0000-4000-8000-000000000005', slug: 'hill' }
]

export async function seedDevelopmentData(db: ReturnType<typeof createDatabase>['db']) {
  await db.insert(gardens)
    .values([{ id: COMMON_GARDEN_ID, slug: COMMON_GARDEN_SLUG }, ...MAP_GARDENS])
    .onConflictDoNothing({ target: gardens.slug })
}

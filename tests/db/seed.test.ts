import assert from 'node:assert/strict'
import test from 'node:test'
import { eq } from 'drizzle-orm'
import { COMMON_GARDEN_ID, COMMON_GARDEN_SLUG, MAP_GARDENS, seedDevelopmentData } from '../../scripts/db/seed-data'
import { createDatabase } from '../../server/db/client'
import { gardens } from '../../server/db/schema'

test('повторный запуск seed сохраняет один общий сад', async () => {
  const { db, pool } = createDatabase()

  try {
    await seedDevelopmentData(db)
    await seedDevelopmentData(db)
    const rows = await db.select().from(gardens).where(eq(gardens.slug, COMMON_GARDEN_SLUG))

    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, COMMON_GARDEN_ID)
    for (const garden of MAP_GARDENS) {
      const mapped = await db.select().from(gardens).where(eq(gardens.slug, garden.slug))
      assert.equal(mapped.length, 1)
      assert.equal(mapped[0]?.id, garden.id)
    }
  } finally {
    await pool.end()
  }
})

import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { getDatabaseOptions } from '../../server/db/config'

export default async function setup() {
  const database = process.env.E2E_DATABASE
  if (!database || !/^petmemoreal_e2e_\d+_[a-f0-9]{8}$/.test(database)) throw new Error('Invalid temporary E2E database name')
  const admin = new pg.Client(getDatabaseOptions())
  await admin.connect()
  await admin.query(`CREATE DATABASE "${database}"`)
  const pool = new pg.Pool({ ...getDatabaseOptions(), database })
  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  } catch (error) {
    await pool.end()
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`)
    await admin.end()
    throw error
  }
  await pool.end()
  return async () => {
    // Only the uniquely named database created above may be removed.
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`)
    await admin.end()
  }
}

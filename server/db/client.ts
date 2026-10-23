import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { attachDatabasePool } from '@vercel/functions'
import { getDatabaseOptions } from './config'
import type { DatabaseTarget } from './config'
import * as schema from './schema'

export function createDatabase(target: DatabaseTarget = 'runtime') {
  const pool = new pg.Pool(getDatabaseOptions(target))
  // Idle connection failures must not crash the server or dump connection data.
  pool.on('error', () => console.error('Database connection interrupted'))
  if (target === 'runtime' && process.env.VERCEL === '1') attachDatabasePool(pool)
  return { db: drizzle({ client: pool, schema }), pool }
}

let database: ReturnType<typeof createDatabase> | undefined
export function getDatabase() {
  return database ??= createDatabase()
}

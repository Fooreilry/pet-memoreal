import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDatabase } from '../../server/db/client'
import { checkRemoteTarget } from './remote-target'

checkRemoteTarget()
const { db, pool } = createDatabase('migration')

try {
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('Миграции базы актуальны')
} catch {
  console.error('Не удалось применить миграции. Проверьте подключение и права БД; секреты не выводятся.')
  process.exitCode = 1
} finally {
  await pool.end()
}

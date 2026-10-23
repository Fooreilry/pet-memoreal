import { createDatabase } from '../../server/db/client'
import { seedDevelopmentData } from './seed-data'
import { checkRemoteTarget } from './remote-target'

checkRemoteTarget()
const { db, pool } = createDatabase('migration')

try {
  await seedDevelopmentData(db)
  console.log('Данные готовы: общий сад и четыре сада карты')
} catch {
  console.error('Не удалось заполнить базу. Проверьте подключение и миграции; секреты не выводятся.')
  process.exitCode = 1
} finally {
  await pool.end()
}

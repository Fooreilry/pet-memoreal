import { createDatabase } from '../../server/db/client'
import { seedDevelopmentData } from './seed-data'
import { checkRemoteTarget } from './remote-target'
import { getAdminConfig, seedInitialAdmin } from './admin-data'

checkRemoteTarget()
const { db, pool } = createDatabase('migration')

try {
  const admin = getAdminConfig()
  await seedDevelopmentData(db)
  if (admin) {
    const result = await seedInitialAdmin(db, admin)
    console.log(result === 'created' ? 'Начальный администратор создан; данные входа — в env-файле.' : 'Начальный администратор уже существует; пароль и профиль сохранены.')
  }
  console.log('Данные готовы: общий сад и четыре сада карты')
} catch {
  console.error('Не удалось заполнить базу. Проверьте подключение и миграции; секреты не выводятся.')
  process.exitCode = 1
} finally {
  await pool.end()
}

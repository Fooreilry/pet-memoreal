import { createDatabase } from '../../server/db/client'
import { getAdminConfig, seedInitialAdmin } from './admin-data'
import { checkRemoteTarget } from './remote-target'

checkRemoteTarget()
const config = getAdminConfig(process.env, true)!
const { db, pool } = createDatabase('migration')

try {
  const result = await seedInitialAdmin(db, config)
  console.log(result === 'created' ? 'Администратор создан. Данные входа находятся в локальном env-файле.' : 'Администратор уже существует; пароль и профиль сохранены.')
} catch {
  console.error('Не удалось создать администратора. Проверьте миграции и настройки ADMIN_*; занятый адрес другого аккаунта использовать нельзя. Секреты не выводятся.')
  process.exitCode = 1
} finally {
  await pool.end()
}

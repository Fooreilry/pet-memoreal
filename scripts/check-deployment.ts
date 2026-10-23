import { createDatabase } from '../server/db/client'
import { checkRemoteDatabaseTargets } from '../server/db/config'
import { getAuthConfig } from '../server/utils/auth-config'
import { checkDatabase } from '../server/utils/database-health'
import { createMailTransport } from '../server/utils/mail'

let stage = 'настройки'
async function check() {
  checkRemoteDatabaseTargets()
  const auth = getAuthConfig()
  const { db, pool } = createDatabase()
  const mail = createMailTransport(auth)
  try {
    stage = 'база и схема'
    await checkDatabase(db)
    console.log('База: подключение, миграции и четыре сада готовы.')
    stage = 'SMTP'
    await mail.verify()
    console.log('SMTP: подключение и авторизация работают. Письма не отправлялись.')
    console.log('Проверка завершена. Доставку письма и ссылки проверьте регистрацией после публикации.')
  } finally {
    mail.close()
    await pool.end()
  }
}

check().catch(() => {
  console.error(`Проверка не пройдена (${stage}). Проверьте переменные .env.vercel, доступ к БД, миграции и SMTP. Секреты и исходные ошибки не выводятся.`)
  process.exitCode = 1
})

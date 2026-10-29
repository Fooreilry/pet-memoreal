# Локальные сервисы

Для разработки приложение запускается на хосте, а PostgreSQL, S3-совместимое хранилище и тестовая почта — через `compose.yaml`. Нужны Docker Desktop с запущенным Engine, Node.js 22+ и pnpm из `package.json`.

## Первый запуск

Локальный `.env` уже создан. Если он отсутствует, создайте его в корне проекта вручную. Для Compose обязательны `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` и `S3_BUCKET`. Задайте свои локальные пароли; файл `.env` игнорируется Git. Не добавляйте реальные секреты в документацию или коммиты. Необязательные порты перечислены ниже и имеют значения по умолчанию в `compose.yaml`.

```powershell
docker compose --env-file .env up -d --wait
docker compose ps
```

Запуск повторно: `docker compose --env-file .env up -d --wait`. Остановка без удаления данных: `docker compose down`. Именованные тома сохраняют данные между запусками. Для проверки сервисов выполните `node --env-file=.env scripts/check-local-services.mjs`.

| Сервис | Адрес на хосте | Назначение |
| --- | --- | --- |
| PostgreSQL 18.6 | `127.0.0.1:5432` | Данные приложения |
| SeaweedFS S3 | `http://127.0.0.1:8333` | Объекты в bucket `petmemoreal-media` |
| SeaweedFS Admin | `http://127.0.0.1:23646` | Просмотр локального хранилища |
| Mailpit Web | `http://127.0.0.1:8025` | Просмотр тестовых писем |
| Mailpit SMTP | `127.0.0.1:1025` | Отправка тестовых писем без TLS и авторизации |

Порты и имена задаются в `.env`. Все порты привязаны к `127.0.0.1`. Если приложение позже запустится отдельным контейнером в той же Compose-сети, оно должно обращаться к `postgres:5432`, `storage:8333` и `mailpit:1025`, а не к `127.0.0.1`.

## Подключение приложения

PostgreSQL на хосте использует `POSTGRES_HOST` (по умолчанию `127.0.0.1`), `POSTGRES_PORT` (по умолчанию `5432`), `POSTGRES_USER`, `POSTGRES_PASSWORD` и `POSTGRES_DB` из `.env`. S3 SDK: endpoint `http://127.0.0.1:<S3_PORT>`, регион `us-east-1`, ключи `S3_ACCESS_KEY`/`S3_SECRET_KEY`, bucket `S3_BUCKET`, режим `forcePathStyle: true`. Подключение S3 к Nitro остаётся следующей задачей.

Письма Better Auth уже подключены через `SMTP_HOST=127.0.0.1` и `SMTP_PORT`, равный `MAILPIT_SMTP_PORT` (по умолчанию `1025`). Настройки `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` и SMTP обязательны для запуска приложения; см. [регистрацию и доступ](authentication.md).

## База данных

После запуска PostgreSQL выполните из корня проекта:

```powershell
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm db:test
```

`db:migrate` применяет SQL из `drizzle/`; `db:seed` добавляет общий сад и четыре сада карты с постоянными ID и безопасен при повторном запуске. Если в `.env` заданы `ADMIN_EMAIL` и `ADMIN_PASSWORD`, он также создаёт начального администратора. Отдельно это делает `corepack pnpm db:admin`. `db:test` проверяет справочники и создание администратора на локальной базе. Миграция `0001_gigantic_switch.sql` создаёт таблицы Better Auth; `0002_round_susan_delgado.sql` — мемориалы и четыре сада. Подробнее: [роли и администрирование](roles-and-administration.md), [создание мемориала](memorial-creation.md).

При изменении `server/db/schema.ts` сначала выполните `corepack pnpm db:generate`, просмотрите новый SQL-файл в `drizzle/`, затем запустите `db:migrate` и `db:seed`. Генерация SQL не требует подключения к базе. Миграции храните вместе с кодом. Seed не добавляет личные истории или демонстрационные пользовательские аккаунты; начальный администратор создаётся отдельно из `ADMIN_*`.

Для демо используются отдельные Neon и Resend, настройки Vercel и локальный `.env.vercel`. Обычный `.env` остаётся для Docker. Порядок настройки, миграций и публикации — в [инструкции по деплою](vercel-deployment.md).

## Диагностика

`docker compose ps` показывает состояние контейнеров. `docker compose logs --tail=100 postgres storage mailpit` помогает найти ошибку запуска. Если порт уже занят, измените его в `.env` и перезапустите сервисы командой `docker compose --env-file .env up -d`.

PostgreSQL и SeaweedFS здесь служат только локальной разработке. Для публичного запуска потребуются отдельные настройки доступа, резервного копирования и размещения.

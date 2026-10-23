# Непрерывная проверка

GitHub Actions запускает `.github/workflows/ci.yml` при `push`, `pull_request` и ручном запуске. Workflow использует Ubuntu и Node.js 24. Версия pnpm берётся из поля `packageManager` в `package.json` через Corepack.

Порядок проверок: установка по `pnpm-lock.yaml` с `--frozen-lockfile`, `lint`, `typecheck`, unit-тесты настроек, `build`, установка Chromium, браузерные тесты, тест Vercel-режима и `build:vercel`. Если манифест зависимостей и lockfile расходятся, установка завершается ошибкой; обновите lockfile локально перед следующим запуском.

Для воспроизведения проверок на своей машине выполните из корня проекта:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:unit
corepack pnpm build
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
corepack pnpm test:vercel
corepack pnpm build:vercel
```

Lint, typecheck, unit-тесты и обе сборки не требуют запущенной базы или секретов. Браузерным тестам нужны PostgreSQL и Mailpit: локально запустите `docker compose up -d postgres mailpit`, настройки базы берутся из `.env`. Playwright создаёт временную БД, применяет миграции и удаляет её после прогона; пользователь PostgreSQL должен иметь право `CREATEDB`. Сборки и typecheck выполняйте последовательно; `build:vercel` запускайте после браузерных тестов, которым нужна обычная Node-сборка.

CI поднимает PostgreSQL 18.6 и Mailpit отдельными сервисами. Используются только тестовые учётные данные; секрет Better Auth генерируется на каждый запуск. Проверяются регистрация, письма, вход/выход, восстановление пароля, мемориалы, кабинет и лендинг на RU/EN и двух размерах экрана. Отдельно проверяются конкурентные ограничения авторизации и доверие к Vercel IP. Workflow не публикует приложение и не подключается к облачным сервисам. Проверка сидирования `db:test` остаётся отдельной: см. [локальные сервисы](local-services.md). Публикация описана в [Vercel + Neon + Resend](vercel-deployment.md).

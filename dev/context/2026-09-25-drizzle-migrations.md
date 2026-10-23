# Drizzle, миграция и тестовые данные

## Задача

Выполнить третий пункт блока 1: подключить Drizzle к локальному PostgreSQL, добавить команды генерации и применения миграций, создать повторяемый seed. По уточнению владельца удалить `.env.example`; проект использует только локальный игнорируемый `.env`.

## Решение

- Добавлена схема `server/db/schema.ts` и подключение через `pg` в `server/db/client.ts`.
- Первая миграция создаёт `gardens`. Seed добавляет один общий сад с постоянным ID; данные о пользователях и мемориалах отложены до продуктовой спецификации и блока 3.
- `db:generate` запускает Drizzle Kit, `db:migrate` применяет его SQL через штатный migrator Drizzle ORM, `db:seed` заполняет базу. Для TypeScript-скриптов установлен `tsx`.
- Интеграционный тест запускает seed дважды и проверяет одну запись. Инструкции находятся в `dev/docs/local-services.md`.

## Проверка

- `corepack pnpm db:generate` создал `drizzle/0000_mixed_jubilee.sql`.
- `corepack pnpm db:migrate` и `corepack pnpm db:seed` прошли на локальном PostgreSQL.
- `corepack pnpm db:test` прошёл: повторный seed не создаёт дублей.
- Повторный `db:generate` не нашёл изменений схемы; повторный `db:migrate` прошёл без повторного применения миграции.
- `corepack pnpm lint`, `corepack pnpm typecheck` и `corepack pnpm build` прошли.

## Ссылки

- [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-existing)
- [Drizzle Kit migrations](https://orm.drizzle.team/docs/drizzle-kit-migrate)
- [Drizzle ORM migrator](https://orm.drizzle.team/docs/tutorials/node-railway-pg)

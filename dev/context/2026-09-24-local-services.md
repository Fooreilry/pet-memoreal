# Локальные сервисы для блока 1

## Задача

Реализовать первый пункт блока 1 из `dev/roadmap.md`: локальные PostgreSQL, S3-совместимое хранилище и тестовую почту. Пользователь уточнил, что PostgreSQL запускается в Docker, а инструкции и стек размещаются отдельными файлами в `dev/docs/`. Связанных задач в трекере нет.

## Решение

Добавлены `compose.yaml` с PostgreSQL, SeaweedFS и Mailpit, локальные порты, именованные тома и инструкции в `dev/docs/local-services.md`. Выбранный стек описан отдельно в `dev/docs/tech-stack.md`. Пароли задаются в игнорируемом `.env`. Шаблон `.env.example` удалён 25 сентября по решению владельца проекта. Скрипт `scripts/check-local-services.mjs` проверяет запрос к PostgreSQL, запись и чтение объекта в S3, веб-интерфейс и SMTP Mailpit.

## Проверка

- `docker compose --env-file .env config --quiet` — конфигурация корректна.
- `docker compose --env-file .env up -d --wait` — все три контейнера запущены; PostgreSQL и Mailpit здоровы, SeaweedFS отвечает на S3-запросы.
- `node --env-file=.env scripts/check-local-services.mjs` — все проверки прошли.
- Панель SeaweedFS на `127.0.0.1:23646` вернула HTTP 200.
- `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build` — прошли.

## Ссылки

- [Официальный образ PostgreSQL](https://hub.docker.com/_/postgres)
- [SeaweedFS: Docker и S3](https://github.com/seaweedfs/seaweedfs#docker)
- [Mailpit в Docker](https://mailpit.axllent.org/docs/install/docker/)

# Диагностика производительности PixiJS-садов

## Задача

Наблюдать реальные обновления/отрисовки, CPU, подготовку сцен и ресурсы, сравнивая версии в фиксированных условиях. Обычная работа сада остаётся с лимитом 30 FPS; инструменты включаются публичным runtime-флагом.

## Решение

- `gardenDiagnostics.ts` — независимый от Vue коллектор с ограниченными кольцевыми буферами (2048), активным временем, раздельными timing-метриками и JSON. Pause/hidden разрывают непрерывную серию интервалов. Percentiles относятся к сохранённому окну; полные totals/mean/min/max не теряются.
- Renderer probe устанавливается только при флаге. Перехватывает bound ticker callback и ручные кадры, считает только успешный верхний render основной stage без target; nested cache/RenderTexture исключены. CPU не объявляется GPU-временем, renders/s — browser FPS.
- Generation измеряется отдельно; preparation заканчивается на первом подготовленном кадре, totalReady — при интерактивности. API имеет request ID и потребляется один раз. Reset отбрасывает старый pending journey; отмена и supersession не приписывают его новому run.
- `GardenDiagnostics.client.vue` использует Nuxt UI Popover/Select и существующие токены. Панель обновляется 500мс только когда открыта и видима; collect не создаёт периодического UI-опроса. Дополнительного RAF нет. Управление 30/60 явное, экспорт доступен в collect через UI и разрешённый browser API.
- Флаг off не создаёт коллектора, diagnostic watchers, таймеров, renderer probe или browser API. Инвентаризация выполняется при запросе snapshot/export, не в покадровой Vue-reactivity. В отчёте только числовые counts и выбранная служебная metadata; текст мемориалов/авторизация исключены.
- Отдельные production-конфигурации Playwright: acceptance и benchmark. Бенчмарк фиксирует seed, API, viewport/DPR, motion; один worker, без trace/video/screenshots; 3с warmup +15с ×3, 40 garden transitions. Каждый run и сводка сохраняются отдельно, порогов регрессии нет.

## Особенности стенда

Production SSR проверяет доступность сервисов до browser API mocks. Изолированный стенд открывает гостевой shell, затем использует настоящий клиентский router с замоканным API; Pixi renderer создаётся впервые в каждом чистом cold context. Проверки доступности в продукте не отключаются. Измерение Pixi не включает загрузку shell.

## Проверка

- `lint`, `typecheck`, production `build` — успешно; unit — 133/133, включая кольцевые буферы, active-time, JSON-redaction и разные render paths.
- Production acceptance — 8/8: flag off, panel/collect/download, 30/60, ручной/автоматический render, пауза/hidden, API/preparation, reset during waiting. Панель/списки/Escape/44px проверены на 1440/390/320px; PNG просмотрены. Обычные сады при off — 26/26 desktop/mobile (переходы, камера, крупный план, погода, resize).
- Полный benchmark — 12.1 минуты, 41 JSON + `summary.json`, completed=true: 4 first entries, 36 steady runs по 15с после 3с warmup и 40 transitions. Post-validation проверила schema, seed=424242, DPR=1, limit=30, collect, отсутствие preparation в steady и эффекты ON/OFF. Максимальная сохранённая выборка — 381 (capacity=2048).
- Учтённые ресурсы одинаковы для каждого сада во всех 10 циклах: totalNodes meadow=101, lake=81, grove=99, hill=98; renderTextures=0 в каждом ready-снимке. Это инвентаризация графа, не доказательство отсутствия GPU/driver leaks.
- Baseline: `dev/benchmarks/results/2026-10-30T11-27-32-231Z-fps30-2cd779e1/summary.json`. Chromium 153, WebGL2/ANGLE/SwiftShader, viewport браузера 1440×1000. CPU-время и render-call rate не считаются GPU/display FPS; аппаратные телефоны требуют отдельных запусков. Результаты игнорируются Git и защищены от очистки `test-results`.
- Strict UI audit: 0 unresolved; три ложных срабатывания на библиотечных `UPopover` triggers (help, garden switch, diagnostics), реальные действия и клавиатура проверены. Design lint: 0 ошибок, 16 предупреждений о runtime CSS-потребителях Model B.

В тестовом layout сначала найден размер action-buttons 36px; доведён до 44px. Проверка геометрии ждёт окончания shared popover scale-in. Acceptance не использует временный корневой `test-results` как outputDir, чтобы не удалять отдельные логи и прошлые артефакты. Итоговые проверки: `test-results/diagnostics-*`, лог полного запуска — `test-results/garden-baseline.log`.

Инструкции: `dev/docs/garden-diagnostics.md`, `dev/docs/garden-benchmarks.md`. Git push/commit не выполнялись.

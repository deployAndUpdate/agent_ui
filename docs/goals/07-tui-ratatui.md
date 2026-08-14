# Цель 7: TUI track (Ratatui)

## Статус

Параллельный контракт + **визуальный Ratatui-клиент** (Paragraph / Table / List / Gauge / Chart).

## Сделано

- [x] `@visual-engine/tui-shared` — JSON Schema + `validateTuiManifest`
- [x] `backend/src/tui/` — store, HTTP `/api/v1/tui/*`, WS `/api/v1/tui/stream`
- [x] Миграция `backend/migrations/002_tui.sql`
- [x] `tui/` — Ratatui browser (visual-first): Braille charts, gauges, tables, scroll
- [x] Desktop (GTK/Qt / desktop-host) удалён

## Изоляция от веба

TUI **не** импортирует `DashboardManifest`, Scene Graph, React. Веб и TUI живут рядом в одном HTTP-процессе, но с нулевой общей бизнес-логикой.

### Чеклист будущего удаления веба

Удалить без правок TUI-ядра:

1. `frontend/`
2. Web-роуты в `backend/src/app.ts` (`/api/manifest`, `/api/dashboard`, `/api/widget-interaction`)
3. `backend/src/store/*` (DashboardStore), `backend/src/ws/*` (web SessionHub), `backend/src/outbox/OutboxPublisher.ts`
4. Web-таблицы из `001_init.sql` (или оставить только TUI-миграции)
5. `@visual-engine/shared` (web schemas / scene) и `@visual-engine/cli` web-submit
6. `./app-run front`, skill visual-agent-engine (web)

Оставить:

- `packages/tui-shared/`
- `backend/src/tui/`
- `tui/` (Rust / Ratatui client)
- `backend/migrations/002_tui.sql`

## Как проверить

```bash
npm run dev:backend
npm run dev:tui
# агент пушит оба трека, либо:
curl -s http://127.0.0.1:3001/api/v1/tui/manifest -H 'content-type: application/json' \
  -d "{\"sessionId\":\"demo\",\"manifest\":$(cat backend/tests/fixtures/tui-manifest.valid.json)}"
```

Клавиши: `PgUp`/`PgDn` scroll, `q` выход.

```bash
npm test -w @visual-engine/tui-shared
npm test -w backend -- tests/integration/tui.test.ts
cargo test --manifest-path tui/Cargo.toml
```

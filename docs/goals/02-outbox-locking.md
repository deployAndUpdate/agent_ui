# Goal 02 — Outbox + Optimistic Locking

## Цель

Transactional Outbox: атомарная запись дашборда + outbox-события; optimistic locking по `version`.

## Критерии готовности

- [x] In-memory store (тесты) с интерфейсом, совместимым с PostgreSQL-моделью
- [x] `saveDashboardWithOutbox(sessionId, manifest, version)` в одной «транзакции»
- [x] Отклонение устаревшего `version` (optimistic lock)
- [x] Консюмер outbox помечает события как published
- [x] Unit-тесты зелёные

## Статус

✅ **Готово** (2026-08-09) — 4/4 unit

# Goal 01 — Schema + AJV Validator

## Цель

Каноническая JSON Schema `DashboardManifest` и сервис валидации (AJV), возвращающий структурированные ошибки для Self-Healing.

## Критерии готовности

- [x] Файл схемы в `packages/shared`
- [x] `validateManifest(payload)` → `{ ok: true, data }` | `{ ok: false, errors }`
- [x] Unit-тесты: валидный манифест, missing fields, bad enum, size out of range
- [x] Все тесты модуля зелёные

## Статус

✅ **Готово** (2026-08-09) — 6/6 unit

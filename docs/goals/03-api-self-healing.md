# Goal 03 — API + Mock AI + Self-Healing

## Цель

HTTP Gatekeeper: приём манифеста, 400 на invalid, persist + outbox на valid. Mock-агент повторяет запрос после ошибок (Self-Healing).

## Критерии готовности

- [x] `POST /api/manifest` — 200 / 400
- [x] `GET /api/dashboard/:sessionId` — снимок
- [x] `POST /api/widget-interaction` — приём событий
- [x] Mock AI: сначала битый JSON → healing → валидный
- [x] Integration-тесты зелёные

## Статус

✅ **Готово** (2026-08-09) — API + healManifest unit

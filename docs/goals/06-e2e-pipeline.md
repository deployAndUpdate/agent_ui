# Goal 06 — E2E Pipeline

## Цель

Сквозной сценарий: mock AI → validate → outbox → WS → frontend state.

## Критерии готовности

- [x] E2E-тест пайплайна без реального LLM
- [x] Все уровни пирамиды проходят одной командой `npm test`
- [x] Цели 00–06 отмечены ✅

## Статус

✅ **Готово** (2026-08-09) — `npm test`: shared 6 + backend 13 + frontend 4 = 23

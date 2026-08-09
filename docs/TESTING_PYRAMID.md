# Пирамида тестирования — Visual Agent Engine

```
                    ╱╲
                   ╱  ╲
                  ╱ E2E ╲          мало, дорого, полный пайплайн
                 ╱────────╲        mock AI → API → Outbox → WS → UI state
                ╱          ╲
               ╱ Integration ╲     HTTP + WS + store
              ╱────────────────╲
             ╱                  ╲
            ╱      Unit tests     ╲  много, быстро: schema, outbox,
           ╱────────────────────────╲ lock, registry, self-healing pure
```

## Уровни

| Уровень | Что покрываем | Инструменты | Где |
|---------|---------------|-------------|-----|
| **Unit** | AJV schema, outbox/lock pure logic, component registry mapping, mock-AI heal step | Vitest | `packages/shared`, `backend/src/**`, `frontend/src/**` |
| **Integration** | Express routes + in-memory store; WS push после outbox | Vitest + supertest + `ws` | `backend/tests/integration` |
| **Component** | VisualEngine рендер виджетов, interaction events | Vitest + Testing Library + jsdom | `frontend/tests` |
| **E2E** | Полный SDUI-пайплайн с mock JSON от «агента» | Vitest (orchestrated) | `backend/tests/e2e` + `frontend` hooks |

## Правила цикла (TDD loop)

1. Пишем **падающие** тесты по цели модуля.
2. Пишем минимальный код.
3. Прогоняем тесты.
4. При падении **чиним код**, тесты не меняем (кроме явной ошибки в спеке).
5. Цель в `docs/goals/*.md` → ✅.

## Mock AI

Фикстуры в `backend/tests/fixtures/`:

- `manifest.valid.json` — корректный манифест
- `manifest.invalid.json` — намеренно битый (для Self-Healing)
- Mock-агент: при 400 правит поля по ошибкам AJV и ретраит (макс. N попыток)

## Команда

```bash
npm test          # все пакеты
npm test -w backend
npm test -w frontend
npm test -w @visual-engine/shared
```

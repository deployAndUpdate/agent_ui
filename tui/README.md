# Visual Engine — Ratatui TUI client

Полноценный терминальный рендерер трека TUI (`RENDER_MANIFEST` → виджеты Ratatui).

## Запуск

```bash
# терминал 1
npm run dev:backend

# терминал 2
npm run dev:tui
# алиас: npm run dev:tui-stub
```

Env:

| Variable | Default |
|----------|---------|
| `TUI_SESSION_ID` | `demo` |
| `TUI_WS_URL` | `ws://127.0.0.1:3001/api/v1/tui/stream?sessionId=<session>` |

## Виджеты

| Manifest type | Ratatui |
|---------------|---------|
| Paragraph | bordered text + color `style` |
| Table | header + zebra rows |
| List | items with selected marker |
| Gauge | colored ratio bar |
| Chart | Braille line datasets + axes/legend |

Vertical layout uses **readable heights** (not squeezed ratios) + **PgUp/PgDn** scroll. Horizontal still uses size weights.

## Клавиши

- `q` / `Esc` — выход
- `PgUp` / `PgDn` — вертикальный scroll

Интерактив `USER_ACTION` — минимальный (visual-first); фокус/select_row — следующий этап.

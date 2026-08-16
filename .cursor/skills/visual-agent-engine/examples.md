# Visual Agent Engine — TUI examples

## Full board (SYNC)

```json
{
  "taskId": "req_sales_overview",
  "operation": "SYNC_DASHBOARD",
  "layout": {
    "direction": "vertical",
    "chunks": [
      {
        "widgetId": "w_header",
        "type": "Paragraph",
        "size": 2,
        "props": {
          "title": "Sales overview",
          "text": "Revenue 12500 USD · Active users 842",
          "style": "cyan"
        }
      },
      {
        "widgetId": "w_gauge",
        "type": "Gauge",
        "size": 1,
        "props": { "title": "Pipeline", "ratio": 0.72, "label": "72%" }
      },
      {
        "widgetId": "w_table",
        "type": "Table",
        "size": 8,
        "props": {
          "headers": ["id", "name", "amount"],
          "rows": [
            ["1", "Acme", "1200"],
            ["2", "Globex", "900"]
          ]
        }
      },
      {
        "widgetId": "w_log",
        "type": "List",
        "size": 4,
        "props": {
          "title": "Log",
          "items": ["Dashboard synced", "Imported CRM rows"]
        }
      },
      {
        "widgetId": "w_trend",
        "type": "Chart",
        "size": 6,
        "props": {
          "title": "Weekly sales",
          "datasets": [{ "name": "sales", "data": [12, 18, 15, 22, 28, 25, 30] }]
        }
      }
    ]
  }
}
```

```bash
npm run agent -- submit --session demo --file /tmp/vae-manifest.tui.json
```

## User prompt → agent actions

User: "Build a sales dashboard for session demo"

1. Optionally GET `/api/v1/tui/session/demo`
2. Write a TUI SYNC manifest (include a `Table` if row drill-down is needed)
3. `npm run agent -- submit --session demo --file .vae/manifest.tui.json`
4. Reply: `TUI_SESSION_ID=demo npm run dev:tui` or `./vae`
5. Optional: tell user keys — `i` browse · Enter open table · Enter row detail · Esc back · `q` quit

## Custom detail (reactor off)

```bash
TUI_ACTION_REACTOR=off ./vae
```

On `select_row`, submit a detail `SYNC_DASHBOARD`; on `navigate_back`, resubmit the board.

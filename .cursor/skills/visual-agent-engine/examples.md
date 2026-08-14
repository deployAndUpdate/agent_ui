# Visual Agent Engine — examples

## Full dashboard (SYNC)

```json
{
  "taskId": "req_sales_overview",
  "operation": "SYNC_DASHBOARD",
  "layout": {
    "widgets": [
      {
        "widgetId": "w_revenue",
        "type": "MetricCard",
        "size": { "w": 3, "h": 2 },
        "props": { "title": "Revenue", "value": 12500, "unit": "USD" }
      },
      {
        "widgetId": "w_users",
        "type": "MetricCard",
        "size": { "w": 3, "h": 2 },
        "props": { "title": "Active Users", "value": 842 }
      },
      {
        "widgetId": "w_trend",
        "type": "DataChart",
        "size": { "w": 6, "h": 3 },
        "props": {
          "title": "Weekly sales",
          "series": [{ "name": "sales", "points": [12, 18, 15, 22, 28, 25, 30] }]
        }
      },
      {
        "widgetId": "w_log",
        "type": "ActionLog",
        "size": { "w": 4, "h": 3 },
        "props": {
          "entries": [
            { "at": "2026-08-09T10:00:00Z", "text": "Dashboard synced" },
            { "at": "2026-08-09T10:05:00Z", "text": "Imported CRM rows" }
          ]
        }
      },
      {
        "widgetId": "w_table",
        "type": "DataTable",
        "size": { "w": 8, "h": 4 },
        "props": {
          "columns": ["id", "name", "amount"],
          "rows": [
            { "id": 1, "name": "Acme", "amount": 1200 },
            { "id": 2, "name": "Globex", "amount": 900 }
          ]
        }
      }
    ]
  }
}
```

Submit **both** tracks (same session / taskId):

```bash
npm run agent -- submit --session demo --version 1 --file /tmp/vae-manifest.json

curl -s http://127.0.0.1:3001/api/v1/tui/manifest \
  -H 'content-type: application/json' \
  -d "{\"sessionId\":\"demo\",\"manifest\":$(cat /tmp/vae-manifest.tui.json)}"
```

## Matching TUI SYNC (same data)

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

## Add one widget

```json
{
  "taskId": "req_add_chart",
  "operation": "ADD_WIDGET",
  "layout": {
    "widgets": [
      {
        "widgetId": "w_conversion",
        "type": "MetricCard",
        "size": { "w": 3, "h": 2 },
        "props": { "title": "Conversion", "value": "3.2", "unit": "%" }
      }
    ]
  }
}
```

```bash
npm run agent -- submit --session demo --version 2 --file /tmp/vae-add.json
```

## Update widget

```json
{
  "taskId": "req_update_revenue",
  "operation": "UPDATE_WIDGET",
  "layout": {
    "widgets": [
      {
        "widgetId": "w_revenue",
        "type": "MetricCard",
        "size": { "w": 3, "h": 2 },
        "props": { "title": "Revenue", "value": 15000, "unit": "USD" }
      }
    ]
  }
}
```

## Remove widget

```json
{
  "taskId": "req_remove_log",
  "operation": "REMOVE_WIDGET",
  "layout": {
    "widgets": [
      {
        "widgetId": "w_log",
        "type": "ActionLog",
        "size": { "w": 1, "h": 1 },
        "props": {}
      }
    ]
  }
}
```

## User prompt → agent actions

User: «Собери дашборд продаж для сессии demo»

1. GET `/api/dashboard/demo` (or assume v1 if 404)
2. Write web SYNC manifest (metrics + chart + table)
3. Write TUI SYNC manifest with the same facts (Paragraph/Table/List/Chart)
4. `npm run agent -- submit --session demo --version 1 --file .vae/manifest.web.json`
5. `curl …/api/v1/tui/manifest` with `.vae/manifest.tui.json`
6. Reply with web URL **and** remind that `npm run dev:tui` should show the board

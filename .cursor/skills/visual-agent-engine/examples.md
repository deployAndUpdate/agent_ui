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

Submit:

```bash
npm run agent -- submit --session demo --version 1 --file /tmp/vae-manifest.json
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
2. Write SYNC manifest with metrics + chart + table
3. `npm run agent -- submit --session demo --version 1 --file ...`
4. Reply with `http://localhost:5173/?sessionId=demo`

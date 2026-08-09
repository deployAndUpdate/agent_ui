import type { DashboardManifest } from '../src/types.js';

export const validManifest: DashboardManifest = {
  taskId: 'req_88231',
  operation: 'SYNC_DASHBOARD',
  layout: {
    widgets: [
      {
        widgetId: 'w_01',
        type: 'MetricCard',
        size: { w: 3, h: 2 },
        props: { title: 'Revenue', value: 12500, unit: 'USD' },
      },
      {
        widgetId: 'w_02',
        type: 'DataChart',
        size: { w: 6, h: 3 },
        props: {
          title: 'Trend',
          series: [{ name: 'sales', points: [1, 3, 2, 5] }],
        },
      },
      {
        widgetId: 'w_03',
        type: 'ActionLog',
        size: { w: 3, h: 3 },
        props: { entries: [{ at: '2026-06-06T12:00:00Z', text: 'synced' }] },
      },
      {
        widgetId: 'w_04',
        type: 'DataTable',
        size: { w: 12, h: 4 },
        props: {
          columns: ['id', 'name'],
          rows: [{ id: 1, name: 'alpha' }],
        },
      },
    ],
  },
};

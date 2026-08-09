import { describe, expect, it } from 'vitest';
import { applyLayoutOperation } from '../src/applyLayoutOperation.js';
import type { DashboardManifest } from '../src/types.js';

const base: DashboardManifest = {
  taskId: 't1',
  operation: 'SYNC_DASHBOARD',
  layout: {
    widgets: [
      {
        widgetId: 'w_01',
        type: 'MetricCard',
        size: { w: 3, h: 2 },
        props: { title: 'A', value: 1 },
      },
      {
        widgetId: 'w_02',
        type: 'DataTable',
        size: { w: 6, h: 3 },
        props: { columns: ['id'], rows: [] },
      },
    ],
  },
};

describe('applyLayoutOperation (unit)', () => {
  it('SYNC replaces entire layout', () => {
    const next = applyLayoutOperation(base, {
      taskId: 't2',
      operation: 'SYNC_DASHBOARD',
      layout: {
        widgets: [
          {
            widgetId: 'only',
            type: 'ActionLog',
            size: { w: 4, h: 2 },
            props: { entries: [] },
          },
        ],
      },
    });
    expect(next.layout.widgets).toHaveLength(1);
    expect(next.layout.widgets[0].widgetId).toBe('only');
  });

  it('ADD appends / upserts widgets', () => {
    const next = applyLayoutOperation(base, {
      taskId: 't2',
      operation: 'ADD_WIDGET',
      layout: {
        widgets: [
          {
            widgetId: 'w_03',
            type: 'DataChart',
            size: { w: 6, h: 3 },
            props: { title: 'C', series: [] },
          },
        ],
      },
    });
    expect(next.layout.widgets.map((w) => w.widgetId)).toEqual(['w_01', 'w_02', 'w_03']);
  });

  it('UPDATE changes matching widgets', () => {
    const next = applyLayoutOperation(base, {
      taskId: 't2',
      operation: 'UPDATE_WIDGET',
      layout: {
        widgets: [
          {
            widgetId: 'w_01',
            type: 'MetricCard',
            size: { w: 4, h: 2 },
            props: { title: 'A', value: 99 },
          },
        ],
      },
    });
    expect(next.layout.widgets).toHaveLength(2);
    expect(next.layout.widgets[0].props.value).toBe(99);
    expect(next.layout.widgets[0].size.w).toBe(4);
  });

  it('REMOVE drops listed widgetIds', () => {
    const next = applyLayoutOperation(base, {
      taskId: 't2',
      operation: 'REMOVE_WIDGET',
      layout: {
        widgets: [
          {
            widgetId: 'w_02',
            type: 'DataTable',
            size: { w: 1, h: 1 },
            props: {},
          },
        ],
      },
    });
    expect(next.layout.widgets.map((w) => w.widgetId)).toEqual(['w_01']);
  });
});

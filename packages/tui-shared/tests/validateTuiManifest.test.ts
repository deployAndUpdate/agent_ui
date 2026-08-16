import { describe, expect, it } from 'vitest';
import { validateTuiManifest } from '../src/validateTuiManifest.js';

const canonicalManifest = {
  taskId: 'task_7749',
  operation: 'SYNC_DASHBOARD',
  layout: {
    direction: 'vertical',
    chunks: [
      {
        widgetId: 'w_header',
        type: 'Paragraph',
        size: 3,
        props: {
          title: 'Agent Execution Panel',
          text: 'Status: Searching local files...',
          style: 'cyan',
        },
      },
      {
        widgetId: 'w_results',
        type: 'Table',
        size: 12,
        props: {
          headers: ['File', 'Lines', 'Match Score'],
          rows: [
            ['src/main.rs', '142', '0.98'],
            ['src/engine.rs', '85', '0.91'],
          ],
        },
      },
    ],
  },
};

describe('validateTuiManifest', () => {
  it('accepts the canonical Ratatui manifest from the spec', () => {
    const result = validateTuiManifest(canonicalManifest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.taskId).toBe('task_7749');
      expect(result.data.layout.chunks).toHaveLength(2);
    }
  });

  it('accepts List, Gauge, and Chart chunks', () => {
    const result = validateTuiManifest({
      taskId: 'task_1',
      operation: 'SYNC_DASHBOARD',
      layout: {
        chunks: [
          { widgetId: 'l', type: 'List', size: 5, props: { items: ['a', 'b'] } },
          { widgetId: 'g', type: 'Gauge', size: 1, props: { ratio: 0.4, label: '40%' } },
          {
            widgetId: 'c',
            type: 'Chart',
            size: 8,
            props: { datasets: [{ name: 'cpu', data: [1, 2, 3] }] },
          },
        ],
      },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects unknown widget types', () => {
    const result = validateTuiManifest({
      taskId: 'task_1',
      operation: 'SYNC_DASHBOARD',
      layout: {
        chunks: [
          {
            widgetId: 'bad',
            type: 'MetricCard',
            size: 2,
            props: { text: 'nope' },
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('type') || e.includes('enum'))).toBe(true);
    }
  });

  it('accepts Chart kinds and optional labels', () => {
    for (const kind of ['line', 'bar', 'sparkline', 'pie', 'stacked'] as const) {
      const result = validateTuiManifest({
        taskId: 'task_1',
        operation: 'SYNC_DASHBOARD',
        layout: {
          chunks: [
            {
              widgetId: 'c',
              type: 'Chart',
              size: 8,
              props: {
                kind,
                title: 'Trend',
                labels: ['a', 'b', 'c'],
                datasets: [{ name: 'cpu', data: [1, 2, 3] }],
              },
            },
          ],
        },
      });
      expect(result.ok, kind).toBe(true);
    }
  });

  it('rejects unknown Chart kind', () => {
    const result = validateTuiManifest({
      taskId: 'task_1',
      operation: 'SYNC_DASHBOARD',
      layout: {
        chunks: [
          {
            widgetId: 'c',
            type: 'Chart',
            size: 8,
            props: {
              kind: 'radar',
              datasets: [{ name: 'cpu', data: [1, 2, 3] }],
            },
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
  });

  it('accepts Table visual props', () => {
    const result = validateTuiManifest({
      taskId: 'task_1',
      operation: 'SYNC_DASHBOARD',
      layout: {
        chunks: [
          {
            widgetId: 't',
            type: 'Table',
            size: 6,
            props: {
              title: 'Files',
              headers: ['id', 'score'],
              rows: [['1', '0.9']],
              align: ['left', 'right'],
              numericAlign: true,
              zebra: false,
              compact: true,
              highlightColumn: 0,
            },
          },
        ],
      },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects invalid Table props', () => {
    const result = validateTuiManifest({
      taskId: 'task_1',
      operation: 'SYNC_DASHBOARD',
      layout: {
        chunks: [
          {
            widgetId: 't',
            type: 'Table',
            size: 4,
            props: { rows: [] },
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
  });
});

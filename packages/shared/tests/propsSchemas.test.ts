import { describe, expect, it } from 'vitest';
import { validateManifest } from '../src/validateManifest.js';
import { validManifest } from './fixtures.js';

describe('widget props schemas (unit)', () => {
  it('rejects MetricCard without required props', () => {
    const result = validateManifest({
      ...validManifest,
      layout: {
        widgets: [
          {
            widgetId: 'w_01',
            type: 'MetricCard',
            size: { w: 3, h: 2 },
            props: { title: 'Only title' },
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
  });

  it('skips strict props checks on REMOVE_WIDGET', () => {
    const result = validateManifest({
      taskId: 't1',
      operation: 'REMOVE_WIDGET',
      layout: {
        widgets: [
          {
            widgetId: 'w_01',
            type: 'MetricCard',
            size: { w: 1, h: 1 },
            props: {},
          },
        ],
      },
    });
    expect(result.ok).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { validateManifest } from '../src/validateManifest.js';
import { validManifest } from './fixtures.js';

describe('validateManifest (unit)', () => {
  it('accepts a valid DashboardManifest', () => {
    const result = validateManifest(validManifest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.taskId).toBe('req_88231');
      expect(result.data.layout.widgets).toHaveLength(4);
    }
  });

  it('rejects missing required fields', () => {
    const result = validateManifest({ operation: 'SYNC_DASHBOARD' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('taskId') || e.includes('required'))).toBe(
        true,
      );
    }
  });

  it('rejects invalid operation enum', () => {
    const result = validateManifest({
      ...validManifest,
      operation: 'DELETE_EVERYTHING',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.toLowerCase().includes('operation'))).toBe(true);
    }
  });

  it('rejects widget type outside registry', () => {
    const result = validateManifest({
      ...validManifest,
      layout: {
        widgets: [
          {
            widgetId: 'bad',
            type: 'RawHtml',
            size: { w: 2, h: 2 },
            props: {},
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects size.w out of range', () => {
    const result = validateManifest({
      ...validManifest,
      layout: {
        widgets: [
          {
            widgetId: 'w_big',
            type: 'MetricCard',
            size: { w: 99, h: 2 },
            props: {},
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects size.h below minimum', () => {
    const result = validateManifest({
      ...validManifest,
      layout: {
        widgets: [
          {
            widgetId: 'w_tiny',
            type: 'MetricCard',
            size: { w: 2, h: 0 },
            props: {},
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchDashboard, postWidgetInteraction } from '../src/api/client';
import type { WidgetInteractionEvent } from '@visual-engine/shared';

describe('api client (unit)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetchDashboard returns snapshot on 200', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sessionId: 's1',
        version: 2,
        manifest: {
          taskId: 't1',
          operation: 'SYNC_DASHBOARD',
          layout: { widgets: [] },
        },
        updatedAt: '2026-08-09T00:00:00Z',
      }),
    });

    const snap = await fetchDashboard('s1', 'http://api');
    expect(snap?.version).toBe(2);
    expect(globalThis.fetch).toHaveBeenCalledWith('http://api/api/dashboard/s1', expect.any(Object));
  });

  it('fetchDashboard returns null on 404', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'not_found' }),
    });
    expect(await fetchDashboard('missing', 'http://api')).toBeNull();
  });

  it('postWidgetInteraction posts JSON event', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ ok: true }),
    });
    const event: WidgetInteractionEvent = {
      type: 'widget_interaction',
      taskId: 't1',
      widgetId: 'w1',
      action: 'export_csv',
      payload: { format: 'csv' },
      timestamp: '2026-08-09T00:00:00Z',
    };
    await postWidgetInteraction(event, 'http://api');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api/api/widget-interaction',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

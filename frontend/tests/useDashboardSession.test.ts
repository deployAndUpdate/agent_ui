import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useDashboardSession } from '../src/hooks/useDashboardSession';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => this.onopen?.(undefined));
  }

  close() {
    this.onclose?.(undefined);
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

describe('useDashboardSession reconnect (unit)', () => {
  const originalWS = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    MockWebSocket.reset();
    // @ts-expect-error mock
    globalThis.WebSocket = MockWebSocket;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sessionId: 's1',
        version: 1,
        manifest: {
          taskId: 't',
          operation: 'SYNC_DASHBOARD',
          layout: {
            widgets: [
              {
                widgetId: 'w',
                type: 'MetricCard',
                size: { w: 3, h: 2 },
                props: { title: 'Hydrated', value: 1 },
              },
            ],
          },
        },
        updatedAt: '2026-08-09T00:00:00Z',
      }),
    });
  });

  afterEach(() => {
    globalThis.WebSocket = originalWS;
    globalThis.fetch = originalFetch;
  });

  it('hydrates via GET and accepts WS updates; reconnect triggers catch-up refresh', async () => {
    const { result } = renderHook(() =>
      useDashboardSession({
        sessionId: 's1',
        apiBase: 'http://api',
        wsBase: 'ws://api',
        reconnectBaseMs: 10,
        maxReconnectMs: 20,
      }),
    );

    await waitFor(() => expect(result.current.manifest?.taskId).toBe('t'));
    expect(result.current.status).toBe('live');

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: 'dashboard_update',
          sessionId: 's1',
          version: 2,
          manifest: {
            taskId: 't',
            operation: 'SYNC_DASHBOARD',
            layout: {
              widgets: [
                {
                  widgetId: 'w',
                  type: 'MetricCard',
                  size: { w: 3, h: 2 },
                  props: { title: 'Live', value: 9 },
                },
              ],
            },
          },
        }),
      });
    });

    await waitFor(() => expect(result.current.version).toBe(2));
    expect(result.current.manifest?.layout.widgets[0].props.title).toBe('Live');

    const fetchCallsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => {
      ws.close();
    });
    await waitFor(() => expect(result.current.status).toBe('reconnecting'));
    await waitFor(() =>
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
        fetchCallsBefore,
      ),
    );
  });
});

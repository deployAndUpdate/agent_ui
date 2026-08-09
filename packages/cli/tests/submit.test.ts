import { describe, expect, it, vi } from 'vitest';
import { submitManifestWithSelfHealing } from '../src/submit.js';

describe('CLI self-healing submit (unit)', () => {
  it('retries after 400 then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        status: 400,
        json: async () => ({ errors: ['bad'] }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true }),
      });

    const result = await submitManifestWithSelfHealing({
      apiBase: 'http://api',
      sessionId: 's1',
      version: 1,
      manifest: {
        taskId: 't',
        operation: 'SYNC_BOARD',
        layout: {
          widgets: [
            {
              widgetId: 'w',
              type: 'MetricCard',
              size: { w: 99, h: 1 },
              props: { title: 'X' },
            },
          ],
        },
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxAttempts: 3,
    });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

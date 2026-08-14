import { describe, expect, it, vi } from 'vitest';
import { submitTuiManifestWithSelfHealing } from '../src/submit.js';

describe('CLI TUI self-healing submit (unit)', () => {
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

    const result = await submitTuiManifestWithSelfHealing({
      apiBase: 'http://api',
      sessionId: 's1',
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
    const body = JSON.parse((fetchImpl.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.manifest.layout.chunks[0].type).toBe('Paragraph');
  });
});

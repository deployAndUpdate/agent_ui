import { describe, expect, it } from 'vitest';
import { extractJsonObject, normalizeDetailManifest } from '../src/parseManifest.js';
import { stubEnrichManifest } from '../src/enrich.js';
import type { AgentWebhookBody } from '../src/types.js';

const body: AgentWebhookBody = {
  systemPrompt: 'more details',
  command: '/details',
  sessionId: 'demo',
  taskId: 'detail_w_alltime_0',
  widgetId: 'w_alltime',
  payload: { rowIndex: 0, row: ['01', 'Half-Life 2', '2004'] },
  currentManifest: null,
  callback: {
    manifestUrl: 'http://127.0.0.1:3001/api/v1/tui/manifest',
    sessionId: 'demo',
  },
};

describe('parseManifest', () => {
  it('extracts fenced json', () => {
    const raw = 'Here:\n```json\n{"taskId":"detail_x","operation":"SYNC_DASHBOARD","layout":{"chunks":[{"widgetId":"a","type":"Paragraph","size":2,"props":{"text":"hi"}}]}}\n```';
    const m = normalizeDetailManifest(raw, 'detail_fallback');
    expect(m.taskId).toBe('detail_x');
  });

  it('forces detail_ prefix', () => {
    const raw = JSON.stringify({
      taskId: 'enriched_1',
      operation: 'SYNC_DASHBOARD',
      layout: {
        chunks: [
          {
            widgetId: 'a',
            type: 'Paragraph',
            size: 2,
            props: { text: 'hi' },
          },
        ],
      },
    });
    const m = normalizeDetailManifest(raw, 'detail_w_alltime_0');
    expect(m.taskId).toBe('detail_w_alltime_0');
  });

  it('extractJsonObject finds embedded object', () => {
    expect(extractJsonObject('prefix {"a":1} suffix')).toEqual({ a: 1 });
  });

  it('takes first object when CLI appends extra JSON', () => {
    expect(extractJsonObject('{"a":1}{"b":2} leftover')).toEqual({ a: 1 });
  });
});

describe('stubEnrichManifest', () => {
  it('builds valid detail board', () => {
    const m = stubEnrichManifest(body);
    expect(m.taskId).toBe('detail_w_alltime_0');
    expect(m.layout.chunks.length).toBeGreaterThanOrEqual(2);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildJsonRepairPrompt,
  clampJsonRetries,
  parseLlmWithRetry,
} from '../src/retryJson.js';
import { normalizeDetailManifest } from '../src/parseManifest.js';

const valid = JSON.stringify({
  taskId: 'detail_ok',
  operation: 'SYNC_DASHBOARD',
  layout: {
    direction: 'vertical',
    chunks: [
      {
        widgetId: 'w_a',
        type: 'Paragraph',
        size: 2,
        props: { text: 'hi' },
      },
    ],
  },
});

describe('parseLlmWithRetry', () => {
  it('returns on first valid JSON', async () => {
    let calls = 0;
    const m = await parseLlmWithRetry({
      send: async () => {
        calls += 1;
        return valid;
      },
      initialPrompt: 'enrich',
      parse: (text) => normalizeDetailManifest(text, 'detail_fb'),
    });
    expect(calls).toBe(1);
    expect(m.layout.chunks).toHaveLength(1);
  });

  it('sends the schema error back and accepts the next JSON', async () => {
    const prompts: string[] = [];
    const m = await parseLlmWithRetry({
      send: async (prompt) => {
        prompts.push(prompt);
        if (prompts.length === 1) return 'not json at all';
        return valid;
      },
      initialPrompt: 'enrich me',
      parse: (text) => normalizeDetailManifest(text, 'detail_fb'),
    });
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toBe('enrich me');
    expect(prompts[1]).toContain('not json');
    expect(prompts[1]).toMatch(/Error:/);
    expect(m.taskId.startsWith('detail_')).toBe(true);
  });

  it('stops after maxAttempts and keeps the last error', async () => {
    await expect(
      parseLlmWithRetry({
        send: async () => 'still garbage',
        initialPrompt: 'x',
        parse: (text) => normalizeDetailManifest(text, 'detail_fb'),
        maxAttempts: 2,
      }),
    ).rejects.toThrow(/after 2 attempts/);
  });
});

describe('buildJsonRepairPrompt', () => {
  it('includes error and truncated previous output', () => {
    const p = buildJsonRepairPrompt('{"oops":true}', 'invalid TuiManifest: type');
    expect(p).toContain('{"oops":true}');
    expect(p).toContain('invalid TuiManifest: type');
    expect(p).toContain('ONLY strict JSON');
  });
});

describe('clampJsonRetries', () => {
  it('clamps to 1..5', () => {
    expect(clampJsonRetries(0)).toBe(3);
    expect(clampJsonRetries(9)).toBe(5);
    expect(clampJsonRetries(2.8)).toBe(2);
  });
});

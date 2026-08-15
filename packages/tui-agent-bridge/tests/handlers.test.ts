import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DaemonRuntime, isKnownCommand } from '../src/handlers.js';
import { errorEnrichManifest } from '../src/enrich.js';
import type { AgentWebhookBody, BridgeConfig } from '../src/types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const body: AgentWebhookBody = {
  systemPrompt: 'more details',
  command: '/details',
  sessionId: 'demo',
  taskId: 'detail_w_x_0',
  widgetId: 'w_x',
  payload: { rowIndex: 0, row: ['a', 'b'] },
  currentManifest: null,
  callback: {
    manifestUrl: 'http://127.0.0.1:9/api/v1/tui/manifest',
    sessionId: 'demo',
  },
};

function cfg(partial: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    host: '127.0.0.1',
    port: 9090,
    path: '/agent',
    token: null,
    driver: 'stub',
    model: 'composer-2.5',
    workspace: root,
    agentBin: 'agent',
    apiKey: null,
    apiKeyHeader: null,
    execCommand: `node ${path.join(root, 'examples/enrich-echo.mjs')}`,
    forwardUrl: null,
    forwardMode: 'sync',
    timeoutMs: 15_000,
    ...partial,
  };
}

describe('DaemonRuntime', () => {
  it('rejects unknown commands', async () => {
    const rt = new DaemonRuntime(cfg());
    await expect(rt.handle({ ...body, command: '/foo' })).rejects.toThrow(
      /unknown command: \/foo/,
    );
    expect(isKnownCommand('/foo')).toBe(false);
  });

  it('builds an error detail board for recover path', () => {
    const m = errorEnrichManifest(body, 'boom');
    expect(m.taskId.startsWith('detail_')).toBe(true);
    expect(m.layout.chunks[1]?.props).toMatchObject({ text: 'boom' });
  });

  it('board prompt error keeps session taskId', () => {
    const m = errorEnrichManifest(
      {
        ...body,
        command: '/prompt',
        taskId: 'task_7749',
        payload: { scope: 'board', userPrompt: 'x' },
      },
      'boom',
    );
    expect(m.taskId).toBe('task_7749');
  });
});

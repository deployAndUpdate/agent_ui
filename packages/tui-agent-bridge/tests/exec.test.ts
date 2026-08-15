import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runExecDriver } from '../src/drivers/exec.js';
import { normalizeDetailManifest } from '../src/parseManifest.js';
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
    manifestUrl: 'http://127.0.0.1:3001/api/v1/tui/manifest',
    sessionId: 'demo',
  },
};

function cfg(partial: Partial<BridgeConfig>): BridgeConfig {
  return {
    host: '127.0.0.1',
    port: 9090,
    path: '/agent',
    token: null,
    driver: 'exec',
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

describe('exec driver', () => {
  it('parseArgv splits quoted bash wrapper', async () => {
    const { parseArgv } = await import('../src/drivers/exec.js');
    expect(parseArgv('bash packages/tui-agent-bridge/examples/enrich-cursor.sh')).toEqual([
      'bash',
      'packages/tui-agent-bridge/examples/enrich-cursor.sh',
    ]);
  });

  it('runs enrich-echo.mjs stdin→stdout contract', async () => {
    const text = await runExecDriver(
      body,
      cfg({
        execCommand: `node ${path.join(root, 'examples/enrich-echo.mjs')}`,
      }),
    );
    const m = normalizeDetailManifest(text, body.taskId);
    expect(m.taskId).toBe('detail_w_x_0');
    expect(m.layout.chunks[0]?.type).toBe('Paragraph');
  });

  it('runs enrich-cursor.sh via argv (JSON not executed as bash)', async () => {
    const prev = process.env.TUI_BRIDGE_AGENT_BIN;
    process.env.TUI_BRIDGE_AGENT_BIN = 'definitely-missing-agent-bin';
    try {
      const text = await runExecDriver(
        body,
        cfg({
          execCommand: `bash ${path.join(root, 'examples/enrich-cursor.sh')}`,
        }),
      );
      const m = normalizeDetailManifest(text, body.taskId);
      expect(m.taskId).toBe('detail_w_x_0');
    } finally {
      if (prev === undefined) delete process.env.TUI_BRIDGE_AGENT_BIN;
      else process.env.TUI_BRIDGE_AGENT_BIN = prev;
    }
  });
});

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import type { DashboardManifest } from '@visual-engine/shared';
import { createApp } from '../../src/app.js';
import { InMemoryDashboardStore } from '../../src/store/InMemoryDashboardStore.js';
import { attachWebSocketServer } from '../../src/ws/attachWebSocketServer.js';
import { OutboxPublisher } from '../../src/outbox/OutboxPublisher.js';
import { runSelfHealingAgent } from '../../src/agent/selfHealingAgent.js';
import invalidManifest from '../fixtures/manifest.invalid.json';

describe('E2E SDUI pipeline (mock AI)', () => {
  let store: InMemoryDashboardStore;
  let server: http.Server;
  let publisher: OutboxPublisher;
  let port: number;

  beforeEach(async () => {
    store = new InMemoryDashboardStore();
    const app = createApp({ store });
    server = http.createServer(app);
    const hub = attachWebSocketServer(server, store);
    publisher = new OutboxPublisher(store, hub);
    publisher.start(20);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    publisher.stop();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('mock agent heals → API accepts → outbox → WS delivers', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=sess_e2e`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    const messagePromise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('E2E WS timeout')), 3000);
      ws.once('message', (data) => {
        clearTimeout(timer);
        resolve(JSON.parse(String(data)));
      });
    });

    const app = createApp({ store });
    const agentResult = await runSelfHealingAgent({
      app,
      sessionId: 'sess_e2e',
      initialManifest: invalidManifest,
      version: 1,
      maxAttempts: 3,
    });
    expect(agentResult.ok).toBe(true);

    const message = (await messagePromise) as {
      type: string;
      manifest: DashboardManifest;
      version: number;
    };
    expect(message.type).toBe('dashboard_update');
    expect(message.version).toBe(1);
    expect(message.manifest.operation).toBe('SYNC_DASHBOARD');

    const dash = await store.getDashboard('sess_e2e');
    expect(dash?.manifest.layout.widgets[0].type).toBe('MetricCard');

    ws.close();
  });
});

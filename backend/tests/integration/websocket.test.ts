import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import request from 'supertest';
import type { DashboardManifest } from '@visual-engine/shared';
import { createApp } from '../../src/app.js';
import { InMemoryDashboardStore } from '../../src/store/InMemoryDashboardStore.js';
import { attachWebSocketServer } from '../../src/ws/attachWebSocketServer.js';
import { OutboxPublisher } from '../../src/outbox/OutboxPublisher.js';
import validManifest from '../fixtures/manifest.valid.json';

const manifest = validManifest as DashboardManifest;

function waitForMessage(ws: WebSocket, timeoutMs = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS timeout')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(data)));
    });
  });
}

describe('WebSocket outbox stream (integration)', () => {
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

  it('pushes manifest update to subscribed session after POST', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=sess_ws`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    const messagePromise = waitForMessage(ws);

    const res = await request(server)
      .post('/api/manifest')
      .send({ sessionId: 'sess_ws', version: 1, manifest });
    expect(res.status).toBe(200);

    const message = (await messagePromise) as {
      type: string;
      sessionId: string;
      version: number;
      manifest: DashboardManifest;
    };
    expect(message.type).toBe('dashboard_update');
    expect(message.sessionId).toBe('sess_ws');
    expect(message.version).toBe(1);
    expect(message.manifest.taskId).toBe('req_88231');

    ws.close();
  });
});

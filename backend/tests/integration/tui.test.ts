import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import request from 'supertest';
import type { TuiManifest } from '@visual-engine/tui-shared';
import { createApp } from '../../src/app.js';
import { InMemoryTuiStore } from '../../src/tui/store/InMemoryTuiStore.js';
import { attachTuiWebSocket } from '../../src/tui/ws/attachTuiWebSocket.js';
import { TuiOutboxPublisher } from '../../src/tui/outbox/TuiOutboxPublisher.js';
import validTui from '../fixtures/tui-manifest.valid.json';

const manifest = validTui as TuiManifest;

function waitForMessage(ws: WebSocket, timeoutMs = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS timeout')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(data)));
    });
  });
}

describe('TUI API (integration)', () => {
  let tuiStore: InMemoryTuiStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    tuiStore = new InMemoryTuiStore();
    app = createApp({ tuiStore });
  });

  it('POST /api/v1/tui/manifest accepts valid payload and enqueues outbox', async () => {
    const res = await request(app).post('/api/v1/tui/manifest').send({
      sessionId: 'tui_sess',
      manifest,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.taskId).toBe('task_7749');

    const snap = await tuiStore.getSession('tui_sess');
    expect(snap?.manifest.layout.chunks).toHaveLength(2);
    expect(await tuiStore.listPendingOutbox()).toHaveLength(1);
  });

  it('POST /api/v1/tui/manifest returns 400 for unknown widget type', async () => {
    const res = await request(app).post('/api/v1/tui/manifest').send({
      sessionId: 'tui_sess',
      manifest: {
        taskId: 't1',
        operation: 'SYNC_DASHBOARD',
        layout: {
          chunks: [
            {
              widgetId: 'x',
              type: 'MetricCard',
              size: 1,
              props: { text: 'nope' },
            },
          ],
        },
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.errors?.length).toBeGreaterThan(0);
    expect(await tuiStore.getSession('tui_sess')).toBeNull();
  });

  it('GET /api/v1/tui/session/:id returns snapshot', async () => {
    await tuiStore.saveSessionWithOutbox({ sessionId: 'tui_sess', manifest });
    const res = await request(app).get('/api/v1/tui/session/tui_sess');
    expect(res.status).toBe(200);
    expect(res.body.taskId).toBe('task_7749');
  });

  it('POST /api/v1/tui/action persists USER_ACTION', async () => {
    const res = await request(app)
      .post('/api/v1/tui/action')
      .send({
        sessionId: 'tui_sess',
        event: 'USER_ACTION',
        taskId: 'task_7749',
        widgetId: 'w_results',
        action: 'select_row',
        payload: { rowIndex: 0, rowData: ['src/main.rs', '142', '0.98'] },
      });
    expect(res.status).toBe(202);
    expect(tuiStore.listActions('tui_sess')).toHaveLength(1);
  });
});

describe('TUI WebSocket outbox stream', () => {
  let tuiStore: InMemoryTuiStore;
  let server: http.Server;
  let publisher: TuiOutboxPublisher;
  let port: number;

  beforeEach(async () => {
    tuiStore = new InMemoryTuiStore();
    const app = createApp({ tuiStore });
    server = http.createServer(app);
    const hub = attachTuiWebSocket(server, tuiStore);
    publisher = new TuiOutboxPublisher(tuiStore, hub);
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

  it('pushes RENDER_MANIFEST after POST', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/tui/stream?sessionId=tui_ws`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    const messagePromise = waitForMessage(ws);

    const res = await request(server)
      .post('/api/v1/tui/manifest')
      .send({ sessionId: 'tui_ws', manifest });
    expect(res.status).toBe(200);

    const message = (await messagePromise) as {
      event: string;
      payload: TuiManifest;
    };
    expect(message.event).toBe('RENDER_MANIFEST');
    expect(message.payload.taskId).toBe('task_7749');

    ws.close();
  });

  it('records USER_ACTION from client WS frame', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/tui/stream?sessionId=tui_ws`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    ws.send(
      JSON.stringify({
        event: 'USER_ACTION',
        taskId: 'task_7749',
        widgetId: 'w_results',
        action: 'select_row',
        payload: { rowIndex: 0 },
      }),
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(tuiStore.listActions('tui_ws')).toHaveLength(1);
    ws.close();
  });
});

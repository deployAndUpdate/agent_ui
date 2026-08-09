import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import type { DashboardManifest } from '@visual-engine/shared';
import { createApp } from '../../src/app.js';
import { InMemoryDashboardStore } from '../../src/store/InMemoryDashboardStore.js';
import { runSelfHealingAgent } from '../../src/agent/selfHealingAgent.js';
import { loadConfig } from '../../src/config.js';
import validManifest from '../fixtures/manifest.valid.json';
import invalidManifest from '../fixtures/manifest.invalid.json';

const manifest = validManifest as DashboardManifest;

describe('API Gatekeeper (integration)', () => {
  let store: InMemoryDashboardStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    store = new InMemoryDashboardStore();
    app = createApp({ store });
  });

  it('POST /api/manifest returns 400 for invalid payload', async () => {
    const res = await request(app).post('/api/manifest').send({
      sessionId: 'sess_1',
      version: 1,
      manifest: invalidManifest,
    });
    expect(res.status).toBe(400);
    expect(res.body.errors?.length).toBeGreaterThan(0);
    expect(await store.getDashboard('sess_1')).toBeNull();
  });

  it('POST /api/manifest persists valid payload and outbox', async () => {
    const res = await request(app).post('/api/manifest').send({
      sessionId: 'sess_1',
      version: 1,
      manifest,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const dash = await store.getDashboard('sess_1');
    expect(dash?.manifest.taskId).toBe('req_88231');
    expect(await store.listPendingOutbox()).toHaveLength(1);
  });

  it('GET /api/dashboard/:sessionId returns snapshot', async () => {
    await store.saveDashboardWithOutbox({ sessionId: 'sess_1', manifest, version: 1 });
    const res = await request(app).get('/api/dashboard/sess_1');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.manifest.taskId).toBe('req_88231');
  });

  it('GET /api/dashboard/:sessionId returns 404 when missing', async () => {
    const res = await request(app).get('/api/dashboard/nope');
    expect(res.status).toBe(404);
  });

  it('POST /api/widget-interaction accepts standardized event', async () => {
    const res = await request(app)
      .post('/api/widget-interaction')
      .send({
        type: 'widget_interaction',
        taskId: 'req_88231',
        widgetId: 'w_01',
        action: 'export_csv',
        payload: { format: 'csv' },
        timestamp: '2026-06-06T12:00:00Z',
      });
    expect(res.status).toBe(202);
    expect(store.listInteractions()).toHaveLength(1);
  });

  it('Self-Healing agent retries until valid manifest is accepted', async () => {
    const result = await runSelfHealingAgent({
      app,
      sessionId: 'sess_heal',
      initialManifest: invalidManifest,
      version: 1,
      maxAttempts: 3,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBeGreaterThan(1);
    const dash = await store.getDashboard('sess_heal');
    expect(dash).not.toBeNull();
  });

  it('applies ADD_WIDGET against existing dashboard', async () => {
    await request(app).post('/api/manifest').send({
      sessionId: 'sess_ops',
      version: 1,
      manifest,
    });

    const add: DashboardManifest = {
      taskId: 'req_88231',
      operation: 'ADD_WIDGET',
      layout: {
        widgets: [
          {
            widgetId: 'w_02',
            type: 'ActionLog',
            size: { w: 4, h: 2 },
            props: { entries: [{ at: '2026-08-09T00:00:00Z', text: 'added' }] },
          },
        ],
      },
    };

    const res = await request(app).post('/api/manifest').send({
      sessionId: 'sess_ops',
      version: 2,
      manifest: add,
    });
    expect(res.status).toBe(200);
    const dash = await store.getDashboard('sess_ops');
    expect(dash?.manifest.layout.widgets.map((w) => w.widgetId)).toEqual(['w_01', 'w_02']);
  });

  it('honors Idempotency-Key header', async () => {
    const body = { sessionId: 'sess_idem', version: 1, manifest };
    const first = await request(app).post('/api/manifest').set('Idempotency-Key', 'k1').send(body);
    const second = await request(app).post('/api/manifest').set('Idempotency-Key', 'k1').send(body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.idempotentReplay).toBe(true);
    expect(second.body.outboxEventId).toBe(first.body.outboxEventId);
  });

  it('rejects unauthorized when auth enabled', async () => {
    const secured = createApp({
      store,
      config: {
        ...loadConfig({ AUTH_ENABLED: 'true', API_KEYS: 'secret' }),
      },
    });
    const res = await request(secured).post('/api/manifest').send({
      sessionId: 's',
      version: 1,
      manifest,
    });
    expect(res.status).toBe(401);

    const ok = await request(secured)
      .post('/api/manifest')
      .set('X-API-Key', 'secret')
      .send({ sessionId: 's', version: 1, manifest });
    expect(ok.status).toBe(200);
  });
});

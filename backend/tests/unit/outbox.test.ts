import { describe, expect, it } from 'vitest';
import type { DashboardManifest } from '@visual-engine/shared';
import { InMemoryDashboardStore } from '../../src/store/InMemoryDashboardStore.js';
import validManifest from '../fixtures/manifest.valid.json';

const manifest = validManifest as DashboardManifest;

describe('InMemoryDashboardStore outbox + optimistic lock (unit)', () => {
  it('saves dashboard and outbox event in one transaction', async () => {
    const store = new InMemoryDashboardStore();
    const result = await store.saveDashboardWithOutbox({
      sessionId: 'sess_1',
      manifest,
      version: 1,
    });

    expect(result.ok).toBe(true);
    const dash = await store.getDashboard('sess_1');
    expect(dash?.version).toBe(1);
    expect(dash?.manifest.taskId).toBe('req_88231');

    const pending = await store.listPendingOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0].sessionId).toBe('sess_1');
    expect(pending[0].version).toBe(1);
    expect(pending[0].status).toBe('pending');
  });

  it('rejects stale version (optimistic locking)', async () => {
    const store = new InMemoryDashboardStore();
    const first = await store.saveDashboardWithOutbox({
      sessionId: 'sess_1',
      manifest,
      version: 1,
    });
    expect(first.ok).toBe(true);

    const newer = {
      ...manifest,
      layout: {
        widgets: [
          {
            ...manifest.layout.widgets[0],
            props: { title: 'Newer', value: 999 },
          },
        ],
      },
    };
    const second = await store.saveDashboardWithOutbox({
      sessionId: 'sess_1',
      manifest: newer,
      version: 2,
    });
    expect(second.ok).toBe(true);

    const stale = await store.saveDashboardWithOutbox({
      sessionId: 'sess_1',
      manifest,
      version: 1,
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.reason).toBe('stale_version');
    }

    const dash = await store.getDashboard('sess_1');
    expect(dash?.version).toBe(2);
    expect((dash?.manifest.layout.widgets[0].props as { value: number }).value).toBe(999);
  });

  it('marks outbox events as published', async () => {
    const store = new InMemoryDashboardStore();
    await store.saveDashboardWithOutbox({ sessionId: 'sess_1', manifest, version: 1 });
    const [event] = await store.listPendingOutbox();
    await store.markOutboxPublished(event.id);

    const pending = await store.listPendingOutbox();
    expect(pending).toHaveLength(0);
  });

  it('moves outbox event to dead after max failures', async () => {
    const store = new InMemoryDashboardStore();
    await store.saveDashboardWithOutbox({ sessionId: 'sess_1', manifest, version: 1 });
    const [event] = await store.listPendingOutbox();
    await store.markOutboxFailed(event.id, 'boom', false);
    expect((await store.listPendingOutbox())[0].attempts).toBe(1);
    await store.markOutboxFailed(event.id, 'boom', true);
    expect(await store.listPendingOutbox()).toHaveLength(0);
  });

  it('returns null for unknown session', async () => {
    const store = new InMemoryDashboardStore();
    expect(await store.getDashboard('missing')).toBeNull();
  });

  it('replays idempotent requests without duplicating outbox', async () => {
    const store = new InMemoryDashboardStore();
    const first = await store.saveDashboardWithOutbox({
      sessionId: 'sess_1',
      manifest,
      version: 1,
      idempotencyKey: 'idem-1',
    });
    const second = await store.saveDashboardWithOutbox({
      sessionId: 'sess_1',
      manifest,
      version: 1,
      idempotencyKey: 'idem-1',
    });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.idempotentReplay).toBe(true);
      expect(second.outboxEvent.id).toBe(first.outboxEvent.id);
    }
    expect(await store.listPendingOutbox()).toHaveLength(1);
  });
});

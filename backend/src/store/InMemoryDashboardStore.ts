import { applyLayoutOperation, type DashboardManifest, type WidgetInteractionEvent } from '@visual-engine/shared';
import type {
  DashboardSnapshot,
  DashboardStore,
  OutboxEvent,
  SaveDashboardInput,
  SaveResult,
} from './types.js';

export class InMemoryDashboardStore implements DashboardStore {
  private dashboards = new Map<string, DashboardSnapshot>();
  private outbox: OutboxEvent[] = [];
  private interactions: WidgetInteractionEvent[] = [];
  private idempotency = new Map<string, SaveResult & { ok: true }>();
  private seq = 0;

  async saveDashboardWithOutbox(input: SaveDashboardInput): Promise<SaveResult> {
    const { sessionId, manifest, version, idempotencyKey } = input;

    if (idempotencyKey) {
      const cached = this.idempotency.get(`${sessionId}:${idempotencyKey}`);
      if (cached) {
        return { ...cached, idempotentReplay: true };
      }
    }

    const current = this.dashboards.get(sessionId) ?? null;
    if (current && version <= current.version) {
      return { ok: false, reason: 'stale_version' };
    }

    const merged = applyLayoutOperation(current?.manifest ?? null, manifest);
    const updatedAt = new Date().toISOString();
    const snapshot: DashboardSnapshot = {
      sessionId,
      version,
      manifest: merged,
      updatedAt,
    };
    const outboxEvent: OutboxEvent = {
      id: `ob_${++this.seq}`,
      sessionId,
      version,
      manifest: merged,
      createdAt: updatedAt,
      status: 'pending',
      attempts: 0,
      published: false,
    };

    this.dashboards.set(sessionId, snapshot);
    this.outbox.push(outboxEvent);

    const result: SaveResult & { ok: true } = { ok: true, snapshot, outboxEvent };
    if (idempotencyKey) {
      this.idempotency.set(`${sessionId}:${idempotencyKey}`, result);
    }
    return result;
  }

  /** Test helper keeping old call shape */
  async saveDashboardWithOutboxLegacy(
    sessionId: string,
    manifest: DashboardManifest,
    version: number,
  ): Promise<SaveResult> {
    return this.saveDashboardWithOutbox({ sessionId, manifest, version });
  }

  async getDashboard(sessionId: string): Promise<DashboardSnapshot | null> {
    return this.dashboards.get(sessionId) ?? null;
  }

  async listPendingOutbox(): Promise<OutboxEvent[]> {
    return this.outbox.filter((e) => e.status === 'pending');
  }

  async markOutboxPublished(id: string): Promise<void> {
    const event = this.outbox.find((e) => e.id === id);
    if (event) {
      event.status = 'published';
      event.published = true;
      event.attempts += 1;
    }
  }

  async markOutboxFailed(id: string, error: string, dead: boolean): Promise<void> {
    const event = this.outbox.find((e) => e.id === id);
    if (event) {
      event.attempts += 1;
      event.lastError = error;
      event.status = dead ? 'dead' : 'pending';
      event.published = false;
    }
  }

  recordInteraction(event: WidgetInteractionEvent): void {
    this.interactions.push(event);
  }

  listInteractions(): WidgetInteractionEvent[] {
    return [...this.interactions];
  }
}

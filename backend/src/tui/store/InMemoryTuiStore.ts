import type { TuiManifest, TuiUserAction } from '@visual-engine/tui-shared';
import type {
  TuiOutboxEvent,
  TuiSaveInput,
  TuiSaveResult,
  TuiSessionSnapshot,
  TuiStore,
  TuiStoredAction,
} from './types.js';

export class InMemoryTuiStore implements TuiStore {
  private sessions = new Map<string, TuiSessionSnapshot>();
  private outbox: TuiOutboxEvent[] = [];
  private actions: TuiStoredAction[] = [];
  private idempotency = new Map<string, TuiSaveResult & { ok: true }>();
  private seq = 0;

  async saveSessionWithOutbox(input: TuiSaveInput): Promise<TuiSaveResult> {
    const { sessionId, manifest, idempotencyKey } = input;

    if (idempotencyKey) {
      const cached = this.idempotency.get(`${sessionId}:${idempotencyKey}`);
      if (cached) {
        return { ...cached, idempotentReplay: true };
      }
    }

    const updatedAt = new Date().toISOString();
    const snapshot: TuiSessionSnapshot = {
      sessionId,
      taskId: manifest.taskId,
      manifest,
      updatedAt,
    };
    const outboxEvent = await this.enqueueOutbox(sessionId, manifest);

    this.sessions.set(sessionId, snapshot);

    const result: TuiSaveResult & { ok: true } = { ok: true, snapshot, outboxEvent };
    if (idempotencyKey) {
      this.idempotency.set(`${sessionId}:${idempotencyKey}`, result);
    }
    return result;
  }

  async enqueueOutbox(sessionId: string, manifest: TuiManifest): Promise<TuiOutboxEvent> {
    const outboxEvent: TuiOutboxEvent = {
      id: `tui_ob_${++this.seq}`,
      sessionId,
      payload: manifest,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.outbox.push(outboxEvent);
    return outboxEvent;
  }

  async getSession(sessionId: string): Promise<TuiSessionSnapshot | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async listPendingOutbox(): Promise<TuiOutboxEvent[]> {
    return this.outbox.filter((e) => e.status === 'pending');
  }

  async markOutboxSent(id: string): Promise<void> {
    const event = this.outbox.find((e) => e.id === id);
    if (event) {
      event.status = 'sent';
    }
  }

  async recordAction(sessionId: string, action: TuiUserAction): Promise<void> {
    this.actions.push({
      sessionId,
      action,
      createdAt: new Date().toISOString(),
    });
  }

  listActions(sessionId?: string): TuiStoredAction[] {
    if (!sessionId) return [...this.actions];
    return this.actions.filter((a) => a.sessionId === sessionId);
  }
}

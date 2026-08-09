import type { Pool } from 'pg';
import { applyLayoutOperation, type WidgetInteractionEvent } from '@visual-engine/shared';
import type {
  DashboardSnapshot,
  DashboardStore,
  OutboxEvent,
  SaveDashboardInput,
  SaveResult,
} from './types.js';

function rowToOutbox(row: Record<string, unknown>): OutboxEvent {
  const status = row.status as OutboxEvent['status'];
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    version: Number(row.version),
    manifest: row.manifest as OutboxEvent['manifest'],
    createdAt: new Date(String(row.created_at)).toISOString(),
    status,
    attempts: Number(row.attempts ?? 0),
    lastError: row.last_error ? String(row.last_error) : undefined,
    published: status === 'published',
  };
}

export class PostgresDashboardStore implements DashboardStore {
  private interactions: WidgetInteractionEvent[] = [];

  constructor(private readonly pool: Pool) {}

  async saveDashboardWithOutbox(input: SaveDashboardInput): Promise<SaveResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      if (input.idempotencyKey) {
        const existing = await client.query(
          `SELECT response FROM idempotency_keys WHERE session_id = $1 AND key = $2`,
          [input.sessionId, input.idempotencyKey],
        );
        if (existing.rowCount && existing.rows[0]) {
          await client.query('COMMIT');
          const cached = existing.rows[0].response as SaveResult & { ok: true };
          return { ...cached, idempotentReplay: true };
        }
      }

      const currentRes = await client.query(
        `SELECT session_id, version, manifest, updated_at FROM dashboards WHERE session_id = $1 FOR UPDATE`,
        [input.sessionId],
      );
      const currentRow = currentRes.rows[0] as
        | { version: number; manifest: DashboardSnapshot['manifest'] }
        | undefined;

      if (currentRow && input.version <= Number(currentRow.version)) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'stale_version' };
      }

      const merged = applyLayoutOperation(currentRow?.manifest ?? null, input.manifest);
      const updatedAt = new Date();

      await client.query(
        `INSERT INTO dashboards (session_id, version, manifest, updated_at)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (session_id) DO UPDATE
           SET version = EXCLUDED.version,
               manifest = EXCLUDED.manifest,
               updated_at = EXCLUDED.updated_at`,
        [input.sessionId, input.version, JSON.stringify(merged), updatedAt],
      );

      const outboxRes = await client.query(
        `INSERT INTO outbox_events (session_id, version, manifest, status, attempts)
         VALUES ($1, $2, $3::jsonb, 'pending', 0)
         RETURNING id, session_id, version, manifest, created_at, status, attempts, last_error`,
        [input.sessionId, input.version, JSON.stringify(merged)],
      );

      const snapshot: DashboardSnapshot = {
        sessionId: input.sessionId,
        version: input.version,
        manifest: merged,
        updatedAt: updatedAt.toISOString(),
      };
      const outboxEvent = rowToOutbox(outboxRes.rows[0]);
      const result: SaveResult & { ok: true } = { ok: true, snapshot, outboxEvent };

      if (input.idempotencyKey) {
        await client.query(
          `INSERT INTO idempotency_keys (session_id, key, response)
           VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (session_id, key) DO NOTHING`,
          [input.sessionId, input.idempotencyKey, JSON.stringify(result)],
        );
      }

      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getDashboard(sessionId: string): Promise<DashboardSnapshot | null> {
    const res = await this.pool.query(
      `SELECT session_id, version, manifest, updated_at FROM dashboards WHERE session_id = $1`,
      [sessionId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      sessionId: row.session_id,
      version: Number(row.version),
      manifest: row.manifest,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async listPendingOutbox(): Promise<OutboxEvent[]> {
    const res = await this.pool.query(
      `SELECT id, session_id, version, manifest, created_at, status, attempts, last_error
       FROM outbox_events
       WHERE status = 'pending'
       ORDER BY id ASC
       LIMIT 100`,
    );
    return res.rows.map((r) => rowToOutbox(r));
  }

  async markOutboxPublished(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE outbox_events
       SET status = 'published', attempts = attempts + 1, published_at = NOW()
       WHERE id = $1`,
      [id],
    );
  }

  async markOutboxFailed(id: string, error: string, dead: boolean): Promise<void> {
    await this.pool.query(
      `UPDATE outbox_events
       SET status = $2, attempts = attempts + 1, last_error = $3
       WHERE id = $1`,
      [id, dead ? 'dead' : 'pending', error],
    );
  }

  recordInteraction(event: WidgetInteractionEvent): void {
    this.interactions.push(event);
  }

  listInteractions(): WidgetInteractionEvent[] {
    return [...this.interactions];
  }
}

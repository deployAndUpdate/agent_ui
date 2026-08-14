import type { Pool } from 'pg';
import type { TuiManifest, TuiUserAction } from '@visual-engine/tui-shared';
import type {
  TuiOutboxEvent,
  TuiSaveInput,
  TuiSaveResult,
  TuiSessionSnapshot,
  TuiStore,
  TuiStoredAction,
} from './types.js';

function rowToOutbox(row: Record<string, unknown>): TuiOutboxEvent {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    payload: row.payload as TuiManifest,
    status: row.status as TuiOutboxEvent['status'],
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export class PostgresTuiStore implements TuiStore {
  private actions: TuiStoredAction[] = [];

  constructor(private readonly pool: Pool) {}

  async saveSessionWithOutbox(input: TuiSaveInput): Promise<TuiSaveResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      if (input.idempotencyKey) {
        const existing = await client.query(
          `SELECT response FROM tui_idempotency_keys WHERE session_id = $1 AND key = $2`,
          [input.sessionId, input.idempotencyKey],
        );
        if (existing.rowCount && existing.rows[0]) {
          await client.query('COMMIT');
          const cached = existing.rows[0].response as TuiSaveResult & { ok: true };
          return { ...cached, idempotentReplay: true };
        }
      }

      const updatedAt = new Date();
      await client.query(
        `INSERT INTO tui_sessions (session_id, task_id, last_manifest, updated_at)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (session_id) DO UPDATE
           SET task_id = EXCLUDED.task_id,
               last_manifest = EXCLUDED.last_manifest,
               updated_at = EXCLUDED.updated_at`,
        [input.sessionId, input.manifest.taskId, JSON.stringify(input.manifest), updatedAt],
      );

      const outboxRes = await client.query(
        `INSERT INTO tui_outbox (session_id, payload, status)
         VALUES ($1, $2::jsonb, 'pending')
         RETURNING id, session_id, payload, status, created_at`,
        [input.sessionId, JSON.stringify(input.manifest)],
      );

      const snapshot: TuiSessionSnapshot = {
        sessionId: input.sessionId,
        taskId: input.manifest.taskId,
        manifest: input.manifest,
        updatedAt: updatedAt.toISOString(),
      };
      const outboxEvent = rowToOutbox(outboxRes.rows[0]);
      const result: TuiSaveResult & { ok: true } = { ok: true, snapshot, outboxEvent };

      if (input.idempotencyKey) {
        await client.query(
          `INSERT INTO tui_idempotency_keys (session_id, key, response)
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

  async enqueueOutbox(sessionId: string, manifest: TuiManifest): Promise<TuiOutboxEvent> {
    const res = await this.pool.query(
      `INSERT INTO tui_outbox (session_id, payload, status)
       VALUES ($1, $2::jsonb, 'pending')
       RETURNING id, session_id, payload, status, created_at`,
      [sessionId, JSON.stringify(manifest)],
    );
    return rowToOutbox(res.rows[0]);
  }

  async getSession(sessionId: string): Promise<TuiSessionSnapshot | null> {
    const res = await this.pool.query(
      `SELECT session_id, task_id, last_manifest, updated_at FROM tui_sessions WHERE session_id = $1`,
      [sessionId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      sessionId: row.session_id,
      taskId: row.task_id,
      manifest: row.last_manifest as TuiManifest,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async listPendingOutbox(): Promise<TuiOutboxEvent[]> {
    const res = await this.pool.query(
      `SELECT id, session_id, payload, status, created_at
       FROM tui_outbox WHERE status = 'pending' ORDER BY id ASC LIMIT 100`,
    );
    return res.rows.map((row) => rowToOutbox(row));
  }

  async markOutboxSent(id: string): Promise<void> {
    await this.pool.query(`UPDATE tui_outbox SET status = 'sent' WHERE id = $1`, [id]);
  }

  async recordAction(sessionId: string, action: TuiUserAction): Promise<void> {
    const createdAt = new Date().toISOString();
    this.actions.push({ sessionId, action, createdAt });
    await this.pool.query(
      `INSERT INTO tui_actions (session_id, payload) VALUES ($1, $2::jsonb)`,
      [sessionId, JSON.stringify(action)],
    );
  }

  listActions(sessionId?: string): TuiStoredAction[] {
    if (!sessionId) return [...this.actions];
    return this.actions.filter((a) => a.sessionId === sessionId);
  }
}

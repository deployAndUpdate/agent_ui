import type { TuiManifest, TuiUserAction } from '@visual-engine/tui-shared';
import type { TuiStore } from '../store/types.js';
import type { Logger } from '../../logging/logger.js';
import { createLogger } from '../../logging/logger.js';

function detailManifest(
  action: TuiUserAction,
  headers: string[],
  row: string[],
): TuiManifest {
  const lines = headers.map((h, i) => `${h}: ${row[i] ?? ''}`);
  const title = `Row ${typeof action.payload.rowIndex === 'number' ? action.payload.rowIndex : '?'}`;
  return {
    taskId: `detail_${action.widgetId}_${String(action.payload.rowIndex ?? 0)}`,
    operation: 'SYNC_DASHBOARD',
    layout: {
      direction: 'vertical',
      chunks: [
        {
          widgetId: 'w_detail_title',
          type: 'Paragraph',
          size: 3,
          props: {
            title: `${action.widgetId} · detail`,
            text: title,
            style: 'yellow',
          },
        },
        {
          widgetId: 'w_detail_body',
          type: 'Paragraph',
          size: 12,
          props: {
            title: 'Fields',
            text: lines.join('\n') || '(empty row)',
            style: 'cyan',
          },
        },
        {
          widgetId: 'w_detail_hint',
          type: 'Paragraph',
          size: 2,
          props: {
            title: 'Nav',
            text: 'Press Esc in the TUI to return to the board.',
            style: 'gray',
          },
        },
      ],
    },
  };
}

function extractTableRow(
  board: TuiManifest,
  widgetId: string,
  rowIndex: number,
): { headers: string[]; row: string[] } | null {
  const chunk = board.layout.chunks.find((c) => c.widgetId === widgetId);
  if (!chunk || chunk.type !== 'Table') return null;
  const headers = Array.isArray(chunk.props.headers)
    ? (chunk.props.headers as unknown[]).map(String)
    : [];
  const rows = Array.isArray(chunk.props.rows) ? (chunk.props.rows as unknown[]) : [];
  const raw = rows[rowIndex];
  if (!Array.isArray(raw)) return null;
  return { headers, row: raw.map(String) };
}

function actionPayloadRow(payload: Record<string, unknown>): string[] | null {
  if (!Array.isArray(payload.row)) return null;
  return payload.row.map(String);
}

export function isBuiltinReactorEnabled(): boolean {
  const v = (process.env.TUI_ACTION_REACTOR ?? 'builtin').toLowerCase();
  return v !== 'off' && v !== '0' && v !== 'false';
}

/**
 * Built-in action reactor (option C):
 * - Session snapshot always stays the root board (agent SYNC).
 * - Detail is ephemeral: outbox/WS only, never persisted as session.
 * - navigate_back re-publishes the session board.
 */
export async function reactToUserAction(opts: {
  sessionId: string;
  action: TuiUserAction;
  store: TuiStore;
  logger?: Logger;
}): Promise<{ reacted: boolean }> {
  if (!isBuiltinReactorEnabled()) {
    return { reacted: false };
  }

  const log = opts.logger ?? createLogger('info', { component: 'tui-reactor' });
  const { sessionId, action, store } = opts;

  if (action.action === 'select_row') {
    const snap = await store.getSession(sessionId);
    if (!snap) {
      log.warn({ sessionId }, 'select_row: no session');
      return { reacted: false };
    }

    const rowIndex =
      typeof action.payload.rowIndex === 'number' ? action.payload.rowIndex : -1;
    let headers: string[] = [];
    let row: string[] = actionPayloadRow(action.payload) ?? [];

    const fromTable = extractTableRow(snap.manifest, action.widgetId, rowIndex);
    if (fromTable) {
      headers = fromTable.headers;
      row = fromTable.row;
    } else if (row.length === 0) {
      log.warn({ sessionId, widgetId: action.widgetId }, 'select_row: row not found');
      return { reacted: false };
    } else {
      headers = row.map((_, i) => `Field ${i + 1}`);
    }

    const detail = detailManifest(action, headers, row);
    await store.enqueueOutbox(sessionId, detail);
    log.info(
      { sessionId, widgetId: action.widgetId, rowIndex, taskId: detail.taskId },
      'reactor pushed ephemeral detail',
    );
    return { reacted: true };
  }

  if (action.action === 'navigate_back') {
    const snap = await store.getSession(sessionId);
    if (!snap) {
      log.warn({ sessionId }, 'navigate_back: no session');
      return { reacted: false };
    }
    await store.enqueueOutbox(sessionId, snap.manifest);
    log.info({ sessionId, taskId: snap.manifest.taskId }, 'reactor re-published board');
    return { reacted: true };
  }

  return { reacted: false };
}

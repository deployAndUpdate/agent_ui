import type { TuiManifest } from '@visual-engine/tui-shared';
import { validateTuiManifest } from '@visual-engine/tui-shared';
import type { AgentWebhookBody } from './types.js';

export type MergeOpts = { forceDetail?: boolean };

/** Root-board `/prompt` (persisted). Detail `/prompt` stays ephemeral (`detail_*`). */
export function isBoardPrompt(body: AgentWebhookBody): boolean {
  if (body.payload.scope === 'board') return true;
  return body.command.trim() === '/prompt' && !body.taskId.startsWith('detail_');
}

function keepBoardTaskId(candidate: string | undefined, fallback: string): string {
  if (fallback && !fallback.startsWith('detail_')) return fallback;
  if (candidate && !candidate.startsWith('detail_')) return candidate;
  return fallback || candidate || 'board';
}

function detailTaskId(candidate: string | undefined, fallback: string): string {
  if (candidate?.startsWith('detail_')) return candidate;
  if (fallback.startsWith('detail_')) return fallback;
  return `detail_${fallback}`;
}

function asCurrentManifest(
  raw: unknown,
  fallbackTaskId: string,
  forceDetail: boolean,
): TuiManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = validateTuiManifest(raw);
  if (v.ok) {
    if (forceDetail) {
      if (v.data.taskId.startsWith('detail_')) return v.data;
    } else {
      return { ...v.data, taskId: keepBoardTaskId(v.data.taskId, fallbackTaskId) };
    }
  }
  const o = raw as {
    taskId?: unknown;
    layout?: { direction?: string; chunks?: unknown };
    chunks?: unknown;
  };
  const chunks = Array.isArray(o.layout?.chunks)
    ? o.layout.chunks
    : Array.isArray(o.chunks)
      ? o.chunks
      : null;
  if (!chunks || chunks.length === 0) return null;
  const rawTask = typeof o.taskId === 'string' ? o.taskId : undefined;
  const taskId = forceDetail
    ? detailTaskId(rawTask, fallbackTaskId)
    : keepBoardTaskId(rawTask, fallbackTaskId);
  const wrapped = {
    taskId,
    operation: 'SYNC_DASHBOARD' as const,
    layout: {
      direction: (o.layout?.direction as 'vertical' | 'horizontal' | undefined) ?? 'vertical',
      chunks,
    },
  };
  const v2 = validateTuiManifest(wrapped);
  return v2.ok ? v2.data : null;
}

/** Board currently on screen (TUI sends payload.currentDetail). */
export function currentDetailFromBody(
  body: AgentWebhookBody,
  opts?: MergeOpts,
): TuiManifest | null {
  const forceDetail = opts?.forceDetail ?? !isBoardPrompt(body);
  const fromPayload = asCurrentManifest(
    body.payload.currentDetail ?? body.payload.currentManifest,
    body.taskId,
    forceDetail,
  );
  if (fromPayload) return fromPayload;
  return asCurrentManifest(body.currentManifest, body.taskId, forceDetail);
}

/** Update matching widgetId, append new chunks. Keeps existing order. */
export function mergeDetailChunks(
  current: TuiManifest | null,
  patch: TuiManifest,
  forceDetail = true,
): TuiManifest {
  const taskId = forceDetail
    ? detailTaskId(current?.taskId, patch.taskId)
    : keepBoardTaskId(patch.taskId, current?.taskId ?? patch.taskId);
  if (!current || current.layout.chunks.length === 0) {
    return { ...patch, taskId, operation: 'SYNC_DASHBOARD' };
  }
  const byId = new Map(current.layout.chunks.map((c) => [c.widgetId, c]));
  const order = current.layout.chunks.map((c) => c.widgetId);
  for (const chunk of patch.layout.chunks) {
    if (!byId.has(chunk.widgetId)) {
      order.push(chunk.widgetId);
    }
    byId.set(chunk.widgetId, chunk);
  }
  return {
    taskId,
    operation: 'SYNC_DASHBOARD',
    layout: {
      direction: current.layout.direction ?? patch.layout.direction ?? 'vertical',
      chunks: order.map((id) => byId.get(id)!),
    },
  };
}

export function stubPromptPatch(body: AgentWebhookBody): TuiManifest {
  const focused =
    typeof body.payload.focusedWidgetId === 'string'
      ? body.payload.focusedWidgetId
      : isBoardPrompt(body)
        ? 'board'
        : 'detail';
  const text =
    (typeof body.payload.userPrompt === 'string' && body.payload.userPrompt.trim()) ||
    body.systemPrompt.trim() ||
    '(prompt)';
  const slug = focused.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
  const taskId = isBoardPrompt(body)
    ? keepBoardTaskId(undefined, body.taskId)
    : detailTaskId(body.taskId, `detail_${body.widgetId}_${String(body.payload.rowIndex ?? 0)}`);
  return {
    taskId,
    operation: 'SYNC_DASHBOARD',
    layout: {
      direction: 'vertical',
      chunks: [
        {
          widgetId: `w_prompt_${slug}`,
          type: 'Paragraph',
          size: 6,
          props: {
            title: `prompt · ${focused}`,
            text,
            style: 'green',
          },
        },
      ],
    },
  };
}

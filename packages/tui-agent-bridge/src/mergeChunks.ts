import type { TuiManifest } from '@visual-engine/tui-shared';
import { validateTuiManifest } from '@visual-engine/tui-shared';
import type { AgentWebhookBody } from './types.js';

function asDetailManifest(raw: unknown, fallbackTaskId: string): TuiManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = validateTuiManifest(raw);
  if (v.ok && v.data.taskId.startsWith('detail_')) return v.data;
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
  const taskId =
    typeof o.taskId === 'string' && o.taskId.startsWith('detail_')
      ? o.taskId
      : fallbackTaskId.startsWith('detail_')
        ? fallbackTaskId
        : `detail_${fallbackTaskId}`;
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

/** Ephemeral detail currently on screen (TUI sends payload.currentDetail). */
export function currentDetailFromBody(body: AgentWebhookBody): TuiManifest | null {
  const fromPayload = asDetailManifest(
    body.payload.currentDetail ?? body.payload.currentManifest,
    body.taskId,
  );
  if (fromPayload) return fromPayload;
  return asDetailManifest(body.currentManifest, body.taskId);
}

/** Update matching widgetId, append new chunks. Keeps existing order. */
export function mergeDetailChunks(
  current: TuiManifest | null,
  patch: TuiManifest,
): TuiManifest {
  const taskId = current?.taskId.startsWith('detail_')
    ? current.taskId
    : patch.taskId.startsWith('detail_')
      ? patch.taskId
      : `detail_${patch.taskId}`;
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
      : 'detail';
  const text =
    (typeof body.payload.userPrompt === 'string' && body.payload.userPrompt.trim()) ||
    body.systemPrompt.trim() ||
    '(prompt)';
  const slug = focused.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
  const taskId = body.taskId.startsWith('detail_')
    ? body.taskId
    : `detail_${body.widgetId}_${String(body.payload.rowIndex ?? 0)}`;
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

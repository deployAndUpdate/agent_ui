import type { TuiManifest } from '@visual-engine/tui-shared';
import type { AgentWebhookBody } from './types.js';

export function buildEnrichPrompt(body: AgentWebhookBody): string {
  const row = body.payload.row;
  const rowIndex = body.payload.rowIndex;
  return [
    body.systemPrompt || 'more details',
    '',
    'You enrich a TUI detail screen for Visual Agent Engine.',
    'Return ONLY a JSON TuiManifest (no markdown prose outside JSON).',
    'Hard rules:',
    '- operation: "SYNC_DASHBOARD"',
    `- taskId MUST start with "detail_" (prefer "${body.taskId}")`,
    '- layout.chunks types ONLY: Paragraph | Table | List | Gauge | Chart',
    '- chunk fields: widgetId, type, size (positive int), props',
    '- Prefer Paragraph/List with concrete facts about the selected row',
    '',
    `sessionId: ${body.sessionId}`,
    `widgetId: ${body.widgetId}`,
    `rowIndex: ${JSON.stringify(rowIndex ?? null)}`,
    `row: ${JSON.stringify(row ?? null)}`,
    `command: ${body.command}`,
  ].join('\n');
}

/** Deterministic enrich when no Cursor agent is available. */
export function stubEnrichManifest(body: AgentWebhookBody): TuiManifest {
  const row = Array.isArray(body.payload.row)
    ? body.payload.row.map(String)
    : [];
  const lines =
    row.length > 0
      ? row.map((cell, i) => `• col${i}: ${cell}`).join('\n')
      : '(no row payload)';
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
          widgetId: 'w_detail_title',
          type: 'Paragraph',
          size: 3,
          props: {
            title: `${body.widgetId} · enriched`,
            text: `Row ${String(body.payload.rowIndex ?? '?')} · stub bridge`,
            style: 'magenta',
          },
        },
        {
          widgetId: 'w_detail_body',
          type: 'Paragraph',
          size: 12,
          props: {
            title: 'More details',
            text: `${body.systemPrompt || 'more details'}\n\n${lines}\n\n(Set TUI_BRIDGE_DRIVER=cli|sdk + CURSOR_API_KEY for real agent enrich)`,
            style: 'cyan',
          },
        },
        {
          widgetId: 'w_detail_hint',
          type: 'Paragraph',
          size: 2,
          props: {
            title: 'Nav',
            text: 'Esc → board',
            style: 'white',
          },
        },
      ],
    },
  };
}
